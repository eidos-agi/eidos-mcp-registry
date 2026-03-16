"""
FastAPI server on :19285 — REST + SSE for the MCP Registry.
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from mcp_registry.store import RegistryStore
from mcp_registry.events import AsyncEventBus, sse_generator, wire_store_to_bus
from mcp_registry.scanner import full_scan
from mcp_registry.health import health_monitor
from mcp_registry.deployer import preview as deploy_preview, deploy as deploy_execute
from mcp_registry.deployer import check_gitignore_status, add_gitignore_bulk, remove_from_user_scope
from mcp_registry import activity
from mcp_registry import webhook
from mcp_registry import deploy_history
from mcp_registry import catalog as catalog_mod
from mcp_registry import notifications
from mcp_registry import detector
from mcp_registry.renderer import REGISTRY_HTML

import sys

logger = logging.getLogger("mcp_registry.server")

_store: RegistryStore | None = None
_bus: AsyncEventBus | None = None
_health_task: asyncio.Task | None = None
_deploy_lock: asyncio.Lock | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _store, _bus, _health_task, _deploy_lock

    _store = RegistryStore()
    _bus = AsyncEventBus()
    _deploy_lock = asyncio.Lock()
    _bus.set_loop(asyncio.get_event_loop())
    # NOTE: We intentionally do NOT wire_store_to_bus here.
    # Store mutations (upsert, assign, health) were flooding SSE with events
    # that triggered loadData() loops in the client. Instead, scan_progress
    # and deploy_progress are published explicitly where needed.

    _store.validate_groups()

    # Initial scan in executor
    loop = asyncio.get_event_loop()
    summary = await loop.run_in_executor(None, full_scan, _store, None)
    logger.info("Initial scan: %d servers, %d groups",
                summary["servers_found"], summary["groups_found"])

    # Run initial notification detection
    try:
        det_count = await loop.run_in_executor(None, detector.run_all_detections, _store)
        if det_count:
            logger.info("Initial detection: %d notification(s) created", det_count)
    except Exception as e:
        logger.warning("Initial detection failed: %s", e)

    # Start health monitor
    _health_task = asyncio.create_task(health_monitor(_store))

    yield

    # Shutdown
    if _health_task:
        _health_task.cancel()
        try:
            await _health_task
        except asyncio.CancelledError:
            pass
    _store = None
    _bus = None


app = FastAPI(title="Eidos MCP Registry", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files (JS)
_static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")


# ── Models ───────────────────────────────────────────────────────

class AssignRequest(BaseModel):
    server: str
    group: str

class GroupCreateRequest(BaseModel):
    key: str
    label: str
    path: str | None = None

class DeployRequest(BaseModel):
    groups: list[str] | None = None  # None = all eligible groups

class GroupServerConfigRequest(BaseModel):
    server: str
    config: dict  # e.g. {"env": {"SUPABASE_URL": "https://staging.supabase.co"}}

class DependenciesRequest(BaseModel):
    depends_on: list[str]

class WebhookRequest(BaseModel):
    url: str


# ── HTML ─────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index():
    return REGISTRY_HTML


# ── Health ───────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "servers": _store.server_count(), "groups": _store.group_count()}


# ── Server Catalog ──────────────────────────────────────────────

@app.get("/server-catalog")
async def get_server_catalog():
    """Return the metadata catalog for all known MCP servers."""
    catalog_path = Path(__file__).parent / "server_catalog.json"
    if catalog_path.exists():
        with open(catalog_path) as f:
            return json.load(f)
    return JSONResponse({"error": "Catalog not found"}, status_code=404)


TOOL_COUNTS = {
    "taskr": 102, "helios": 41, "github": 38, "rhea-diagrams": 37,
    "railguey": 36, "wrike": 29, "backlog": 23, "pal": 18,
    "keeper": 16, "claude-resume": 15, "reeves-messages": 14,
    "outlook": 13, "eidos-mail": 10, "reeves-comms": 9,
    "director-daemon": 8, "cerebro-mcp": 7, "reeves-global": 7,
    "eidos": 6, "reeves-view": 6, "eidos-test-forge": 5,
    "eidos-book-forge": 5, "eidos-elt-forge": 5, "elt-forge": 5,
    "vercel": 5, "eidos-image-forge": 4, "eidos-consent": 3,
    "context7": 2,
}
TOKENS_PER_TOOL = 250


@app.get("/token-budget")
async def token_budget():
    """Compute token budgets per server, per group, and combined."""
    snapshot = _store.snapshot()
    groups = snapshot["groups"]
    all_servers = snapshot["servers"]

    # Per-server tokens
    server_tokens = {}
    for name in all_servers:
        tools = TOOL_COUNTS.get(name, 5)
        server_tokens[name] = {
            "tools": tools,
            "tokens": tools * TOKENS_PER_TOOL,
            "cost_per_msg": round(tools * TOKENS_PER_TOOL / 1_000_000 * 3, 4),
        }

    total_tools = sum(s["tools"] for s in server_tokens.values())
    total_tokens = total_tools * TOKENS_PER_TOOL

    # Global budget
    universal = groups.get("__universal__", {}).get("servers", [])
    global_tools = sum(TOOL_COUNTS.get(s, 5) for s in universal)
    global_tokens = global_tools * TOKENS_PER_TOOL

    # Per-group budget (own + global)
    group_budgets = {}
    for gk, g in groups.items():
        if gk == "__universal__":
            continue
        own_servers = g.get("servers", [])
        if not own_servers and not universal:
            continue
        own_tools = sum(TOOL_COUNTS.get(s, 5) for s in own_servers)
        own_tokens = own_tools * TOKENS_PER_TOOL
        combined_tools = global_tools + own_tools
        combined_tokens = global_tokens + own_tokens
        group_budgets[gk] = {
            "label": g.get("label", gk),
            "own_servers": len(own_servers),
            "own_tools": own_tools,
            "own_tokens": own_tokens,
            "global_servers": len(universal),
            "global_tools": global_tools,
            "global_tokens": global_tokens,
            "total_servers": len(own_servers) + len(universal),
            "total_tools": combined_tools,
            "total_tokens": combined_tokens,
            "cost_per_msg": round(combined_tokens / 1_000_000 * 3, 4),
            "servers": sorted(own_servers),
        }

    # Averages and savings
    active_groups = [g for g in group_budgets.values() if g["own_servers"] > 0]
    avg_tools = int(sum(g["total_tools"] for g in active_groups) / len(active_groups)) if active_groups else total_tools
    avg_tokens = avg_tools * TOKENS_PER_TOOL
    savings_pct = round((1 - avg_tools / total_tools) * 100) if total_tools else 0
    monthly_savings = round((total_tokens - avg_tokens) / 1_000_000 * 3 * 100 * 30)

    return {
        "unscoped": {
            "servers": len(all_servers),
            "tools": total_tools,
            "tokens": total_tokens,
            "cost_per_msg": round(total_tokens / 1_000_000 * 3, 4),
        },
        "global": {
            "servers": len(universal),
            "tools": global_tools,
            "tokens": global_tokens,
            "cost_per_msg": round(global_tokens / 1_000_000 * 3, 4),
            "server_list": sorted(universal),
        },
        "groups": group_budgets,
        "scoped_average": {
            "tools": avg_tools,
            "tokens": avg_tokens,
            "cost_per_msg": round(avg_tokens / 1_000_000 * 3, 4),
        },
        "savings": {
            "pct": savings_pct,
            "tokens_per_msg": total_tokens - avg_tokens,
            "monthly_usd": monthly_savings,
        },
        "servers": server_tokens,
    }


@app.get("/server-catalog/completeness")
async def catalog_completeness():
    """Completeness scores for all servers in the catalog."""
    catalog_path = Path(__file__).parent / "server_catalog.json"
    if not catalog_path.exists():
        return JSONResponse({"error": "Catalog not found"}, status_code=404)

    with open(catalog_path) as f:
        cat = json.load(f)

    servers_scores = []
    for name, entry in (cat.get("servers") or {}).items():
        comp = catalog_mod.compute_completeness(entry)
        servers_scores.append({"server": name, **comp})

    total = len(servers_scores)
    avg_score = round(sum(s["score"] for s in servers_scores) / total) if total else 0
    grade_counts = {}
    for s in servers_scores:
        grade_counts[s["grade"]] = grade_counts.get(s["grade"], 0) + 1

    return {
        "total": total,
        "average_score": avg_score,
        "grades": grade_counts,
        "servers": servers_scores,
    }


@app.post("/server-catalog/enrich")
async def enrich_catalog():
    """Auto-enrich all servers from filesystem inspection."""
    catalog_path = Path(__file__).parent / "server_catalog.json"
    if not catalog_path.exists():
        return JSONResponse({"error": "Catalog not found"}, status_code=404)

    with open(catalog_path) as f:
        cat = json.load(f)

    # Read claude.json for server configs
    claude_json_path = Path.home() / ".claude.json"
    claude_json = {}
    if claude_json_path.exists():
        try:
            with open(claude_json_path) as f:
                claude_json = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    import asyncio
    loop = asyncio.get_event_loop()
    updated_cat = await loop.run_in_executor(
        None, catalog_mod.enrich_all, cat, claude_json
    )

    # Save updated catalog
    with open(catalog_path, "w") as f:
        json.dump(updated_cat, f, indent=2)

    # Compute new completeness scores
    servers_scores = []
    for name, entry in (updated_cat.get("servers") or {}).items():
        comp = catalog_mod.compute_completeness(entry)
        servers_scores.append({"server": name, **comp})

    activity.log_event("catalog_enrich", {"servers_enriched": len(servers_scores)})
    return {"ok": True, "servers": servers_scores}


# ── Servers ──────────────────────────────────────────────────────

@app.get("/servers")
async def get_servers():
    return _store.servers


@app.get("/servers/{name}")
async def get_server(name: str):
    servers = _store.servers
    if name not in servers:
        return JSONResponse({"error": "Server not found"}, status_code=404)
    return servers[name]


@app.put("/servers/{name}")
async def update_server(name: str, body: dict):
    servers = _store.servers
    if name not in servers:
        return JSONResponse({"error": "Server not found"}, status_code=404)
    _store.upsert_server(name, body)
    activity.log_event("config_change", {"server": name})
    return {"ok": True, "server": name}


# ── Dependencies ─────────────────────────────────────────────────

@app.put("/servers/{name}/dependencies")
async def set_dependencies(name: str, req: DependenciesRequest):
    ok = _store.set_dependencies(name, req.depends_on)
    if not ok:
        return JSONResponse({"error": "Server not found"}, status_code=404)
    activity.log_event("dependencies_changed", {"server": name, "depends_on": req.depends_on})
    return {"ok": True, "server": name, "depends_on": req.depends_on}


@app.get("/servers/{name}/dependencies")
async def get_dependencies(name: str):
    deps = _store.get_dependencies(name)
    if deps is None:
        return JSONResponse({"error": "Server not found"}, status_code=404)
    return {"server": name, "depends_on": deps}


# ── Groups ───────────────────────────────────────────────────────

@app.get("/groups")
async def get_groups():
    return _store.groups


@app.post("/groups")
async def create_group(req: GroupCreateRequest):
    ok = _store.create_group(req.key, req.label, req.path)
    if not ok:
        return JSONResponse({"error": "Group already exists"}, status_code=409)
    return {"ok": True, "group": req.key}


# ── Assignments ──────────────────────────────────────────────────

@app.post("/assign")
async def assign_server(req: AssignRequest):
    ok = _store.assign(req.server, req.group)
    if not ok:
        return JSONResponse({"error": "Invalid server or group"}, status_code=400)
    activity.log_event("assign", {"server": req.server, "group": req.group})
    return {"ok": True}


@app.post("/unassign")
async def unassign_server(req: AssignRequest):
    ok = _store.unassign(req.server, req.group)
    if not ok:
        return JSONResponse({"error": "Server not in group"}, status_code=400)
    activity.log_event("unassign", {"server": req.server, "group": req.group})
    return {"ok": True}


@app.get("/unassigned")
async def unassigned():
    return _store.unassigned_servers()


# ── Group Server Config ──────────────────────────────────────────

@app.put("/groups/{group_key}/servers/{server_name}/config")
async def set_group_server_config(group_key: str, server_name: str,
                                  req: GroupServerConfigRequest):
    ok = _store.set_group_server_config(group_key, server_name, req.config)
    if not ok:
        return JSONResponse({"error": "Group not found"}, status_code=404)
    return {"ok": True, "group": group_key, "server": server_name}


@app.get("/groups/{group_key}/servers/{server_name}/config")
async def get_group_server_config(group_key: str, server_name: str):
    config = _store.get_group_server_config(group_key, server_name)
    return {"group": group_key, "server": server_name, "config": config}


# ── Scan ─────────────────────────────────────────────────────────

@app.post("/scan")
async def scan():
    """Fire-and-forget scan subprocess. Returns immediately, progress via SSE."""
    asyncio.create_task(_run_scan_subprocess())
    return {"ok": True, "status": "scan_started"}


async def _run_scan_subprocess():
    """Spawn scan_worker as a child process, read JSON progress lines, publish to SSE.

    Uses create_subprocess_exec with a fixed arg list (no shell, no user input).
    """
    worker = str(Path(__file__).parent / "scan_worker.py")
    proc = await asyncio.create_subprocess_exec(
        sys.executable, worker,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    async for raw_line in proc.stdout:
        line = raw_line.decode().strip()
        if not line:
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            logger.warning("scan_worker bad line: %s", line)
            continue

        if data.get("step") == "result":
            # Bulk upsert — single save + single notify instead of N
            servers = data.get("servers", {})
            if servers:
                _store.upsert_servers_bulk(servers)
            for key, group in data.get("groups", {}).items():
                _store.create_group(key, group["label"], group.get("path"))
        else:
            if _bus:
                _bus.publish("registry", json.dumps({"event": "scan_progress", **data}))

    await proc.wait()
    if proc.returncode != 0:
        stderr_bytes = await proc.stderr.read()
        logger.error("scan_worker exit %d: %s", proc.returncode, stderr_bytes.decode())


# ── Deploy ───────────────────────────────────────────────────────

@app.post("/deploy/preview")
async def deploy_preview_endpoint():
    loop = asyncio.get_event_loop()
    changes = await loop.run_in_executor(None, deploy_preview, _store)
    return {
        "changes": len(changes),
        "files": {path: {
                    "action": c["action"],
                    "servers": c["servers"],
                    "group": c["group"],
                    "content": c["content"],
                    "existing_content": c.get("existing_content"),
                    "gitignored": c.get("gitignored", False),
                    "unmanaged_kept": c.get("unmanaged_kept", []),
                    "servers_added": c.get("servers_added", []),
                    "servers_updated": c.get("servers_updated", []),
                    "servers_removed": c.get("servers_removed", []),
                    "unmet_dependencies": c.get("unmet_dependencies", {}),
                  } for path, c in changes.items()},
    }


def _get_groups_from_results(results: dict) -> list[str]:
    """Extract unique group keys from deploy results (used when deploying all)."""
    # Deploy results don't carry group info, but we can infer from the store
    # For the webhook use case, the caller should pass explicit groups.
    return []


@app.post("/deploy")
async def deploy_endpoint(req: DeployRequest | None = None):
    if _deploy_lock and _deploy_lock.locked():
        return JSONResponse(
            {"error": "Deploy already in progress"},
            status_code=409,
        )

    async with _deploy_lock:
        selected_groups = req.groups if req else None

        # Snapshot before deploy for rollback
        loop = asyncio.get_event_loop()
        try:
            changes_for_snapshot = await loop.run_in_executor(None, deploy_preview, _store)
            if changes_for_snapshot:
                await loop.run_in_executor(
                    None, deploy_history.snapshot_before_deploy, changes_for_snapshot
                )
        except Exception as e:
            logger.warning("Failed to create deploy snapshot: %s", e)

        def on_progress(info):
            if _bus:
                _bus.publish("registry", json.dumps({"event": "deploy_progress", **info}))

        results = await loop.run_in_executor(
            None, deploy_execute, _store, on_progress, selected_groups
        )
        written_count = len(results.get("written", []))
        error_count = len(results.get("errors", []))
        activity.log_event("deploy", {
            "groups": selected_groups,
            "written": written_count,
            "errors": error_count,
        })

        # Fire webhooks for each deployed group
        deployed_groups = selected_groups or _get_groups_from_results(results)
        for gk in (deployed_groups or []):
            webhook.notify_deploy(_store, gk, written_count, error_count)

        return results


# ── Verify (post-deploy drift check) ─────────────────────────────

@app.post("/verify/{group_key}")
async def verify_group(group_key: str):
    """Check if deployed .mcp.json files still match registry intent."""
    loop = asyncio.get_event_loop()
    changes = await loop.run_in_executor(None, deploy_preview, _store)
    # Filter to this group
    group_changes = {k: v for k, v in changes.items() if v["group"] == group_key}
    if not group_changes:
        return {"status": "up_to_date", "group": group_key, "drift": 0}
    return {
        "status": "drifted",
        "group": group_key,
        "drift": len(group_changes),
        "files": list(group_changes.keys())[:10],
    }


# ── Activity ─────────────────────────────────────────────────────

@app.get("/activity")
async def get_activity(limit: int = 50):
    return activity.get_events(limit)


# ── Deploy History & Rollback ────────────────────────────────────

@app.get("/deploy/history")
async def get_deploy_history(limit: int = 20):
    return deploy_history.list_history(limit)


@app.post("/deploy/rollback/{snapshot_id}")
async def rollback_deploy(snapshot_id: str):
    result = deploy_history.rollback(snapshot_id)
    if "error" in result:
        return JSONResponse({"error": result["error"]}, status_code=404)
    activity.log_event("deploy", {"action": "rollback", "snapshot_id": snapshot_id, **result})
    return result


# ── Gitignore Bulk ───────────────────────────────────────────────

@app.post("/groups/{group_key}/gitignore")
async def add_gitignore(group_key: str):
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, add_gitignore_bulk, _store, group_key)
    if "error" in result:
        return JSONResponse({"error": result["error"]}, status_code=404)
    activity.log_event("gitignore_bulk", {"group": group_key, **result})
    return result


@app.get("/groups/{group_key}/gitignore")
async def get_gitignore_status(group_key: str):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, check_gitignore_status, _store, group_key)


# ── User Scope Management ────────────────────────────────────────


@app.get("/scope-audit")
async def scope_audit():
    """Full audit of every server's scope status across all layers."""
    import json as _json
    snapshot = _store.snapshot()
    all_servers = snapshot["servers"]
    groups = snapshot["groups"]
    universal = set(groups.get("__universal__", {}).get("servers", []))

    # Read user scope
    claude_json = Path.home() / ".claude.json"
    user_scope_servers = set()
    if claude_json.exists():
        try:
            with open(claude_json) as f:
                user_data = _json.load(f)
            user_scope_servers = set(user_data.get("mcpServers", {}).keys())
        except (ValueError, OSError):
            pass

    # Build per-server audit
    audit = []
    for name in sorted(all_servers.keys()):
        # Which groups is this server in?
        assigned_groups = []
        for gk, g in groups.items():
            if name in (g.get("servers") or []):
                assigned_groups.append({
                    "key": gk,
                    "label": g.get("label", gk),
                    "is_universal": gk == "__universal__",
                })

        in_user_scope = name in user_scope_servers
        in_universal = name in universal
        in_groups = [g for g in assigned_groups if not g["is_universal"]]

        # Determine scope status
        if in_universal and in_user_scope:
            status = "global_user"
            status_label = "Global + User Scope"
            action = "none"
            detail = "Available everywhere via both user scope and project .mcp.json. This is correct for global servers."
        elif in_universal and not in_user_scope:
            status = "global_project_only"
            status_label = "Global (project-only)"
            action = "warn"
            detail = "In universal group but missing from ~/.claude.json. Repos without .mcp.json won't see it."
        elif in_groups and in_user_scope:
            status = "needs_promote"
            status_label = "Leaking to all projects"
            action = "promote"
            group_names = ", ".join(g["label"] for g in in_groups)
            detail = f"Assigned to {group_names} but still in ~/.claude.json user scope. Visible in EVERY project, defeating scoping."
        elif in_groups and not in_user_scope:
            status = "scoped"
            status_label = "Properly scoped"
            action = "none"
            group_names = ", ".join(g["label"] for g in in_groups)
            detail = f"Only delivered to: {group_names}. Not in user scope. This is correct."
        elif not assigned_groups:
            if in_user_scope:
                status = "unassigned_user"
                status_label = "Unassigned (user scope)"
                action = "assign"
                detail = "Not assigned to any group. Still in ~/.claude.json, visible everywhere. Assign to a group or add to Global."
            else:
                status = "unassigned_orphan"
                status_label = "Unassigned (orphaned)"
                action = "assign"
                detail = "Not assigned to any group and not in user scope. Only exists in registry. Assign to a group to activate."
        else:
            status = "unknown"
            status_label = "Unknown"
            action = "review"
            detail = "Unexpected state."

        audit.append({
            "server": name,
            "status": status,
            "status_label": status_label,
            "action": action,
            "detail": detail,
            "in_user_scope": in_user_scope,
            "in_universal": in_universal,
            "groups": assigned_groups,
            "type": all_servers[name].get("type", "stdio"),
            "health": all_servers[name].get("health", "unknown"),
        })

    # Summary counts
    summary = {
        "total": len(audit),
        "properly_scoped": len([a for a in audit if a["status"] == "scoped"]),
        "needs_promote": len([a for a in audit if a["status"] == "needs_promote"]),
        "global": len([a for a in audit if a["status"].startswith("global")]),
        "unassigned": len([a for a in audit if a["status"].startswith("unassigned")]),
    }

    return {"summary": summary, "servers": audit}


