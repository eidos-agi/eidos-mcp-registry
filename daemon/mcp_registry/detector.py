"""Event detector -- scans for conditions that need human attention."""

import logging
import time
from pathlib import Path

from mcp_registry.scanner import list_repos_in_group
from mcp_registry import notifications
from mcp_registry import activity

logger = logging.getLogger("mcp_registry.detector")


def detect_new_repos(store) -> int:
    """For each group with a path, find repos with no .mcp.json and notify."""
    snapshot = store.snapshot()
    groups = snapshot["groups"]
    count = 0

    for gk, group in groups.items():
        if gk == "__universal__" or not group.get("path"):
            continue
        if not group.get("servers"):
            continue

        repos = list_repos_in_group(group["path"])
        for repo in repos:
            mcp_path = Path(repo) / ".mcp.json"
            if mcp_path.exists():
                continue

            repo_name = Path(repo).name
            label = group.get("label", gk)
            server_names = ", ".join(group.get("servers", [])[:5])
            context = {"repo": repo, "group": gk}
            n = notifications.create_notification(
                "new_repo",
                f"{repo_name} needs MCP servers",
                f"A new repo \"{repo_name}\" was found in the {label} group, but it "
                f"doesn't have a .mcp.json file yet. Without it, Claude Code won't "
                f"load the group's servers ({server_names}) when working in this repo. "
                f"Click Deploy to create the .mcp.json with the right servers.",
                actions=[
                    {"label": "Deploy to this group", "endpoint": "/deploy",
                     "method": "POST", "body": {"groups": [gk]}},
                    {"label": "Skip", "action": "dismiss"},
                ],
                context=context,
            )
            if n:
                count += 1

    return count


def detect_drift(store) -> int:
    """Run deploy preview. If repos show changes, create one clear notification per group."""
    from mcp_registry.deployer import preview as deploy_preview

    try:
        changes = deploy_preview(store)
    except Exception as e:
        logger.warning("Drift detection failed: %s", e)
        return 0

    if not changes:
        return 0

    # Group changes by group key, collect what's actually different
    by_group: dict[str, dict] = {}
    for path, change in changes.items():
        gk = change.get("group", "unknown")
        if gk not in by_group:
            by_group[gk] = {"repos": 0, "added": set(), "removed": set(), "updated": set()}
        bg = by_group[gk]
        bg["repos"] += 1
        for s in change.get("servers_added", []):
            bg["added"].add(s)
        for s in change.get("servers_removed", []):
            bg["removed"].add(s)
        for s in change.get("servers_updated", []):
            bg["updated"].add(s)

    count = 0
    snapshot = store.snapshot()
    groups = snapshot["groups"]

    for gk, info in by_group.items():
        label = groups.get(gk, {}).get("label", gk)

        # Build a human-readable description of what changed
        parts = []
        if info["added"]:
            parts.append(f"Add: {', '.join(sorted(info['added']))}")
        if info["removed"]:
            parts.append(f"Remove: {', '.join(sorted(info['removed']))}")
        if info["updated"]:
            parts.append(f"Update: {', '.join(sorted(info['updated']))}")

        what_changed = ". ".join(parts) if parts else "Configuration differs from registry"

        context = {"group": gk, "files_changed": info["repos"]}
        n = notifications.create_notification(
            "drift",
            f"{label}: {info['repos']} repos need updating",
            f"The .mcp.json files in {label} don't match what the registry says "
            f"they should have. Changes needed across {info['repos']} repos: "
            f"{what_changed}. "
            f"Click Deploy to update all repos in this group.",
            actions=[
                {"label": "Deploy to update", "endpoint": "/deploy",
                 "method": "POST", "body": {"groups": [gk]}},
                {"label": "Leave as-is", "action": "dismiss"},
            ],
            context=context,
        )
        if n:
            count += 1

    return count


def detect_health_failures(store) -> int:
    """Check server health. If any have been 'failed' for >5 minutes, notify."""
    snapshot = store.snapshot()
    servers = snapshot["servers"]
    now = time.time()
    count = 0

    for name, srv in servers.items():
        health = srv.get("health", "unknown")
        health_ts = srv.get("health_ts", 0)

        if health == "failed" and (now - health_ts) > 300:
            minutes_down = int((now - health_ts) / 60)
            context = {"server": name}
            n = notifications.create_notification(
                "health_failure",
                f"{name} has been down for {minutes_down} minutes",
                f"The MCP server \"{name}\" has been failing health checks for "
                f"{minutes_down} minutes. This means Claude Code can't use any of "
                f"its tools right now. This usually happens when the server process "
                f"crashed, the command path is wrong, or a dependency is missing. "
                f"Try re-scanning to refresh the connection, or check the server logs.",
                actions=[
                    {"label": "Re-scan servers", "endpoint": "/scan",
                     "method": "POST", "body": None},
                    {"label": "Acknowledge", "action": "dismiss"},
                ],
                context=context,
            )
            if n:
                count += 1

    return count


def detect_gitignore_missing(store) -> int:
    """For deployed groups, check if .mcp.json is gitignored. If not, notify."""
    snapshot = store.snapshot()
    groups = snapshot["groups"]
    count = 0

    for gk, group in groups.items():
        if gk == "__universal__" or not group.get("path"):
            continue
        if not group.get("servers"):
            continue

        repos = list_repos_in_group(group["path"])
        unprotected = []

        for repo in repos:
            mcp_path = Path(repo) / ".mcp.json"
            if not mcp_path.exists():
                continue
            gitignore = Path(repo) / ".gitignore"
            if gitignore.exists():
                try:
                    if ".mcp.json" in gitignore.read_text():
                        continue
                except OSError:
                    pass
            unprotected.append(Path(repo).name)

        if unprotected:
            label = group.get("label", gk)
            sample = ", ".join(unprotected[:3])
            more = f" and {len(unprotected) - 3} more" if len(unprotected) > 3 else ""
            context = {"group": gk, "unprotected_repos": unprotected[:10]}
            n = notifications.create_notification(
                "gitignore_missing",
                f"{label}: .mcp.json could be accidentally committed to git",
                f"{len(unprotected)} repo(s) in {label} have .mcp.json files but "
                f"haven't added .mcp.json to their .gitignore. If someone runs "
                f"\"git add .\" they'll commit machine-specific paths into version "
                f"control. Secrets are already masked as ${{VAR}} references, so "
                f"this is about keeping git history clean, not credential exposure. "
                f"Repos: {sample}{more}. Click Fix to add .mcp.json to every "
                f"repo's .gitignore in this group.",
                actions=[
                    {"label": "Fix all .gitignore files", "endpoint": f"/groups/{gk}/gitignore",
                     "method": "POST", "body": None},
                    {"label": "Not needed", "action": "dismiss"},
                ],
                context=context,
            )
            if n:
                count += 1

    return count


def run_all_detections(store) -> int:
    """Run all detectors. Returns total new notifications created."""
    total = 0
    detectors = [
        ("new_repos", detect_new_repos),
        ("drift", detect_drift),
        ("health_failures", detect_health_failures),
        ("gitignore_missing", detect_gitignore_missing),
    ]
    for name, fn in detectors:
        try:
            n = fn(store)
            total += n
            if n:
                logger.info("Detector %s created %d notification(s)", name, n)
        except Exception:
            logger.exception("Detector %s failed", name)
    activity.log_event("detection_run", {
        "notifications_created": total,
        "detectors_run": len(detectors),
    })
    return total
