"""
FastAPI server on :19285 — REST + SSE for the MCP Registry.
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from mcp_registry.store import RegistryStore
from mcp_registry.events import AsyncEventBus, sse_generator, wire_store_to_bus
from mcp_registry.scanner import full_scan
from mcp_registry.health import health_monitor
from mcp_registry.deployer import preview as deploy_preview, deploy as deploy_execute
from mcp_registry.renderer import REGISTRY_HTML

logger = logging.getLogger("mcp_registry.server")

_store: RegistryStore | None = None
_bus: AsyncEventBus | None = None
_health_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _store, _bus, _health_task

    _store = RegistryStore()
    _bus = AsyncEventBus()
    wire_store_to_bus(_store, _bus)

    # Initial scan in executor
    loop = asyncio.get_event_loop()
    summary = await loop.run_in_executor(None, full_scan, _store)
    logger.info("Initial scan: %d servers, %d groups",
                summary["servers_found"], summary["groups_found"])

    # Start health monitor
    _health_task = asyncio.create_task(health_monitor(_store))

    yield

    # Shutdown
    if _health_task:
        _health_task.cancel()
        try:
            await _health_task
        except asyncio.CancelledError:
            pass
    _store = None
    _bus = None


app = FastAPI(title="Eidos MCP Registry", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files (JS)
_static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")


# ── Models ───────────────────────────────────────────────────────

class AssignRequest(BaseModel):
    server: str
    group: str

class GroupCreateRequest(BaseModel):
    key: str
    label: str
    path: str | None = None


# ── HTML ─────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index():
    return REGISTRY_HTML


# ── Health ───────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "servers": _store.server_count(), "groups": _store.group_count()}


# ── Servers ──────────────────────────────────────────────────────

@app.get("/servers")
async def get_servers():
    return _store.servers


# ── Groups ───────────────────────────────────────────────────────

@app.get("/groups")
async def get_groups():
    return _store.groups


@app.post("/groups")
async def create_group(req: GroupCreateRequest):
    ok = _store.create_group(req.key, req.label, req.path)
    if not ok:
        return JSONResponse({"error": "Group already exists"}, status_code=409)
    return {"ok": True, "group": req.key}


# ── Assignments ──────────────────────────────────────────────────

@app.post("/assign")
async def assign_server(req: AssignRequest):
    ok = _store.assign(req.server, req.group)
    if not ok:
        return JSONResponse({"error": "Invalid server or group"}, status_code=400)
    return {"ok": True}


@app.post("/unassign")
async def unassign_server(req: AssignRequest):
    ok = _store.unassign(req.server, req.group)
    if not ok:
        return JSONResponse({"error": "Server not in group"}, status_code=400)
    return {"ok": True}


@app.get("/unassigned")
async def unassigned():
    return _store.unassigned_servers()


# ── Scan ─────────────────────────────────────────────────────────

@app.post("/scan")
async def scan():
    loop = asyncio.get_event_loop()
    summary = await loop.run_in_executor(None, full_scan, _store)
    return summary


# ── Deploy ───────────────────────────────────────────────────────

@app.post("/deploy/preview")
async def deploy_preview_endpoint():
    loop = asyncio.get_event_loop()
    changes = await loop.run_in_executor(None, deploy_preview, _store)
    return {
        "changes": len(changes),
        "files": {path: {"action": c["action"], "servers": c["servers"]}
                  for path, c in changes.items()},
    }


@app.post("/deploy")
async def deploy_endpoint():
    def on_progress(info):
        if _bus:
            _bus.publish("registry", json.dumps({"event": "deploy_progress", **info}))

    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(None, deploy_execute, _store, on_progress)
    return results


# ── SSE ──────────────────────────────────────────────────────────

@app.get("/events")
async def events():
    initial = json.dumps(_store.snapshot())
    return StreamingResponse(
        sse_generator(_bus, "registry", initial_data=initial),
        media_type="text/event-stream",
    )
