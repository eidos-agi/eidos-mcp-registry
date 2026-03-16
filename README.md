# Eidos MCP Registry

**Drag-and-drop MCP server scoping for Claude Code.**

A local daemon that manages which MCP servers are available in which projects. Instead of manually editing `.mcp.json` files in every repo and keeping `~/.claude.json` in sync, the registry gives you a single UI to organize, deploy, and monitor all your MCP servers.

Built for [Claude Code](https://claude.ai/code) users.

## The Problem

Claude Code loads MCP servers from `~/.claude.json` (user scope) and `.mcp.json` (project scope). User-scope servers leak into every project. With 20+ servers, every conversation burns thousands of tokens on tool schemas the model never uses — degrading response quality, increasing cost, and causing wrong-tool collisions.

## The Solution

**Assign → Deploy → Promote**

1. **Scan** — discovers servers from `claude mcp list`, `~/.claude.json`, and project `.mcp.json` files
2. **Assign** — drag servers into groups (each group maps to a set of repos)
3. **Deploy** — write `.mcp.json` files to every repo in a group (with merge safety, secrets masking, and snapshots)
4. **Promote** — remove deployed servers from `~/.claude.json` so they only exist where assigned

## Install

Requires **Python 3.11+** and **Claude Code**.

```bash
git clone https://github.com/eidos-agi/eidos-mcp-registry.git
cd eidos-mcp-registry/daemon
pip install -e .
```

## Usage

```bash
# Start the daemon
mcp-registry serve

# Opens automatically at http://127.0.0.1:19285
# Or manually:
mcp-registry open
```

### CLI Commands

```bash
mcp-registry serve           # Start daemon on :19285
mcp-registry scan            # Discover MCP servers
mcp-registry deploy          # Deploy .mcp.json to all groups
mcp-registry deploy --dry-run  # Preview without writing
mcp-registry status          # Show registry state
mcp-registry open            # Open UI in browser
```

## Features

- **Group-based scoping** — organize servers by client, team, or project
- **Scope Audit** — see which servers are leaking to unintended projects
- **Detection scans** — automated drift, health, new-repo, and gitignore checks
- **Deploy with merge** — registry-managed servers are updated; your hand-edits are preserved
- **Secrets masking** — env vars with `token`, `key`, `secret`, `password`, `credential`, or `auth` are replaced with `${VAR}` references
- **Snapshot + rollback** — every deploy creates a snapshot; one-click restore
- **Token budget visualization** — per-server and per-group token cost with compression risk charts
- **Notification inbox** — prioritized alerts with approve/dismiss and audit proof
- **Server catalog** — completeness scoring (A–F), auto-enrichment from filesystem
- **Activity log** — every action timestamped and searchable

## Architecture

```
daemon/
└── mcp_registry/
    ├── server.py          # FastAPI REST + SSE on :19285
    ├── store.py           # Thread-safe state + JSON persistence
    ├── scanner.py         # Discovery: CLI + config + repo dirs
    ├── deployer.py        # .mcp.json merge, mask, deploy, rollback
    ├── detector.py        # 4 detection scan engines
    ├── health.py          # Background health polling
    ├── notifications.py   # Inbox with priorities + deduplication
    ├── catalog.py         # Server metadata + completeness scoring
    ├── deploy_history.py  # Snapshot + rollback
    ├── activity.py        # Ring buffer event log
    ├── renderer.py        # HTML/CSS as Python constant
    └── static/js/         # ES module frontend (uhtml SPA)
```

State persists at `~/.eidos-mcp-registry/registry.json`.

## Tests

```bash
cd daemon
pip install -e ".[test]"
pytest
```

280+ tests covering store, deployer, scanner, detector, secrets masking, and E2E (Playwright).

## About Eidos AGI

Eidos AGI is a research lab founded by Daniel Shanklin. We build open-source tools that put humans in the cockpit of AI systems — not behind them, not removed from them.

The cockpit thesis: the correct relationship between human and AI is neither a chat box (vending machine) nor full autonomy (drone). It's a cockpit — human and AI as a unit, where intent flows in and capability flows out.

- [Eidos Philosophy](https://github.com/eidos-agi/eidos-philosophy) — the architectural thinking behind Eidos
- [Eidos v5](https://github.com/eidos-agi/eidos-v5) — multi-model Socratic deliberation system

## License

MIT
