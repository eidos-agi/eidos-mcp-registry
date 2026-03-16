#!/usr/bin/env python3
"""
Benchmark: prove coding is better with fewer MCP servers.

--phase before: 27 servers (all-servers.mcp.json)
--phase after:  5 servers (scoped-servers.mcp.json)

Same tasks, same SDK, same machine. Only the server count changes.

Run from a regular terminal (not inside Claude Code).
Run `claude /login` first if needed.
"""

import argparse
import asyncio
import json
import shutil
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
BENCHMARKS = REPO / "benchmarks"

CONFIGS = {
    "before": BENCHMARKS / "all-servers.mcp.json",      # 27 servers
    "after":  BENCHMARKS / "scoped-servers.mcp.json",    # 5 servers
}

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
    config_path = CONFIGS[phase]
    mcp_json = REPO / ".mcp.json"
    mcp_backup = REPO / ".mcp.json.benchmark-backup"

    with open(config_path) as f:
        server_count = len(json.load(f).get("mcpServers", {}))

    print(f"\n{'='*60}")
    print(f"  TASK {task_num}: {task['name']}")
    print(f"  Phase: {phase.upper()} ({server_count} servers)")
    print(f"{'='*60}")

    # Swap in the right config
    if mcp_json.exists():
        mcp_json.rename(mcp_backup)
    shutil.copy2(config_path, mcp_json)

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
                            preview = block.text[:80].replace('\n', ' ')
                            print(f"  ... {preview}")
                        elif isinstance(block, ToolUseBlock):
                            tool_calls.append(block.name)

                elif isinstance(message, ResultMessage):
                    duration = time.time() - start
                    usage = message.usage or {}

                    result = {
                        "task": task_num,
                        "task_name": task["name"],
                        "phase": phase,
                        "server_count": server_count,
                        "collected_at": datetime.now(timezone.utc).isoformat(),
                        "duration_seconds": int(duration),
                        "duration_human": f"{int(duration // 60)}m {int(duration % 60)}s",
                        "duration_ms": getattr(message, "duration_ms", 0),
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

                    cost_str = f"${result['cost_usd']:.4f}" if result['cost_usd'] else "N/A"
                    print(f"\n  Duration:  {result['duration_human']}")
                    print(f"  Tokens:    {result['tokens']['total']:,} (in:{result['tokens']['input']:,} out:{result['tokens']['output']:,})")
                    print(f"  Cost:      {cost_str}")
                    print(f"  Tools:     {len(tool_calls)}  Turns: {result['num_turns']}")
                    if usage:
                        print(f"  Usage:     {json.dumps(usage)[:200]}")
                    print(f"  Saved:     {out_path}")
                    return result

    finally:
        # Restore original .mcp.json
        mcp_json.unlink(missing_ok=True)
        if mcp_backup.exists():
            mcp_backup.rename(mcp_json)

    return None


def reset_repo():
    subprocess.run(["git", "checkout", "."], cwd=str(REPO), capture_output=True)
    subprocess.run(["git", "clean", "-fd", "daemon/"], cwd=str(REPO), capture_output=True)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", required=True, choices=["before", "after"])
    parser.add_argument("--task", type=str, default=None, help="Single task: 1, 2, or 3")
    args = parser.parse_args()

    RESULTS.mkdir(exist_ok=True)

    config_path = CONFIGS[args.phase]
    with open(config_path) as f:
        servers = json.load(f).get("mcpServers", {})

    print(f"Benchmark: {args.phase.upper()}")
    print(f"Config: {config_path.name} ({len(servers)} servers)")
    print(f"Servers: {', '.join(sorted(servers.keys()))}")
    print()

    task_nums = [args.task] if args.task else ["1", "2", "3"]

    for task_num in task_nums:
        await run_task(task_num, args.phase)
        reset_repo()

    # Comparison
    print(f"\n{'='*60}")
    print("  COMPARISON")
    print(f"{'='*60}\n")

    for task_num in ["1", "2", "3"]:
        before_path = RESULTS / f"task{task_num}-before.json"
        after_path = RESULTS / f"task{task_num}-after.json"

        if before_path.exists() and after_path.exists():
            with open(before_path) as f:
                b = json.load(f)
            with open(after_path) as f:
                a = json.load(f)

            b_cost = b.get("cost_usd") or 0
            a_cost = a.get("cost_usd") or 0
            cost_delta = ((a_cost - b_cost) / b_cost * 100) if b_cost > 0 else 0

            print(f"  Task {task_num}: {b['task_name']}")
            print(f"    27 srv: {b['duration_human']:>8} | {b['tokens']['total']:>8,} tok | ${b_cost:>6.2f} | {b['tool_calls']['total']:>3} tools")
            print(f"     5 srv: {a['duration_human']:>8} | {a['tokens']['total']:>8,} tok | ${a_cost:>6.2f} | {a['tool_calls']['total']:>3} tools")
            print(f"    Cost Δ: {cost_delta:+.1f}%")
            print()


if __name__ == "__main__":
    asyncio.run(main())