class PromoteRequest(BaseModel):
    servers: list[str]


@app.post("/promote")
async def promote_to_project_scope(req: PromoteRequest):
    """Remove servers from ~/.claude.json user scope.

    After deploying to project .mcp.json, servers should be removed from
    user scope so they only appear in the right project context.
    """
    result = remove_from_user_scope(req.servers)
    if "error" in result:
        return JSONResponse({"error": result["error"]}, status_code=500)
    if result["removed"]:
        activity.log_event("promote", {
            "removed_from_user_scope": result["removed"],
            "count": len(result["removed"]),
        })
    return result


@app.post("/promote/all")
async def promote_all_assigned():
    """Remove ALL group-assigned servers from user scope.

    Keeps only __universal__ servers in ~/.claude.json.
    Everything else should live in project .mcp.json only.
    """
    snapshot = _store.snapshot()
    universal = set(snapshot["groups"].get("__universal__", {}).get("servers", []))
    all_assigned = set()
    for key, group in snapshot["groups"].items():
        if key == "__universal__":
            continue
        all_assigned.update(group.get("servers", []))

    # Only remove servers that are assigned to non-universal groups
    to_remove = sorted(all_assigned - universal)
    if not to_remove:
        return {"removed": [], "message": "No servers to promote"}

    result = remove_from_user_scope(to_remove)
    if "error" in result:
        return JSONResponse({"error": result["error"]}, status_code=500)
    if result["removed"]:
        activity.log_event("promote", {
            "removed_from_user_scope": result["removed"],
            "count": len(result["removed"]),
        })
    return result


