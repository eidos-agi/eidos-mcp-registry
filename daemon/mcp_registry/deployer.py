"""
Deploy MCP configurations to repo .mcp.json files.

For each group with a path, iterates git repos and writes
the effective server set as .mcp.json.
"""

import json
import logging
import subprocess
from pathlib import Path

from mcp_registry.scanner import list_repos_in_group

logger = logging.getLogger("mcp_registry.deployer")


def _build_mcp_json(server_names: list[str], all_servers: dict) -> dict:
    """Build .mcp.json content for a list of server names."""
    mcp_servers = {}
    for name in server_names:
        srv = all_servers.get(name, {})
        entry = {}
        if srv.get("type"):
            entry["type"] = srv["type"]
        if srv.get("command"):
            entry["command"] = srv["command"]
        if srv.get("args"):
            entry["args"] = srv["args"]
        if srv.get("env"):
            entry["env"] = srv["env"]
        if srv.get("url"):
            entry["url"] = srv["url"]
        mcp_servers[name] = entry
    return {"mcpServers": mcp_servers}


def preview(store) -> dict:
    """Dry-run: compute what would be written per repo."""
    snapshot = store.snapshot()
    all_servers = snapshot["servers"]
    groups = snapshot["groups"]
    changes = {}

    for group_key, group in groups.items():
        if group_key == "__universal__" or not group.get("path"):
            continue
        repos = list_repos_in_group(group["path"])
        for repo in repos:
            effective = store.effective_servers(repo, group_key)
            if not effective:
                continue
            mcp_json = _build_mcp_json(effective, all_servers)
            mcp_path = str(Path(repo) / ".mcp.json")

            # Check if different from existing
            existing = None
            if Path(mcp_path).exists():
                try:
                    with open(mcp_path) as f:
                        existing = json.load(f)
                except (json.JSONDecodeError, OSError):
                    pass

            if existing != mcp_json:
                changes[mcp_path] = {
                    "repo": repo,
                    "group": group_key,
                    "servers": effective,
                    "content": mcp_json,
                    "action": "update" if existing else "create",
                }

    return changes


def deploy(store, on_progress=None) -> dict:
    """Write .mcp.json files and optionally remove servers from user scope."""
    changes = preview(store)
    results = {"written": [], "errors": [], "removed_from_user": []}

    total = len(changes)
    for i, (mcp_path, change) in enumerate(changes.items()):
        try:
            with open(mcp_path, "w") as f:
                json.dump(change["content"], f, indent=2)
                f.write("\n")
            results["written"].append(mcp_path)
            if on_progress:
                on_progress({
                    "step": "write",
                    "path": mcp_path,
                    "progress": i + 1,
                    "total": total,
                })
        except OSError as e:
            results["errors"].append({"path": mcp_path, "error": str(e)})
            logger.error("Failed to write %s: %s", mcp_path, e)

    # Remove deployed servers from user scope
    snapshot = store.snapshot()
    deployed_servers = set()
    for change in changes.values():
        deployed_servers.update(change["servers"])

    # Only remove servers that are source_scope=user and now assigned to a group
    for name in deployed_servers:
        srv = snapshot["servers"].get(name, {})
        if srv.get("source_scope") == "user":
            try:
                subprocess.run(
                    ["claude", "mcp", "remove", "-s", "user", name],
                    capture_output=True, text=True, timeout=10,
                )
                results["removed_from_user"].append(name)
                if on_progress:
                    on_progress({"step": "remove_user", "server": name})
            except (subprocess.TimeoutExpired, FileNotFoundError) as e:
                logger.warning("Failed to remove %s from user scope: %s", name, e)

    return results
