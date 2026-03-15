"""
Deploy MCP configurations to repo .mcp.json files.

Merge strategy using _registry_managed tracking:
- We write a "_registry_managed" array into .mcp.json listing servers we own
- Servers in our current effective set: add or update (registry wins)
- Servers previously managed but now unassigned: REMOVED
- Servers we never managed: untouched
- Top-level keys beyond "mcpServers" and "_registry_managed": preserved
"""

import json
import logging
from pathlib import Path

from mcp_registry.scanner import list_repos_in_group

logger = logging.getLogger("mcp_registry.deployer")


_SECRET_PATTERNS = ("token", "key", "secret", "password", "credential", "auth")


def _has_secrets(env: dict) -> list[str]:
    """Return env var names that look like secrets."""
    return [k for k in env if any(p in k.lower() for p in _SECRET_PATTERNS)]


# Valid keys per transport type — only these go into .mcp.json entries
_VALID_ENTRY_KEYS = {"type", "command", "args", "env", "url", "headers", "oauth"}


def _build_server_entry(srv: dict, mask_secrets: bool = False) -> dict:
    """Build a single server entry, keeping only Claude Code-valid keys."""
    entry = {k: v for k, v in srv.items() if k in _VALID_ENTRY_KEYS and v}
    if mask_secrets and "env" in entry:
        secret_keys = _has_secrets(entry["env"])
        if secret_keys:
            masked_env = dict(entry["env"])
            for k in secret_keys:
                masked_env[k] = f"${{{k}}}"
            entry["env"] = masked_env
    return entry


def _deep_merge(base: dict, override: dict) -> dict:
    """Deep merge override into base. Override wins on conflicts."""
    result = dict(base)
    for k, v in override.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = _deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def _build_mcp_json(server_names: list[str], all_servers: dict,
                    group_config: dict | None = None,
                    mask_secrets: bool = False) -> dict:
    """Build the registry's server entries for a list of server names.

    Args:
        group_config: Optional per-server config overrides from the group.
                      e.g. {"cerebro-mcp": {"env": {"SUPABASE_URL": "..."}}}
        mask_secrets: If True, replace secret env values with ${VAR} references.
    """
    mcp_servers = {}
    for name in server_names:
        srv = all_servers.get(name, {})
        entry = _build_server_entry(srv, mask_secrets=mask_secrets)
        # Apply group-level config overrides
        if group_config and name in group_config:
            override = {k: v for k, v in group_config[name].items()
                       if k in _VALID_ENTRY_KEYS}
            entry = _deep_merge(entry, override)
        mcp_servers[name] = entry
    return {"mcpServers": mcp_servers}


def _merge_mcp_json(existing: dict, ours: dict, managed_names: set[str]) -> dict:
    """Merge our managed servers into an existing .mcp.json.

    Uses _registry_managed to know what we previously owned:
    - Previously managed but no longer in managed_names → REMOVE
    - In managed_names → add/update (registry wins)
    - Never managed by us → untouched
    """
    merged = {}
    # Preserve all top-level keys except mcpServers and _registry_managed
    for k, v in existing.items():
        if k not in ("mcpServers", "_registry_managed"):
            merged[k] = v

    existing_servers = dict(existing.get("mcpServers", {}))
    previously_managed = set(existing.get("_registry_managed", []))
    our_servers = ours.get("mcpServers", {})

    # Servers to remove: previously managed but no longer in our set
    to_remove = previously_managed - managed_names

    # Start with existing servers, minus ones we're removing
    result_servers = {
        name: config for name, config in existing_servers.items()
        if name not in managed_names and name not in to_remove
    }
    # Add all our managed servers (registry wins)
    result_servers.update(our_servers)

    merged["mcpServers"] = result_servers
    merged["_registry_managed"] = sorted(managed_names)
    return merged


