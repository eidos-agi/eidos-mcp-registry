#!/usr/bin/env python3
"""
Benchmark runner — runs 3 tasks with scoped MCP servers using Claude Code Agent SDK.
Captures duration, tokens, cost, and tool calls for each task.

MUST be run from a regular terminal, NOT from inside a Claude Code session.
Run `claude /login` first if not authenticated.
"""

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


async def run_task(task_num: str):
    task = TASKS[task_num]
    print(f"\n{'='*60}")
    print(f"  TASK {task_num}: {task['name']} — SCOPED (after)")
    print(f"{'='*60}")

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
                result = {
                    "task": task_num,
                    "task_name": task["name"],
                    "phase": "after",
                    "state": "scoped_10_servers_via_mcp_json",
                    "collected_at": datetime.now(timezone.utc).isoformat(),
                    "duration_seconds": int(duration),
                    "duration_human": f"{int(duration // 60)}m {int(duration % 60)}s",
                    "tokens": {
                        "total": getattr(message, "input_tokens", 0) + getattr(message, "output_tokens", 0),
                        "note": "from agent SDK ResultMessage",
                    },
                    "cost_usd": getattr(message, "total_cost_usd", None),
                    "session_id": getattr(message, "session_id", None),
                    "num_turns": getattr(message, "num_turns", None),
                    "tool_calls": {
                        "total": len(tool_calls),
                        "by_tool": {},
                    },
                }

                for t in tool_calls:
                    result["tool_calls"]["by_tool"][t] = result["tool_calls"]["by_tool"].get(t, 0) + 1

                out_path = RESULTS / f"task{task_num}-after.json"
                with open(out_path, "w") as f:
                    json.dump(result, f, indent=2)

                print(f"\n  Duration:  {result['duration_human']}")
                print(f"  Tokens:    {result['tokens']['total']:,}")
                print(f"  Cost:      ${result['cost_usd']:.4f}" if result['cost_usd'] else "  Cost:      N/A")
                print(f"  Tools:     {len(tool_calls)}")
                print(f"  Turns:     {result['num_turns']}")
                print(f"  Saved:     {out_path}")
                return result

    return None


def reset_repo():
    """Reset repo state between tasks, preserving benchmarks and .mcp.json."""
    subprocess.run(["git", "checkout", "."], cwd=str(REPO), capture_output=True)
    # Only clean daemon/ to preserve benchmarks/ and .mcp.json
    subprocess.run(
        ["git", "clean", "-fd", "daemon/"],
        cwd=str(REPO), capture_output=True,
    )


async def main():
    RESULTS.mkdir(exist_ok=True)

    print("Benchmark: Scoped runs (after) via Claude Code Agent SDK")
    print(f"Repo: {REPO}")

    mcp_json = REPO / ".mcp.json"
    if mcp_json.exists():
        with open(mcp_json) as f:
            servers = json.load(f).get("mcpServers", {})
        print(f"Servers in .mcp.json: {len(servers)} — {', '.join(sorted(servers.keys()))}")
    else:
        print("WARNING: No .mcp.json found — deploy first!")
        return
    print()

    results = []
    for task_num in ["1", "2", "3"]:
        result = await run_task(task_num)
        results.append(result)
        reset_repo()

    # Print comparison
    print(f"\n{'='*60}")
    print("  COMPARISON: Before (unscoped) vs After (scoped)")
    print(f"{'='*60}\n")

    for task_num in ["1", "2", "3"]:
        before_path = RESULTS / f"task{task_num}-before.json"
        after_path = RESULTS / f"task{task_num}-after.json"

        if before_path.exists() and after_path.exists():
            with open(before_path) as f:
                before = json.load(f)
            with open(after_path) as f:
                after = json.load(f)

            b_tokens = before["tokens"]["total"]
            a_tokens = after["tokens"]["total"]
            pct = ((b_tokens - a_tokens) / b_tokens * 100) if b_tokens > 0 else 0

            print(f"  Task {task_num}: {before['task_name']}")
            print(f"    Before: {before['duration_human']} / {b_tokens:,} tokens / {before['tool_calls']['total']} tools")
            print(f"    After:  {after['duration_human']} / {a_tokens:,} tokens / {after['tool_calls']['total']} tools")
            print(f"    Δ tokens: {pct:+.1f}%")
            print()


if __name__ == "__main__":
    asyncio.run(main())
