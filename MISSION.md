# Eidos MCP Registry — Mission

## Vision
The control plane for MCP server scoping. Manage which AI tools are visible in which workspaces. Deploy is safe (additive). Promote is dangerous (subtractive). Keep them separate.

See `docs/philosophy.md` for why this exists.
See `docs/roadmap.md` for the full carpaccio.

---

## Milestones

### Slice 1: Read-Only Registry
**Status: DONE**

- [x] Scanner discovers 27 servers from CLI + config
- [x] Scanner discovers 10 workspace groups from ~/repos-*/
- [x] Daemon serves web UI on :19285
- [x] Tree with user root, expand/collapse, inheritance visualization
- [x] Server cards with health dots
- [x] SSE live updates (scan progress, deploy progress)
- [x] CLI: serve, status, scan, servers, groups

### Slice 2: Assign + Deploy to One Group
**Status: DONE**

- [x] Drag-and-drop assign servers to groups
- [x] Deploy preview (dry-run, shows per-repo changes)
- [x] Deploy writes .mcp.json to repos in target group
- [x] Deploy only touches groups with assigned servers (not all 337 repos)
- [x] Deploy does NOT remove from user scope (safe, additive only)
- [x] Verify: deployed cerebro-mcp to 24 greenmark repos, Claude Code sees project-scoped servers
- [x] Merge strategy: preserves unmanaged servers, extra top-level keys
- [x] `_registry_managed` tracking: enables clean removal on unassign
- [x] Scope override safety: deployed config matches user scope exactly

### Slice 3: Tree Polish + Editor
**Status: IN PROGRESS**

- [x] Resizable sidebar
- [x] User root node showing all user-scoped servers
- [x] Inherited servers shown dimmed/italic under groups
- [ ] Server editor (click card -> slide-out panel with type/command/args/env)
- [ ] Editor save persists to registry.json
- [ ] Card click vs drag detection working cleanly

### Slice 4: Drift Detection
**Status: PARTIAL**

- [x] `/verify/{group_key}` endpoint — compares registry intent vs disk
- [x] 6 drift detection tests passing (manual edit, deleted file, registry change, removal)
- [ ] Compare registry vs `claude mcp list` output
- [ ] Show drift in UI
- [ ] Show stale deploys

### Slice 5: Multi-Group Deploy
**Status: PARTIAL**

- [x] Group-level checkboxes in deploy UI
- [x] Backend `only_groups` filtering
- [x] Merge with existing .mcp.json (not overwrite)
- [ ] Bulk assignment UI
- [ ] Per-group deploy progress tracking

### Slice 6: Self-Managed MCPs
**Status: NOT STARTED**

- [ ] Detect backlog, railguey, cerebro-mcp as self-managed
- [ ] managed flag + install_command in data model
- [ ] Skip during deploy

### Slice 7: Promote (Remove from User Scope)
**Status: NOT STARTED**

- [ ] Separate action from Deploy
- [ ] Preview + confirmation
- [ ] Per-server promote
- [ ] Rollback instructions

### Slice 8: Per-Group Config Overrides
**Status: DONE**

- [x] `set_group_server_config()` in store
- [x] Deep merge: base config + group overrides (only valid Claude Code keys)
- [x] API endpoint: `PUT /groups/{group}/servers/{server}/config`
- [x] Internal fields filtered from overrides
- [x] Idempotent deploys with overrides
- [x] 17 tests covering deep merge, store API, deploy integration

### Slice 9: Health Dashboard
**Status: NOT STARTED**

### Slice 10: CLI Parity
**Status: NOT STARTED**

### Slice 11: MCP Store
**Status: NOT STARTED**

- [ ] Discover and browse popular/new/trending MCP servers
- [ ] Categories and search
- [ ] One-click install to user scope or group
- [ ] Community ratings/usage stats
- [ ] Source: MCP registry / npm / GitHub discovery

---

## Test Suite

**110 tests, 0.38s** — covering:
- Schema contracts (valid Claude Code keys, no internal field leaks, golden files)
- Deploy safety (idempotency, preview==deploy, merge, removal, group filtering, error handling)
- Store integrity (CRUD, persistence, backup recovery, thread safety, notifications)
- Scope override awareness (project overrides user, empty args/env handling)
- Group config overrides (deep merge, env overrides, persistence, internal field filtering)
- Drift detection (manual edits, deleted files, registry changes, unassign removal)

---

## Current Focus
Test suite is solid. Next: UI for group config overrides + drift detection dashboard.
