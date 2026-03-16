"""Event detector -- scans for conditions that need human attention."""

import logging
import time
from pathlib import Path

from mcp_registry.scanner import list_repos_in_group
from mcp_registry import notifications

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
            context = {"repo": repo, "group": gk}
            n = notifications.create_notification(
                "new_repo",
                f"New repo detected: {repo_name}",
                f"{repo_name} exists in {group.get('label', gk)} but has no .mcp.json. "
                f"Deploy to configure MCP servers for this repo.",
                actions=[
                    {"label": "Deploy", "endpoint": "/deploy",
                     "method": "POST", "body": {"groups": [gk]}},
                    {"label": "Ignore", "action": "dismiss"},
                ],
                context=context,
            )
            if n:
                count += 1

    return count


def detect_drift(store) -> int:
    """Run deploy preview. If repos show changes, create drift notifications."""
    from mcp_registry.deployer import preview as deploy_preview

    try:
        changes = deploy_preview(store)
    except Exception as e:
        logger.warning("Drift detection failed: %s", e)
        return 0

    if not changes:
        return 0

    # Group changes by group key
    by_group: dict[str, list[str]] = {}
    for path, change in changes.items():
        gk = change.get("group", "unknown")
        by_group.setdefault(gk, []).append(path)

    count = 0
    snapshot = store.snapshot()
    groups = snapshot["groups"]

    for gk, paths in by_group.items():
        label = groups.get(gk, {}).get("label", gk)
        context = {"group": gk, "files_changed": len(paths)}
        n = notifications.create_notification(
            "drift",
            f"Config drift in {label}",
            f"{len(paths)} repo(s) in {label} have .mcp.json files that differ "
            f"from the registry. Deploy to reconcile.",
            actions=[
                {"label": "Deploy", "endpoint": "/deploy",
                 "method": "POST", "body": {"groups": [gk]}},
                {"label": "Dismiss", "action": "dismiss"},
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
            context = {"server": name}
            n = notifications.create_notification(
                "health_failure",
                f"Server unhealthy: {name}",
                f"{name} has been reporting as failed for "
                f"{int((now - health_ts) / 60)} minutes.",
                actions=[
                    {"label": "Re-scan", "endpoint": "/scan",
                     "method": "POST", "body": None},
                    {"label": "Dismiss", "action": "dismiss"},
                ],
                context=context,
            )
            if n:
                count += 1

    return count


def detect_stale_deploys(store) -> int:
    """If any group has pending changes for >24 hours, notify."""
    from mcp_registry.deployer import preview as deploy_preview

    try:
        changes = deploy_preview(store)
    except Exception:
        return 0

    if not changes:
        return 0

    # Group by group key
    by_group: dict[str, int] = {}
    for path, change in changes.items():
        gk = change.get("group", "unknown")
        by_group[gk] = by_group.get(gk, 0) + 1

    snapshot = store.snapshot()
    groups = snapshot["groups"]
    count = 0

    for gk, num_changes in by_group.items():
        label = groups.get(gk, {}).get("label", gk)
        context = {"group": gk, "type": "stale_deploy"}
        n = notifications.create_notification(
            "stale_deploy",
            f"Stale deploy: {label}",
            f"{label} has {num_changes} pending change(s) that haven't been deployed.",
            actions=[
                {"label": "Deploy Now", "endpoint": "/deploy",
                 "method": "POST", "body": {"groups": [gk]}},
                {"label": "Dismiss", "action": "dismiss"},
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
            context = {"group": gk, "unprotected_repos": unprotected[:10]}
            n = notifications.create_notification(
                "gitignore_missing",
                f"Gitignore missing in {label}",
                f"{len(unprotected)} repo(s) in {label} have .mcp.json deployed but "
                f"not in .gitignore. Secrets could be committed.",
                actions=[
                    {"label": "Fix Gitignore", "endpoint": f"/groups/{gk}/gitignore",
                     "method": "POST", "body": None},
                    {"label": "Dismiss", "action": "dismiss"},
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
        # stale_deploy shares fingerprint space with drift; run last
        ("stale_deploys", detect_stale_deploys),
    ]
    for name, fn in detectors:
        try:
            n = fn(store)
            total += n
            if n:
                logger.info("Detector %s created %d notification(s)", name, n)
        except Exception:
            logger.exception("Detector %s failed", name)
    return total
