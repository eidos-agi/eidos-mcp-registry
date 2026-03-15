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


# ── HTML ─────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index():
    return REGISTRY_HTML


# ── Health ───────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "servers": _store.server_count(), "groups": _store.group_count()}


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
    return {"ok": True, "server": name}


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
    return {"ok": True}


@app.post("/unassign")
async def unassign_server(req: AssignRequest):
    ok = _store.unassign(req.server, req.group)
    if not ok:
        return JSONResponse({"error": "Server not in group"}, status_code=400)
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
                    "gitignored": c.get("gitignored", False),
                    "unmanaged_kept": c.get("unmanaged_kept", []),
                    "servers_added": c.get("servers_added", []),
                    "servers_updated": c.get("servers_updated", []),
                    "servers_removed": c.get("servers_removed", []),
                  } for path, c in changes.items()},
    }


@app.post("/deploy")
async def deploy_endpoint(req: DeployRequest | None = None):
    if _deploy_lock and _deploy_lock.locked():
        return JSONResponse(
            {"error": "Deploy already in progress"},
            status_code=409,
        )

    async with _deploy_lock:
        selected_groups = req.groups if req else None

        def on_progress(info):
            if _bus:
                _bus.publish("registry", json.dumps({"event": "deploy_progress", **info}))

        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            None, deploy_execute, _store, on_progress, selected_groups
        )
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


# ── SSE ──────────────────────────────────────────────────────────

@app.get("/events")
async def events():
    initial = json.dumps(_store.snapshot_lite())
    return StreamingResponse(
        sse_generator(_bus, "registry", initial_data=initial),
        media_type="text/event-stream",
    )
