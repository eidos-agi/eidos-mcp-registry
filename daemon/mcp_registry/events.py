"""
Async event bus for SSE streaming.

Bridges sync store callbacks into asyncio queues for FastAPI StreamingResponse.
"""

import asyncio
import json
import logging
import time
from collections import defaultdict

logger = logging.getLogger("mcp_registry.events")


class AsyncEventBus:
    """Fan-out pub/sub: sync publish → async SSE consumers."""

    def __init__(self):
        self._channels: dict[str, list[asyncio.Queue]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def subscribe(self, channel: str, maxsize: int = 256) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
        async with self._lock:
            self._channels[channel].append(q)
        return q

    async def unsubscribe(self, channel: str, q: asyncio.Queue):
        async with self._lock:
            clients = self._channels.get(channel, [])
            if q in clients:
                clients.remove(q)

    def publish(self, channel: str, data: str):
        """Thread-safe publish. Can be called from sync worker threads."""
        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            pass

        for q in self._channels.get(channel, []):
            try:
                if loop and loop.is_running():
                    # Same thread as event loop — direct put
                    q.put_nowait(data)
                else:
                    # Called from worker thread — schedule on event loop
                    self._put_threadsafe(q, data)
            except asyncio.QueueFull:
                logger.debug("SSE queue full on %s, dropping", channel)

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        """Store reference to the main event loop for cross-thread publishing."""
        self._loop = loop

    def _put_threadsafe(self, q: asyncio.Queue, data: str):
        loop = getattr(self, '_loop', None)
        if loop:
            loop.call_soon_threadsafe(q.put_nowait, data)


async def sse_generator(bus: AsyncEventBus, channel: str,
                        initial_data: str | None = None,
                        keepalive_seconds: float = 15.0):
    """Async generator yielding SSE-formatted lines."""
    q = await bus.subscribe(channel)
    try:
        if initial_data:
            yield f"data: {initial_data}\n\n"
        while True:
            try:
                data = await asyncio.wait_for(q.get(), timeout=keepalive_seconds)
                yield f"data: {data}\n\n"
            except asyncio.TimeoutError:
                yield f": keepalive {int(time.time())}\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        await bus.unsubscribe(channel, q)


def wire_store_to_bus(store, bus: AsyncEventBus):
    """Connect sync store change callbacks to async event bus."""
    def on_change(payload: dict):
        bus.publish("registry", json.dumps(payload))
    store.on_change(on_change)
