"""
Discovery: find all MCP servers from claude config and repo directories.

Sources:
  1. `claude mcp list` — servers at user scope
  2. Config files (~/.claude.json, project .mcp.json files)
  3. ~/repos-*/ directories → auto-create groups
"""

import json
import logging
import re
import subprocess
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

            # Server name line: "  taskr: stdio ..." or just name patterns
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

            # Parse key: value pairs
            kv = re.match(r'^(\w[\w\s]*?):\s*(.+)', line)
            if kv and current_name:
                key = kv.group(1).strip().lower().replace(" ", "_")
                val = kv.group(2).strip()
                if key == "command":
                    current["command"] = val
                elif key == "args":
                    # Try to parse as list
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

        # Don't forget the last one
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
            servers[name] = {
                "name": name,
                "type": config.get("type", "stdio"),
                "command": config.get("command", ""),
                "args": config.get("args", []),
                "env": config.get("env", {}),
                "source_scope": "user",
            }
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


def full_scan(store) -> dict:
    """Run full discovery and update store. Returns summary."""
    # Discover servers
    cli_servers = scan_claude_mcp_list()
    json_servers = scan_claude_json()

    # Merge (CLI takes precedence for health info)
    all_servers = {**json_servers, **cli_servers}

    if all_servers:
        store.upsert_servers_bulk(all_servers)

    # Discover groups
    repo_groups = discover_repo_groups()
    for key, group in repo_groups.items():
        store.create_group(key, group["label"], group["path"])

    return {
        "servers_found": len(all_servers),
        "groups_found": len(repo_groups),
        "server_names": sorted(all_servers.keys()),
    }
