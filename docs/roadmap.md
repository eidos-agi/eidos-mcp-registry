# Roadmap — Elephant Carpaccio

Each slice is independently shippable, delivers user value, and builds on the last.
Ship one, use it, learn, then cut the next slice.

---

## Slice 1: Read-Only Registry (DONE)
**Value:** See all your MCPs in one place. Know what exists.

- [x] Scanner discovers servers from `claude mcp list` + `~/.claude.json`
- [x] Scanner discovers workspace groups from `~/repos-*/` directories
- [x] Daemon serves web UI on :19285
- [x] Tree shows user root + workspace groups + servers
- [x] Server cards with health dots
- [x] SSE live updates

**Ship criteria:** `mcp-registry serve` → open browser → see all 27 servers organized.

---

## Slice 2: Assign + Deploy to One Group (CURRENT)
**Value:** Pick ONE group (e.g., repos-aic), assign its servers, deploy. Prove the loop works end-to-end for a single group before scaling.

- [x] Drag-and-drop assign servers to groups
- [x] Deploy preview (dry-run)
- [x] Deploy writes `.mcp.json` to repos in that group
- [ ] Verify: open Claude Code in a repos-aic project → only sees assigned MCPs
- [ ] Fix any issues found in the single-group deploy

**Ship criteria:** `repos-aic` repos have correct `.mcp.json` files. Claude Code in that workspace sees only taskr + wrike + universals.

---

## Slice 3: Tree Polish + Resize + Editor
**Value:** The UI is comfortable enough to use daily.

- [x] Resizable sidebar
- [x] Expand/collapse with inheritance visualization
- [ ] Server editor (click card → edit type, command, args, env)
- [ ] Editor saves persist to registry.json
- [ ] Card click vs drag detection (no phantom editor opens)

**Ship criteria:** Can edit a server's config from the UI without touching JSON files.

---

## Slice 4: Drift Detection (Tattle-Tale Report)
**Value:** Know what's out of sync. Which MCPs exist in Claude Code but aren't in the registry? Which `.mcp.json` files on disk don't match what the registry would deploy?

- [ ] Compare registry assignments vs actual `claude mcp list` output
- [ ] Compare deployed `.mcp.json` files vs what registry would generate
- [ ] Show drift in UI: "3 servers in Claude Code not in registry"
- [ ] Show stale deploys: "repos-aic/.mcp.json last deployed 3 days ago, 2 changes pending"

**Ship criteria:** Open registry → immediately see if reality matches intent.

---

## Slice 5: Multi-Group Deploy
**Value:** Scale from one group to all groups. Assign servers to every workspace group, deploy everywhere.

- [ ] Bulk assignment UI (select multiple servers → assign to group)
- [ ] Deploy all groups at once
- [ ] Deploy progress shows per-group status
- [ ] Handle edge cases: repos with existing `.mcp.json` (merge vs overwrite)

**Ship criteria:** All `~/repos-*/` directories have correct `.mcp.json` files.

---

## Slice 6: Self-Managed MCPs
**Value:** Handle MCPs that install themselves (backlog, railguey, cerebro-mcp). These use custom install commands, not standard stdio/sse config.

- [ ] Data model: `managed: true`, `install_command: "backlog mcp start"`
- [ ] Scanner detects self-managed MCPs by command pattern
- [ ] UI shows managed badge, disables config editing
- [ ] Deploy skips managed MCPs (they handle their own `.mcp.json`)

**Ship criteria:** Registry correctly identifies backlog, railguey, cerebro-mcp as self-managed and doesn't try to deploy them.

---

## Slice 7: Promote (Remove from User Scope)
**Value:** The dangerous-but-necessary step: remove servers from user scope after they've been deployed to group scope. This is the moment MCP scoping actually takes effect.

- [ ] Separate "Promote" action (not bundled with Deploy)
- [ ] Preview: "These 5 servers will be removed from user scope"
- [ ] Confirmation dialog with warnings
- [ ] Rollback instructions if something breaks
- [ ] Per-server promote (not all-or-nothing)

**Ship criteria:** After promote, `claude mcp list` shows fewer user-scoped servers. Agents in each workspace only see their group's tools.

---

## Slice 8: Per-Repo Overrides
**Value:** Exceptions to group defaults. "repos-aic gets taskr and wrike, but repos-aic/taskr also needs deepsleep, and repos-aic/legacy should NOT get wrike."

- [ ] UI: click a repo in deploy preview → add/remove overrides
- [ ] Override persists in registry.json
- [ ] Deploy respects overrides
- [ ] Drift detection accounts for overrides

**Ship criteria:** A specific repo can differ from its group's defaults.

---

## Slice 9: Health Dashboard
**Value:** Live health monitoring. Which servers are connected, failed, need auth?

- [ ] Health monitor polls `claude mcp list` every 30s (already built, needs UI)
- [ ] Health history (last N status changes per server)
- [ ] Alert on health transitions (connected → failed)
- [ ] Filter tree/cards by health status

**Ship criteria:** Kill an MCP server → see it go red in the UI within 30s.

---

## Slice 10: CLI Parity
**Value:** Everything the UI does, the CLI can do. For scripting and automation.

- [ ] `mcp-registry assign taskr repos-aic`
- [ ] `mcp-registry deploy --group repos-aic --dry-run`
- [ ] `mcp-registry drift` (show tattle-tale report)
- [ ] `mcp-registry promote taskr` (remove from user scope)
- [ ] JSON output mode for scripting

**Ship criteria:** Full workflow possible without opening the browser.

---

## What We're NOT Building (Yet)

- **Remote MCP gateway / proxy** — We manage config, not traffic
- **MCP server hosting** — We point to where servers run, we don't run them
- **Multi-user support** — Data model supports it (user root), but single-user for now
- **OAuth management** — MCP auth is the server's problem, not ours
- **Tool schema caching / search** — That's the LLM provider's problem (OpenAI tool search, Anthropic Code Mode)

---

## Principles

1. **One group at a time.** Don't try to configure all 10 groups in one session. Do one, verify it works, move to the next.
2. **Preview before deploy.** Always show what will change before writing to disk.
3. **Don't remove from user scope until you're sure.** Deploy is safe (additive). Promote is dangerous (subtractive). Keep them separate.
4. **Drift is the enemy.** If reality doesn't match the registry, the registry is wrong. Surface drift loudly.
5. **The registry is the source of truth for intent.** `.mcp.json` files are the source of truth for reality. The gap between them is the work.
