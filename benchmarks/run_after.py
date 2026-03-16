#!/usr/bin/env python3
"""
Benchmark runner — runs 3 tasks using Claude Code Agent SDK.
Run with --phase before or --phase after.

Before: temporarily removes .mcp.json so all user-scope servers load (unscoped).
After:  uses the deployed .mcp.json (scoped to 10 servers).

MUST be run from a regular terminal, NOT from inside a Claude Code session.
Run `claude /login` first if not authenticated.

Usage:
    python benchmarks/run_after.py --phase after
    python benchmarks/run_after.py --phase before
"""

import argparse
import asyncio
import json
import subprocess
import time
from pathlib import Path
from datetime import datetime, timezone

from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    ResultMessage,
    TextBlock,
    ToolUseBlock,
)

REPO = Path("/Users/dshanklinbv/repos-eidos-agi/eidos-mcp-registry")
RESULTS = REPO / "benchmarks" / "results"

TASKS = {
    "1": {
        "name": "Webhook Notification System",
        "prompt": (
            "Add a webhook system to the registry. When a deploy succeeds or fails, "
            "POST a JSON payload to a configurable webhook URL. Store webhook URLs per "
            "group in the registry store. Add endpoints to register/unregister webhooks. "
            "Add a webhook config section to the group detail page. Write tests. Wire it end-to-end."
        ),
    },
    "2": {
        "name": "Server Dependency Tracking",
        "prompt": (
            "Some MCP servers depend on others. Add a dependency system: servers can declare "
            "what they depend on, the group detail page shows unmet dependencies as warnings, "
            "deploy preview flags groups where dependencies aren't satisfied. Update the store "
            "schema, deployer, UI, and write tests."
        ),
    },
    "3": {
        "name": "Config Diff Viewer",
        "prompt": (
            "When viewing a group's deploy preview, show a side-by-side diff of what each "
            "repo's .mcp.json looks like now vs what it will look like after deploy. Color-code "
            "additions in green, removals in red, unchanged in gray. Make it collapsible per-repo. "
            "Handle the case where .mcp.json doesn't exist yet. Add to the deploy overlay and "
            "the group detail page."
        ),
    },
}


async def run_task(task_num: str, phase: str):
    task = TASKS[task_num]
    print(f"\n{'='*60}")
    print(f"  TASK {task_num}: {task['name']} — {phase.upper()}")
    print(f"{'='*60}")

    mcp_json = REPO / ".mcp.json"
    mcp_backup = REPO / ".mcp.json.benchmark-backup"

    # For "before" runs: temporarily remove .mcp.json so user-scope servers load
    if phase == "before" and mcp_json.exists():
        mcp_json.rename(mcp_backup)
        print("  [setup] Removed .mcp.json — running unscoped")

    try:
        options = ClaudeAgentOptions(
            permission_mode="bypassPermissions",
            cwd=REPO / "daemon",
            max_budget_usd=5.0,
            max_turns=50,
        )

        tool_calls = []
        start = time.time()

        async with ClaudeSDKClient(options=options) as client:
            await client.query(task["prompt"])

            async for message in client.receive_messages():
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            preview = block.text[:100].replace('\n', ' ')
                            print(f"  ... {preview}")
                        elif isinstance(block, ToolUseBlock):
                            tool_calls.append(block.name)
                            print(f"  [tool] {block.name}")

                elif isinstance(message, ResultMessage):
                    duration = time.time() - start

                    # Extract usage dict — contains token breakdown
                    usage = message.usage or {}

                    result = {
                        "task": task_num,
                        "task_name": task["name"],
                        "phase": phase,
                        "state": "unscoped_all_servers" if phase == "before" else "scoped_10_servers_via_mcp_json",
                        "collected_at": datetime.now(timezone.utc).isoformat(),
                        "duration_seconds": int(duration),
                        "duration_human": f"{int(duration // 60)}m {int(duration % 60)}s",
                        "duration_ms": getattr(message, "duration_ms", 0),
                        "duration_api_ms": getattr(message, "duration_api_ms", 0),
                        "tokens": {
                            "input": usage.get("input_tokens", 0),
                            "output": usage.get("output_tokens", 0),
                            "cache_read": usage.get("cache_read_input_tokens", 0),
                            "cache_creation": usage.get("cache_creation_input_tokens", 0),
                            "total": usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
                        },
                        "usage_raw": usage,
                        "cost_usd": message.total_cost_usd,
                        "session_id": message.session_id,
                        "num_turns": message.num_turns,
                        "is_error": getattr(message, "is_error", False),
                        "tool_calls": {
                            "total": len(tool_calls),
                            "by_tool": {},
                        },
                    }

                    for t in tool_calls:
                        result["tool_calls"]["by_tool"][t] = result["tool_calls"]["by_tool"].get(t, 0) + 1

                    out_path = RESULTS / f"task{task_num}-{phase}.json"
                    with open(out_path, "w") as f:
                        json.dump(result, f, indent=2)

                    print(f"\n  Duration:    {result['duration_human']} (wall) / {result['duration_ms']}ms (sdk) / {result['duration_api_ms']}ms (api)")
                    print(f"  Tokens in:   {result['tokens']['input']:,}")
                    print(f"  Tokens out:  {result['tokens']['output']:,}")
                    print(f"  Tokens tot:  {result['tokens']['total']:,}")
                    print(f"  Cache read:  {result['tokens']['cache_read']:,}")
                    print(f"  Cost:        ${result['cost_usd']:.4f}" if result['cost_usd'] else "  Cost:        N/A")
                    print(f"  Tool calls:  {len(tool_calls)}")
                    print(f"  Turns:       {result['num_turns']}")
                    print(f"  Error:       {result['is_error']}")
                    print(f"  Usage raw:   {json.dumps(usage)[:200]}")
                    print(f"  Saved:       {out_path}")
                    return result

    finally:
        # Restore .mcp.json if we moved it
        if phase == "before" and mcp_backup.exists():
            mcp_backup.rename(mcp_json)
            print("  [cleanup] Restored .mcp.json")

    return None


