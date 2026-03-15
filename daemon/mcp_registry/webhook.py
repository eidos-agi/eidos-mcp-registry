"""Fire-and-forget webhook notifications for deploy events."""

import logging
import threading
from datetime import datetime, timezone

import httpx

from mcp_registry import activity

logger = logging.getLogger("mcp_registry.webhook")

_client = httpx.Client(timeout=10)


def _send_webhook(url: str, payload: dict, group: str):
    """POST payload to url in a background thread. Logs result to activity."""
    try:
        resp = _client.post(url, json=payload)
        status = resp.status_code
        logger.info("Webhook %s → %d", url, status)
        activity.log_event("webhook", {
            "group": group,
            "url": url,
            "status": status,
        })
    except Exception as e:
        logger.warning("Webhook %s failed: %s", url, e)
        activity.log_event("webhook", {
            "group": group,
            "url": url,
            "status": "error",
            "error": str(e),
        })


def notify_deploy(store, group_key: str, written: int, errors: int):
    """Fire a webhook for a deploy event on a group (non-blocking).

    Does nothing if the group has no webhook configured.
    """
    url = store.get_webhook(group_key)
    if not url:
        return

    payload = {
        "event": "deploy",
        "group": group_key,
        "written": written,
        "errors": errors,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    t = threading.Thread(target=_send_webhook, args=(url, payload, group_key), daemon=True)
    t.start()
