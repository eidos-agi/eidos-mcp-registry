# eidos-mcp-registry

Drag-and-drop MCP server scoping across workspace groups.

## Architecture

```
daemon/
├── pyproject.toml
└── mcp_registry/
    ├── __main__.py        # python -m mcp_registry
    ├── cli.py             # Click CLI: serve, status, scan, deploy, open
    ├── server.py          # FastAPI on :19285
    ├── store.py           # Thread-safe state + JSON persistence
    ├── scanner.py         # Discovery: claude mcp list + config files + repo dirs
    ├── deployer.py        # Write .mcp.json files
    ├── health.py          # Poll health every 30s
    ├── events.py          # AsyncEventBus + SSE
    ├── renderer.py        # REGISTRY_HTML constant
    └── static/js/
        ├── registry.js    # uhtml SPA
        └── uhtml.js       # Vendored uhtml
```

## Running

```bash
cd daemon && pip install -e .
mcp-registry serve          # starts on :19285
mcp-registry scan            # discover MCPs
mcp-registry deploy --dry-run
```

## Cardinal Rules

- `claude -p` only. Never import the anthropic SDK.
- HTML from Python constants, never disk-cached templates.
- State persists at `~/.eidos-mcp-registry/registry.json`.