def preview(store) -> dict:
    """Dry-run: compute what would be written per repo.

    Only deploys to groups that have at least one directly assigned server.
    Universal servers are inherited but don't trigger deployment on their own.
    """
    snapshot = store.snapshot()
    all_servers = snapshot["servers"]
    groups = snapshot["groups"]
    changes = {}

    for group_key, group in groups.items():
        if group_key == "__universal__" or not group.get("path"):
            continue
        # Skip groups with no directly assigned servers —
        # don't write .mcp.json to 337 repos just for inherited universals
        if not group.get("servers"):
            continue
        repos = list_repos_in_group(group["path"])
        for repo in repos:
            effective = store.effective_servers(repo, group_key)
            if not effective:
                continue
            group_config = group.get("server_config")
            ours = _build_mcp_json(effective, all_servers, group_config,
                                   mask_secrets=True)
            managed_names = set(effective)
            mcp_path = str(Path(repo) / ".mcp.json")

            # Load existing file
            existing = None
            if Path(mcp_path).exists():
                try:
                    with open(mcp_path) as f:
                        existing = json.load(f)
                except (json.JSONDecodeError, OSError):
                    pass

            # Compute merged result
            if existing:
                final = _merge_mcp_json(existing, ours, managed_names)
            else:
                final = dict(ours)
                final["_registry_managed"] = sorted(managed_names)

            # Skip if nothing would change
            if existing == final:
                continue

            # Check if .mcp.json is gitignored
            gitignore = Path(repo) / ".gitignore"
            gitignored = False
            if gitignore.exists():
                try:
                    gitignored = ".mcp.json" in gitignore.read_text()
                except OSError:
                    pass

            # Detect what changed for the preview
            existing_server_names = set(existing.get("mcpServers", {}).keys()) if existing else set()
            previously_managed = set(existing.get("_registry_managed", [])) if existing else set()
            servers_removed = sorted(previously_managed - managed_names)
            unmanaged_kept = sorted(
                existing_server_names - managed_names - (previously_managed - managed_names)
            )
            servers_added = sorted(managed_names - existing_server_names)
            servers_updated = sorted(managed_names & existing_server_names)

            changes[mcp_path] = {
                "repo": repo,
                "group": group_key,
                "servers": effective,
                "content": final,
                "action": "update" if existing else "create",
                "gitignored": gitignored,
                "unmanaged_kept": unmanaged_kept,
                "servers_added": servers_added,
                "servers_updated": servers_updated,
                "servers_removed": servers_removed,
            }

    return changes


def deploy(store, on_progress=None, only_groups: list[str] | None = None) -> dict:
    """Write .mcp.json files for selected groups.

    Always re-computes preview at deploy time (not stale data from earlier preview).

    Args:
        only_groups: If provided, only deploy these group keys. Otherwise deploy all.
    """
    # Fresh preview — never use stale data
    changes = preview(store)
    if only_groups:
        changes = {k: v for k, v in changes.items() if v["group"] in only_groups}
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

    # NOTE: We intentionally do NOT remove servers from user scope during deploy.
    # That's a destructive, hard-to-reverse action. The user should do that
    # manually once they've verified their group assignments are correct.
    # Future: add a separate "Promote" action with explicit confirmation.

    return results


def check_gitignore_status(store, group_key: str) -> dict:
    """Report .gitignore status for .mcp.json across all repos in a group."""
    snapshot = store.snapshot()
    group = snapshot["groups"].get(group_key)
    if not group or not group.get("path"):
        return {"error": "Group not found or has no path"}

    repos = list_repos_in_group(group["path"])
    ignored = 0
    not_ignored = 0

    for repo in repos:
        gitignore = Path(repo) / ".gitignore"
        if gitignore.exists():
            try:
                if ".mcp.json" in gitignore.read_text():
                    ignored += 1
                    continue
            except OSError:
                pass
        not_ignored += 1

    return {
        "group": group_key,
        "total": len(repos),
        "ignored": ignored,
        "not_ignored": not_ignored,
    }


def add_gitignore_bulk(store, group_key: str) -> dict:
    """Add .mcp.json to .gitignore for all repos in a group."""
    snapshot = store.snapshot()
    group = snapshot["groups"].get(group_key)
    if not group or not group.get("path"):
        return {"error": "Group not found or has no path"}

    repos = list_repos_in_group(group["path"])
    added = []
    already = []
    errors = []

    for repo in repos:
        gitignore = Path(repo) / ".gitignore"
        try:
            if gitignore.exists():
                content = gitignore.read_text()
                if ".mcp.json" in content:
                    already.append(repo)
                    continue
                # Append to existing
                if not content.endswith("\n"):
                    content += "\n"
                content += ".mcp.json\n"
                gitignore.write_text(content)
            else:
                gitignore.write_text(".mcp.json\n")
            added.append(repo)
        except OSError as e:
            errors.append({"repo": repo, "error": str(e)})

    return {"added": len(added), "already": len(already), "errors": errors}