def reset_repo():
    """Reset repo state between tasks, preserving benchmarks and .mcp.json."""
    subprocess.run(["git", "checkout", "."], cwd=str(REPO), capture_output=True)
    subprocess.run(
        ["git", "clean", "-fd", "daemon/"],
        cwd=str(REPO), capture_output=True,
    )


async def main():
    parser = argparse.ArgumentParser(description="Run benchmark tasks")
    parser.add_argument("--phase", required=True, choices=["before", "after"],
                        help="'before' = unscoped (no .mcp.json), 'after' = scoped (.mcp.json)")
    parser.add_argument("--task", type=str, default=None,
                        help="Run a single task (1, 2, or 3). Default: all 3.")
    args = parser.parse_args()

    RESULTS.mkdir(exist_ok=True)

    print(f"Benchmark: {args.phase.upper()} runs via Claude Code Agent SDK")
    print(f"Repo: {REPO}")

    mcp_json = REPO / ".mcp.json"
    if mcp_json.exists():
        with open(mcp_json) as f:
            servers = json.load(f).get("mcpServers", {})
        print(f".mcp.json: {len(servers)} servers — {', '.join(sorted(servers.keys()))}")
    else:
        print(".mcp.json: not present")

    if args.phase == "before":
        print("Mode: UNSCOPED — .mcp.json will be temporarily removed during runs")
    else:
        print("Mode: SCOPED — using .mcp.json as deployed")
    print()

    task_nums = [args.task] if args.task else ["1", "2", "3"]

    for task_num in task_nums:
        await run_task(task_num, args.phase)
        reset_repo()

    # Print comparison if both phases exist
    print(f"\n{'='*60}")
    print("  RESULTS")
    print(f"{'='*60}\n")

    for task_num in ["1", "2", "3"]:
        before_path = RESULTS / f"task{task_num}-before.json"
        after_path = RESULTS / f"task{task_num}-after.json"

        if before_path.exists() and after_path.exists():
            with open(before_path) as f:
                before = json.load(f)
            with open(after_path) as f:
                after = json.load(f)

            b_cost = before.get("cost_usd") or 0
            a_cost = after.get("cost_usd") or 0
            cost_pct = ((b_cost - a_cost) / b_cost * 100) if b_cost > 0 else 0

            b_tokens = before["tokens"]["total"]
            a_tokens = after["tokens"]["total"]
            tok_pct = ((b_tokens - a_tokens) / b_tokens * 100) if b_tokens > 0 else 0

            print(f"  Task {task_num}: {before['task_name']}")
            print(f"    Before: {before['duration_human']} / {b_tokens:,} tok / ${b_cost:.2f} / {before['tool_calls']['total']} tools")
            print(f"    After:  {after['duration_human']} / {a_tokens:,} tok / ${a_cost:.2f} / {after['tool_calls']['total']} tools")
            print(f"    Δ cost: {cost_pct:+.1f}%  Δ tokens: {tok_pct:+.1f}%")
            print()
        else:
            # Print whichever exists
            for phase_name, path in [("before", before_path), ("after", after_path)]:
                if path.exists():
                    with open(path) as f:
                        d = json.load(f)
                    print(f"  Task {task_num} ({phase_name}): {d['duration_human']} / {d['tokens']['total']:,} tok / ${d.get('cost_usd', 0):.2f} / {d['tool_calls']['total']} tools")
            print()


if __name__ == "__main__":
    asyncio.run(main())
