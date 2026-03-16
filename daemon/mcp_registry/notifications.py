"""Notification inbox -- daemon detects, human decides."""

import hashlib
import json
import logging
import time
import uuid
from pathlib import Path

logger = logging.getLogger("mcp_registry.notifications")

DATA_DIR = Path.home() / ".eidos-mcp-registry"
NOTIFICATIONS_FILE = DATA_DIR / "notifications.json"

PRIORITIES = {"critical": 0, "high": 1, "medium": 2, "low": 3}

NOTIFICATION_TYPES = {
    "new_repo": {"priority": "low", "icon": "\U0001F4C1", "label": "New repo needs MCP config"},
    "drift": {"priority": "medium", "icon": "\u26A0\uFE0F", "label": "Repo config was edited outside the registry"},
    "health_failure": {"priority": "high", "icon": "\U0001F534", "label": "MCP server is down"},
    "stale_deploy": {"priority": "medium", "icon": "\u23F0", "label": "Repos are out of sync with registry"},
    "secrets_exposed": {"priority": "critical", "icon": "\U0001F6A8", "label": "API keys found in a committed file"},
    "new_server": {"priority": "low", "icon": "\U0001F195", "label": "New MCP server found on this machine"},
    "gitignore_missing": {"priority": "medium", "icon": "\U0001F6E1\uFE0F", "label": "Repos could accidentally commit .mcp.json"},
}


class NotificationStore:
    """In-memory + JSON-persisted notification store."""

    def __init__(self):
        self._notifications: list[dict] = []
        self._load()

    # -- persistence -------------------------------------------------------

    def _load(self):
        if NOTIFICATIONS_FILE.exists():
            try:
                with open(NOTIFICATIONS_FILE) as f:
                    self._notifications = json.load(f)
                logger.info("Loaded %d notifications", len(self._notifications))
            except (json.JSONDecodeError, OSError) as e:
                logger.warning("Failed to load notifications: %s", e)
                self._notifications = []

    def _save(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        tmp = NOTIFICATIONS_FILE.with_suffix(".tmp")
        with open(tmp, "w") as f:
            json.dump(self._notifications, f, indent=2)
        tmp.rename(NOTIFICATIONS_FILE)

    # -- fingerprint -------------------------------------------------------

    @staticmethod
    def _fingerprint(ntype: str, context: dict | None) -> str:
        ctx = context or {}
        # Use sorted keys from context for stable hash
        raw = ntype + "|" + json.dumps(ctx, sort_keys=True)
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def has_pending_fingerprint(self, fingerprint: str) -> bool:
        return any(
            n.get("fingerprint") == fingerprint and n.get("status") == "pending"
            for n in self._notifications
        )

    # -- mutations ---------------------------------------------------------

    def create(self, ntype: str, title: str, detail: str,
               actions: list[dict] | None = None,
               context: dict | None = None) -> dict | None:
        """Create a notification. Returns it, or None if duplicate."""
        type_info = NOTIFICATION_TYPES.get(ntype, {})
        priority = type_info.get("priority", "medium")
        icon = type_info.get("icon", "")

        fp = self._fingerprint(ntype, context)
        if self.has_pending_fingerprint(fp):
            return None

        notification = {
            "id": str(uuid.uuid4()),
            "type": ntype,
            "priority": priority,
            "icon": icon,
            "title": title,
            "detail": detail,
            "context": context or {},
            "actions": actions or [],
            "status": "pending",
            "fingerprint": fp,
            "created_at": time.time(),
        }
        self._notifications.append(notification)
        self._save()
        return notification

    def get(self, status: str = "pending", limit: int = 50) -> list[dict]:
        """Return notifications filtered by status, sorted by priority then newest."""
        filtered = [n for n in self._notifications if n.get("status") == status]
        filtered.sort(key=lambda n: (
            PRIORITIES.get(n.get("priority", "medium"), 2),
            -n.get("created_at", 0),
        ))
        return filtered[:limit]

    def approve(self, nid: str, audit_result: dict | None = None) -> dict | None:
        """Mark as approved with optional audit result proving the action worked."""
        for n in self._notifications:
            if n["id"] == nid:
                n["status"] = "approved"
                n["resolved_at"] = time.time()
                if audit_result:
                    n["audit_result"] = audit_result
                self._save()
                action = n["actions"][0] if n.get("actions") else None
                return {"notification": n, "action": action}
        return None

    def record_audit(self, nid: str, audit_result: dict):
        """Attach audit proof to an already-approved notification."""
        for n in self._notifications:
            if n["id"] == nid:
                n["audit_result"] = audit_result
                n["audit_at"] = time.time()
                self._save()
                return True
        return False

    def dismiss(self, nid: str) -> dict | None:
        """Mark as dismissed."""
        for n in self._notifications:
            if n["id"] == nid:
                n["status"] = "dismissed"
                n["resolved_at"] = time.time()
                self._save()
                return {"notification": n}
        return None

    def count_pending(self) -> dict:
        """Count pending notifications by priority."""
        counts = {"total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0}
        for n in self._notifications:
            if n.get("status") == "pending":
                counts["total"] += 1
                p = n.get("priority", "medium")
                if p in counts:
                    counts[p] += 1
        return counts


# -- Module-level singleton ------------------------------------------------

_store = NotificationStore()


def create_notification(ntype: str, title: str, detail: str,
                        actions: list[dict] | None = None,
                        context: dict | None = None) -> dict | None:
    return _store.create(ntype, title, detail, actions, context)


def get_notifications(status: str = "pending", limit: int = 50) -> list[dict]:
    return _store.get(status, limit)


def approve_notification(nid: str) -> dict | None:
    return _store.approve(nid)


def record_audit(nid: str, audit_result: dict) -> bool:
    return _store.record_audit(nid, audit_result)


def dismiss_notification(nid: str) -> dict | None:
    return _store.dismiss(nid)


def count_pending() -> dict:
    return _store.count_pending()


def reload():
    """Re-initialize the store (useful after tests)."""
    global _store
    _store = NotificationStore()
