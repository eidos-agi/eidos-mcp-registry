"""
Discovery: find all MCP servers from claude config and repo directories.

Sources run in parallel:
  1. `claude mcp list` — servers at user scope (slow — subprocess)
  2. Config files (~/.claude.json) — fast disk read
  3. ~/repos-*/ directories → auto-create groups (fast disk scan)

All three fire simultaneously. The UI shows three lanes resolving independently.
"""

import json
import logging
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

logger = logging.getLogger("mcp_registry.scanner")


def scan_claude_mcp_list() -> dict[str, dict]:
    """Parse `claude mcp list` output into server configs."""
    servers = {}
    try:
        result = subprocess.run(
            ["claude", "mcp", "list"],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            logger.warning("claude mcp list failed: %s", result.stderr)
            return servers

        current_name = None
        current = {}
        for line in result.stdout.splitlines():
            line = line.strip()
            if not line:
                if current_name:
                    servers[current_name] = current
                    current_name = None
                    current = {}
                continue

            name_match = re.match(r'^(\S+?):\s*(stdio|sse|streamable-http)', line, re.IGNORECASE)
            if name_match:
                if current_name:
                    servers[current_name] = current
                current_name = name_match.group(1)
                current = {
                    "name": current_name,
                    "type": name_match.group(2).lower(),
                    "source_scope": "user",
                }
                continue

            kv = re.match(r'^(\w[\w\s]*?):\s*(.+)', line)
            if kv and current_name:
                key = kv.group(1).strip().lower().replace(" ", "_")
                val = kv.group(2).strip()
                if key == "command":
                    current["command"] = val
                elif key == "args":
                    try:
                        current["args"] = json.loads(val)
                    except json.JSONDecodeError:
                        current["args"] = val.split()
                elif key == "status":
                    if "connected" in val.lower():
                        current["health"] = "connected"
                    elif "failed" in val.lower():
                        current["health"] = "failed"
                    else:
                        current["health"] = val.lower()
                elif key == "scope":
                    current["source_scope"] = val.lower()

        if current_name:
            servers[current_name] = current

    except FileNotFoundError:
        logger.warning("claude CLI not found")
    except subprocess.TimeoutExpired:
        logger.warning("claude mcp list timed out")

    return servers


def scan_claude_json() -> dict[str, dict]:
    """Read servers from ~/.claude.json if it exists."""
    servers = {}
    claude_json = Path.home() / ".claude.json"
    if not claude_json.exists():
        return servers

    try:
        with open(claude_json) as f:
            data = json.load(f)
        mcp_servers = data.get("mcpServers", {})
        for name, config in mcp_servers.items():
            entry = {
                "name": name,
                "type": config.get("type", "stdio"),
                "command": config.get("command", ""),
                "args": config.get("args", []),
                "env": config.get("env", {}),
                "source_scope": "user",
            }
            # HTTP/SSE servers need url and headers
            if config.get("url"):
                entry["url"] = config["url"]
            if config.get("headers"):
                entry["headers"] = config["headers"]
            servers[name] = entry
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Failed to read ~/.claude.json: %s", e)

    return servers


def discover_repo_groups() -> dict[str, dict]:
    """Find ~/repos-*/ directories and create group entries."""
    groups = {}
    home = Path.home()
    for d in sorted(home.iterdir()):
        if d.is_dir() and d.name.startswith("repos-"):
            key = d.name
            label = key.replace("repos-", "").replace("-", " ").title()
            groups[key] = {
                "label": label,
                "path": str(d),
                "servers": [],
            }
    return groups


def list_repos_in_group(group_path: str) -> list[str]:
    """List git repos inside a group directory."""
    repos = []
    p = Path(group_path).expanduser()
    if not p.is_dir():
        return repos
    for d in sorted(p.iterdir()):
        if d.is_dir() and (d / ".git").exists():
            repos.append(str(d))
    return repos


def _scan_groups_with_counts() -> tuple[dict, list[dict]]:
    """Discover groups and count repos in each."""
    repo_groups = discover_repo_groups()
    group_details = []
    for key, group in repo_groups.items():
        repos = list_repos_in_group(group["path"]) if group.get("path") else []
        group_details.append({
            "key": key,
            "label": group["label"],
            "path": group.get("path"),
            "repos": len(repos),
        })
    return repo_groups, group_details


def full_scan(store, on_progress=None) -> dict:
    """Run all discovery sources in parallel. Returns summary.

    Fires three threads simultaneously:
      - CLI:    `claude mcp list` (slowest — subprocess + health checks)
      - Config: `~/.claude.json` (fast)
      - Groups: `~/repos-*/` directory scan (fast)

    on_progress emits events per-lane so the UI can show parallel progress.
    """
    def emit(step, detail="", **kw):
        if on_progress:
            on_progress({"step": step, "detail": detail, **kw})

    emit("parallel_start", "Launching 3 discovery sources in parallel...")

    # Fire all three lanes simultaneously
    cli_servers = {}
    json_servers = {}
    repo_groups = {}
    group_details = []

    with ThreadPoolExecutor(max_workers=3, thread_name_prefix="scan") as pool:
        futures = {
            pool.submit(scan_claude_mcp_list): "cli",
            pool.submit(scan_claude_json): "config",
            pool.submit(_scan_groups_with_counts): "groups",
        }

        # Emit start for all three lanes at once
        emit("lane_start", "Running claude mcp list...", lane="cli",
             label="CLI Discovery")
        emit("lane_start", "Reading ~/.claude.json...", lane="config",
             label="Config Files")
        emit("lane_start", "Scanning ~/repos-*/ directories...", lane="groups",
             label="Repo Groups")

        # As each completes, emit its result
        for future in as_completed(futures):
            lane = futures[future]
            try:
                result = future.result()
                if lane == "cli":
                    cli_servers = result
                    emit("lane_done", f"{len(cli_servers)} servers from CLI",
                         lane="cli", servers=sorted(cli_servers.keys()),
                         count=len(cli_servers))
                elif lane == "config":
                    json_servers = result
                    emit("lane_done", f"{len(json_servers)} servers from config",
                         lane="config", servers=sorted(json_servers.keys()),
                         count=len(json_servers))
                elif lane == "groups":
                    repo_groups, group_details = result
                    total_repos = sum(g["repos"] for g in group_details)
                    emit("lane_done",
                         f"{len(repo_groups)} groups, {total_repos} repos",
                         lane="groups", groups=group_details,
                         count=len(repo_groups), total_repos=total_repos)
            except Exception as e:
                emit("lane_error", str(e), lane=lane)
                logger.exception("Scan lane %s failed", lane)

    # Merge phase
    all_servers = {**json_servers, **cli_servers}
    emit("merge_start", f"Merging {len(all_servers)} unique servers...")

    if all_servers:
        store.upsert_servers_bulk(all_servers)

    for key, group in repo_groups.items():
        store.create_group(key, group["label"], group["path"])

    emit("merge_done", f"{len(all_servers)} servers, {len(repo_groups)} groups ready",
         servers_found=len(all_servers), groups_found=len(repo_groups))

    return {
        "servers_found": len(all_servers),
        "groups_found": len(repo_groups),
        "server_names": sorted(all_servers.keys()),
        "group_details": group_details,
    }