# ── Webhooks ─────────────────────────────────────────────────────

@app.put("/groups/{group_key}/webhook")
async def set_webhook(group_key: str, req: WebhookRequest):
    ok = _store.set_webhook(group_key, req.url)
    if not ok:
        return JSONResponse({"error": "Group not found"}, status_code=404)
    activity.log_event("webhook_config", {"group": group_key, "action": "set", "url": req.url})
    return {"ok": True, "group": group_key, "webhook_url": req.url}


@app.get("/groups/{group_key}/webhook")
async def get_webhook(group_key: str):
    url = _store.get_webhook(group_key)
    return {"group": group_key, "webhook_url": url}


@app.delete("/groups/{group_key}/webhook")
async def delete_webhook(group_key: str):
    ok = _store.delete_webhook(group_key)
    if not ok:
        return JSONResponse({"error": "Group not found"}, status_code=404)
    activity.log_event("webhook_config", {"group": group_key, "action": "removed"})
    return {"ok": True, "group": group_key}


# ── Notifications ────────────────────────────────────────────────

@app.get("/notifications")
async def get_notifications(status: str = "pending"):
    return notifications.get_notifications(status)


@app.get("/notifications/count")
async def notification_count():
    return notifications.count_pending()


@app.post("/notifications/{nid}/approve")
async def approve_notification(nid: str):
    result = notifications.approve_notification(nid)
    if not result:
        return JSONResponse({"error": "Not found"}, status_code=404)
    n = result.get("notification", {})
    activity.log_event("notification_approved", {
        "title": n.get("title", ""),
        "type": n.get("type", ""),
        "priority": n.get("priority", ""),
    })
    return result


