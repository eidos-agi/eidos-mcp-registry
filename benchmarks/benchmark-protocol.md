# MCP Registry Benchmark Protocol

## Overview
Run 3 coding tasks twice — once with all 27 servers in universal (469 tools), once with proper scoping (~50 tools). Capture everything.

## Baseline State (BEFORE)
- All 27 servers in `__universal__`
- Screenshots captured in `benchmarks/before/`
- Tool count baseline: `benchmarks/before/tool-count-baseline.json`

## The 3 Tasks

### Task 1: Webhook Notification System
```
Add a webhook system to the registry. When a deploy succeeds or fails, POST a JSON payload to a configurable webhook URL. Store webhook URLs per group in the registry store. Add endpoints to register/unregister webhooks. Add a webhook config section to the group detail page. Write tests. Wire it end-to-end.
```

### Task 2: Server Dependency Tracking
```
Some MCP servers depend on others. Add a dependency system: servers can declare what they depend on, the group detail page shows unmet dependencies as warnings, deploy preview flags groups where dependencies aren't satisfied. Update the store schema, deployer, UI, and write tests.
```

### Task 3: Config Diff Viewer
```
When viewing a group's deploy preview, show a side-by-side diff of what each repo's .mcp.json looks like now vs what it will look like after deploy. Color-code additions in green, removals in red, unchanged in gray. Make it collapsible per-repo. Handle the case where .mcp.json doesn't exist yet. Add to the deploy overlay and the group detail page.
```

## Data Collection Per Run

### Before Starting Each Task
1. Reset the repo: `git stash` any changes
2. Note the start time
3. Record which servers are loaded (universal vs scoped)

### During Each Task
Claude Code tracks everything automatically in its session transcript.

### After Each Task
Run the collector script:
```bash
python3 benchmarks/collect.py <session-id> <task-number> <phase>
```
Where phase is "before" or "after".

This captures:
- Session duration (wall clock)
- Total tokens (input + output + cache)
- Cost
- Tool calls (total, by tool, failed)
- Wrong tool calls (tools from irrelevant servers)

### Manual Capture (backup)
At the end of each Claude Code session, note:
- The cost shown in the session summary
- Wall clock time (start to finish)
- Any visible tool call failures or retries

## Comparison Metrics
- Total tokens: before vs after
- Total cost: before vs after
- Wall clock time: before vs after
- Tool calls: total, failed, wrong-server
- Code quality: did the output actually work?
