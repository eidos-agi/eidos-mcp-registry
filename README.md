# Eidos MCP Registry

**MCP server management for professional developers who work across dozens or hundreds of repos.**

You have 20+ MCP servers installed. You work across 100+ repos. Every server in `~/.claude.json` leaks into every project — your staging credentials visible in client repos, your internal tools cluttering projects that don't need them, Claude burning thousands of tokens evaluating tools it will never use and picking the wrong one because it's choosing from 200+ options instead of 20.

Editing `.mcp.json` by hand in every repo doesn't scale. The Eidos MCP Registry gives you a single local UI to organize MCP servers into groups, deploy scoped configs across all your repos at once, and enforce that servers only appear where they belong.

Built for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Open source. Free.

![Servers — drag-and-drop scoping with token bars and group zones](https://raw.githubusercontent.com/eidos-agi/eidos-mcp-registry/main/screenshots/servers.png)

## What It Does

- **Group-based scoping** — organize servers by client, team, or project. Client A's repos only see Client A's tools.
- **One-click deploy** — write `.mcp.json` to every repo in a group. Merge-safe: your hand-edits are preserved.
- **Secrets masking** — API keys are automatically replaced with `${VAR}` references. Secrets never touch disk.
- **Scope Audit** — instantly see which servers are leaking to unintended projects. One-click Promote to fix.
- **Token budget visualization** — see exactly how many tokens you're burning on tool schemas and how much scoping saves.
- **Detection scans** — automated drift, health, new-repo, gitignore, and tracked-despite-gitignore checks.
- **Snapshot + rollback** — every deploy creates a restore point. One click to undo.
- **Notification inbox** — prioritized alerts with approve/dismiss and audit proof.
- **Server catalog** — completeness scoring (A–F), auto-enrichment from filesystem.
- **280+ tests** — unit, API, and E2E (Playwright). This isn't a weekend project.

## The Lifecycle

```
Scan → Assign → Deploy → Promote
```

1. **Scan** — discovers servers from `claude mcp list`, `~/.claude.json`, and project `.mcp.json` files
2. **Assign** — drag servers into groups (each group maps to a set of repos)
3. **Deploy** — write `.mcp.json` files to every repo in a group (with merge safety, secrets masking, and snapshots)
4. **Promote** — remove deployed servers from `~/.claude.json` so they only exist where assigned

## Screenshots

| Servers | Token Budget |
|---------|-------------|
| ![Servers](https://raw.githubusercontent.com/eidos-agi/eidos-mcp-registry/main/screenshots/servers.png) | ![Tokens](https://raw.githubusercontent.com/eidos-agi/eidos-mcp-registry/main/screenshots/tokens.png) |
| Drag servers into groups. Token bars show per-server cost. Scope Audit flags leaking servers. | See exactly how much scoping saves — per-server costs, group budgets, monthly savings. |

| Groups | Documentation |
|--------|--------------|
| ![Groups](https://raw.githubusercontent.com/eidos-agi/eidos-mcp-registry/main/screenshots/groups.png) | ![Docs](https://raw.githubusercontent.com/eidos-agi/eidos-mcp-registry/main/screenshots/docs.png) |
| Manage groups, deploy to repos, rollback, and check gitignore status. | 11-section structured guide with clickable TOC. |

## Install

Requires **Python 3.11+** and **Claude Code**.

```bash
pip install eidos-mcp-registry
```

Or from source:

```bash
git clone https://github.com/eidos-agi/eidos-mcp-registry.git
cd eidos-mcp-registry/daemon
pip install -e .
```

## Usage

```bash
mcp-registry serve           # Start daemon on :19285
mcp-registry open            # Open UI in browser
mcp-registry scan            # Discover MCP servers
mcp-registry deploy          # Deploy .mcp.json to all groups
mcp-registry deploy --dry-run  # Preview without writing
mcp-registry status          # Show registry state
```

## Architecture

```
daemon/
└── mcp_registry/
    ├── server.py          # FastAPI REST + SSE on :19285
    ├── store.py           # Thread-safe state + JSON persistence
    ├── scanner.py         # Discovery: CLI + config + repo dirs
    ├── deployer.py        # .mcp.json merge, mask, deploy, rollback
    ├── detector.py        # 5 detection scan engines
    ├── health.py          # Background health polling
    ├── notifications.py   # Inbox with priorities + deduplication
    ├── catalog.py         # Server metadata + completeness scoring
    ├── deploy_history.py  # Snapshot + rollback
    ├── activity.py        # Ring buffer event log
    ├── renderer.py        # HTML/CSS as Python constant
    └── static/js/         # ES module frontend (uhtml SPA)
```

## Tests

```bash
cd daemon
pip install -e ".[test]"
pytest
```

## About Eidos AGI

Eidos AGI is a research lab founded by Daniel Shanklin. We build open-source tools that put humans in the cockpit of AI systems — not behind them, not removed from them.

The cockpit thesis: the correct relationship between human and AI is neither a chat box (vending machine) nor full autonomy (drone). It's a cockpit — human and AI as a unit, where intent flows in and capability flows out. The AGI earns autonomy through demonstrated competence over time. The human decides when the cockpit is empty.

- [Eidos Philosophy](https://github.com/eidos-agi/eidos-philosophy) — the architectural thinking behind Eidos
- [Eidos v5](https://github.com/eidos-agi/eidos-v5) — multi-model Socratic deliberation system

## License

MIT
