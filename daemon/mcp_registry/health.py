"""
Health monitor — polls `claude mcp list` periodically and updates store.
"""

import asyncio
import logging
import time

from mcp_registry.scanner import scan_claude_mcp_list

logger = logging.getLogger("mcp_registry.health")


async def health_monitor(store, interval: float = 30.0):
    """Background task: poll MCP health every `interval` seconds."""
    logger.info("Health monitor started (interval=%.0fs)", interval)
    while True:
        try:
            await asyncio.sleep(interval)
            # Run blocking scan in executor
            loop = asyncio.get_event_loop()
            servers = await loop.run_in_executor(None, scan_claude_mcp_list)
            now = time.time()
            for name, info in servers.items():
                status = info.get("health", "unknown")
                store.update_health(name, status, now)
            logger.debug("Health check: %d servers polled", len(servers))
        except asyncio.CancelledError:
            logger.info("Health monitor stopped")
            break
        except Exception:
            logger.exception("Health monitor error")
