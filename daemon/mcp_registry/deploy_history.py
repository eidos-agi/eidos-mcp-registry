"""Deploy history — snapshot .mcp.json before each deploy for rollback."""

import json
import logging
import time
import uuid
from pathlib import Path

logger = logging.getLogger("mcp_registry.deploy_history")

HISTORY_DIR = Path.home() / ".eidos-mcp-registry" / "deploy-history"


def snapshot_before_deploy(changes: dict) -> str:
    """Save current state of all .mcp.json files that will be modified.

    Args:
        changes: The deploy preview dict {mcp_path: {content, group, ...}}

    Returns:
        Snapshot ID for rollback reference.
    """
    snapshot_id = f"{int(time.time())}-{uuid.uuid4().hex[:8]}"
    snapshot_dir = HISTORY_DIR / snapshot_id
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "id": snapshot_id,
        "ts": time.time(),
        "files": {},
    }

    for mcp_path, change in changes.items():
        p = Path(mcp_path)
        if p.exists():
            try:
                content = json.loads(p.read_text())
                # Store as relative reference
                safe_name = mcp_path.replace("/", "__")
                snapshot_file = snapshot_dir / f"{safe_name}.json"
                with open(snapshot_file, "w") as f:
                    json.dump(content, f, indent=2)
                manifest["files"][mcp_path] = {
                    "snapshot_file": safe_name + ".json",
                    "group": change.get("group", "unknown"),
                    "existed": True,
                }
            except (json.JSONDecodeError, OSError) as e:
                logger.warning("Failed to snapshot %s: %s", mcp_path, e)
        else:
            manifest["files"][mcp_path] = {
                "snapshot_file": None,
                "group": change.get("group", "unknown"),
                "existed": False,
            }

    # Write manifest
    with open(snapshot_dir / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    logger.info("Deploy snapshot %s: %d files", snapshot_id, len(manifest["files"]))
    return snapshot_id


def list_history(limit: int = 20) -> list[dict]:
    """List recent deploy snapshots, newest first."""
    if not HISTORY_DIR.exists():
        return []

    snapshots = []
    for d in HISTORY_DIR.iterdir():
        if not d.is_dir():
            continue
        manifest_path = d / "manifest.json"
        if not manifest_path.exists():
            continue
        try:
            with open(manifest_path) as f:
                manifest = json.load(f)
            snapshots.append({
                "id": manifest["id"],
                "ts": manifest["ts"],
                "file_count": len(manifest["files"]),
                "groups": list(set(f["group"] for f in manifest["files"].values())),
            })
        except (json.JSONDecodeError, OSError, KeyError):
            continue

    # Sort by timestamp descending (newest first)
    snapshots.sort(key=lambda s: s["ts"], reverse=True)
    return snapshots[:limit]


def rollback(snapshot_id: str) -> dict:
    """Restore .mcp.json files from a snapshot.

    Returns:
        {"restored": [...], "deleted": [...], "errors": [...]}
    """
    snapshot_dir = HISTORY_DIR / snapshot_id
    manifest_path = snapshot_dir / "manifest.json"

    if not manifest_path.exists():
        return {"error": f"Snapshot {snapshot_id} not found"}

    with open(manifest_path) as f:
        manifest = json.load(f)

    result = {"restored": [], "deleted": [], "errors": []}

    for mcp_path, info in manifest["files"].items():
        try:
            if info["existed"] and info["snapshot_file"]:
                # Restore from snapshot
                snapshot_file = snapshot_dir / info["snapshot_file"]
                if snapshot_file.exists():
                    content = snapshot_file.read_text()
                    Path(mcp_path).write_text(content)
                    result["restored"].append(mcp_path)
                else:
                    result["errors"].append({"path": mcp_path, "error": "Snapshot file missing"})
            elif not info["existed"]:
                # File didn't exist before — delete it
                p = Path(mcp_path)
                if p.exists():
                    p.unlink()
                    result["deleted"].append(mcp_path)
        except OSError as e:
            result["errors"].append({"path": mcp_path, "error": str(e)})

    logger.info("Rollback %s: %d restored, %d deleted, %d errors",
                snapshot_id, len(result["restored"]), len(result["deleted"]), len(result["errors"]))
    return result
