"""
Health monitor — polls `claude mcp list` periodically and updates store.
"""

import asyncio
import logging
import time

from mcp_registry.scanner import scan_claude_mcp_list

logger = logging.getLogger("mcp_registry.health")


async def health_monitor(store, interval: float = 30.0, timeout: float = 20.0):
    """Background task: poll MCP health every `interval` seconds.

    Args:
        timeout: Max seconds to wait for `claude mcp list`. Prevents the
                 health monitor from blocking the executor thread pool forever.
    """
    logger.info("Health monitor started (interval=%.0fs, timeout=%.0fs)",
                interval, timeout)
    while True:
        try:
            await asyncio.sleep(interval)
            loop = asyncio.get_event_loop()
            try:
                servers = await asyncio.wait_for(
                    loop.run_in_executor(None, scan_claude_mcp_list),
                    timeout=timeout,
                )
            except asyncio.TimeoutError:
                logger.warning("Health check timed out after %.0fs", timeout)
                continue
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