@app.post("/notifications/{nid}/audit")
async def record_audit(nid: str, body: dict):
    """Record the result of an approved action for proof."""
    ok = notifications.record_audit(nid, body)
    if not ok:
        return JSONResponse({"error": "Not found"}, status_code=404)
    activity.log_event("notification_audit", {
        "action": body.get("action_taken", ""),
        "endpoint": body.get("endpoint", ""),
        "has_error": "error" in body,
    })
    return {"ok": True}


@app.post("/notifications/{nid}/dismiss")
async def dismiss_notification(nid: str):
    result = notifications.dismiss_notification(nid)
    if not result:
        return JSONResponse({"error": "Not found"}, status_code=404)
    n = result or {}
    activity.log_event("notification_dismissed", {
        "title": n.get("title", ""),
        "type": n.get("type", ""),
    })
    return result


@app.post("/notifications/detect")
async def run_detection():
    """Manually trigger detection scan."""
    loop = asyncio.get_event_loop()
    count = await loop.run_in_executor(None, detector.run_all_detections, _store)
    return {"detected": count}


# ── SSE ──────────────────────────────────────────────────────────

@app.get("/events")
async def events():
    initial = json.dumps(_store.snapshot_lite())
    return StreamingResponse(
        sse_generator(_bus, "registry", initial_data=initial),
        media_type="text/event-stream",
    )
