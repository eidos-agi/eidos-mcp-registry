"""Activity log — ring buffer with JSON persistence."""

import json
import logging
import time
from collections import deque
from pathlib import Path

logger = logging.getLogger("mcp_registry.activity")

# Re-use the same data dir as the store
DATA_DIR = Path.home() / ".eidos-mcp-registry"
ACTIVITY_FILE = DATA_DIR / "activity.json"

# Event types
EVENT_TYPES = {"assign", "unassign", "deploy", "config_change", "scan", "gitignore_bulk", "webhook", "webhook_config"}

_events: deque = deque(maxlen=100)
_loaded = False


def _load():
    global _loaded
    if _loaded:
        return
    _loaded = True
    if ACTIVITY_FILE.exists():
        try:
            with open(ACTIVITY_FILE) as f:
                items = json.load(f)
            _events.extend(items[-100:])
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Failed to load activity log: %s", e)


def _save():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = ACTIVITY_FILE.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(list(_events), f, indent=2)
    tmp.rename(ACTIVITY_FILE)


def log_event(event_type: str, detail: dict | None = None):
    """Log an activity event."""
    _load()
    entry = {
        "type": event_type,
        "ts": time.time(),
        "detail": detail or {},
    }
    _events.append(entry)
    _save()


def get_events(limit: int = 50) -> list[dict]:
    """Return recent events, newest first."""
    _load()
    items = list(_events)
    items.reverse()
    return items[:limit]


def clear():
    """Clear all events (for testing)."""
    global _loaded
    _events.clear()
    _loaded = True
    if ACTIVITY_FILE.exists():
        ACTIVITY_FILE.unlink()
