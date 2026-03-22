#!/usr/bin/env python3
"""
A/B benchmark: 27 servers vs 5 servers.

- 10 small tasks (single-prompt, focused)
- Random assignment: each task randomly gets 27 or 5 servers first
- Both configs run for every task, order randomized
- Results saved with condition labels, not ordering

Run from a regular terminal. `claude /login` first.
"""

import asyncio
import json
import random
import shutil
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

REPO = Path(".")
RESULTS = REPO / "benchmarks" / "ab_results"
BENCHMARKS = REPO / "benchmarks"

CONFIGS = {
    "27srv": BENCHMARKS / "all-servers.mcp.json",
    "5srv":  BENCHMARKS / "scoped-servers.mcp.json",
}

# 10 tasks across 3 difficulty levels
# Easy: single file, one function/endpoint
# Medium: 2-3 files, some coordination
# Hard: 3+ files, cross-cutting, tests required
TASKS = [
    # === EASY (single file, ~1 min) ===
    {
        "id": "health-endpoint",
        "difficulty": "easy",
        "prompt": "Add a GET /health endpoint to server.py that returns {\"status\": \"ok\", \"uptime_seconds\": <seconds since startup>}. Store the startup time in a module-level variable.",
    },
    {
        "id": "server-count",
        "difficulty": "easy",
        "prompt": "Add a method server_count() to RegistryStore in store.py that returns the number of servers. Add a method group_count() that returns the number of groups excluding __universal__.",
    },
    {
        "id": "notification-count",
        "difficulty": "easy",
        "prompt": "Add a GET /notifications/count endpoint to server.py that returns {\"pending\": N, \"approved\": N, \"dismissed\": N} by counting notifications in each status.",
    },
    # === MEDIUM (2-3 files, ~2 min) ===
    {
        "id": "server-search",
        "difficulty": "medium",
        "prompt": "Add a GET /servers/search?q=<query> endpoint to server.py that returns servers whose name contains the query string (case-insensitive). Include each server's groups and health status in the response. Write a test.",
    },
    {
        "id": "json-export",
        "difficulty": "medium",
        "prompt": "Add a GET /export endpoint to server.py that returns the full registry state as a downloadable JSON file with Content-Disposition header set to 'attachment; filename=registry-export.json'. Write a test.",
    },
    {
        "id": "activity-filter",
        "difficulty": "medium",
        "prompt": "Add an optional 'event_type' query parameter to the GET /activity endpoint in server.py that filters the activity log to only return events matching that type. Add a 'since' parameter that filters by timestamp. Write tests for both.",
    },
    {
        "id": "group-stats",
        "difficulty": "medium",
        "prompt": "Add a GET /groups/{group_key}/stats endpoint to server.py that returns {\"server_count\": N, \"repo_count\": N, \"has_webhook\": bool, \"last_deploy\": timestamp_or_null}. Pull repo count from the scanner. Write a test.",
    },
    # === HARD (3+ files, cross-cutting, ~3-5 min) ===
    {
        "id": "deploy-dry-run",
        "difficulty": "hard",
        "prompt": "Add a 'dry_run' boolean field to the deploy endpoint request body in server.py. When true, run the full deploy preview including merge strategy and secrets masking, but don't write any files. Return the preview result. Ensure the deploy lock is still acquired during dry run. Write tests covering both dry_run=true and dry_run=false paths.",
    },
    {
        "id": "store-backup",
        "difficulty": "hard",
        "prompt": "Add a backup() method to RegistryStore in store.py that copies registry.json to a timestamped backup file. Add a list_backups() method that returns available backups sorted by date. Add a restore(backup_path) method that loads a backup. Add GET /backups and POST /restore endpoints in server.py. Write tests for the store methods and the endpoints.",
    },
    {
        "id": "server-disable-cascade",
        "difficulty": "hard",
        "prompt": "When a server is disabled, check if any other servers depend on it (via the dependency system). If so, create a notification warning that disabling this server will break dependencies in specific groups. Add the check to the disable endpoint in server.py, create the notification via notifications.py, and update the server detail UI in servers-view.js to show dependent servers. Write tests.",
    },
]


async def run_single(task: dict, config_name: str, run_id: int) -> dict:
    """Run one task with one config. Returns result dict."""
    config_path = CONFIGS[config_name]
    mcp_json = REPO / ".mcp.json"
    mcp_backup = REPO / ".mcp.json.ab-backup"

    with open(config_path) as f:
        server_count = len(json.load(f).get("mcpServers", {}))

    print(f"  [{run_id}] {task['id']} | {config_name} ({server_count} srv) ...", end="", flush=True)

    # Swap config
    if mcp_json.exists():
        mcp_json.rename(mcp_backup)
    shutil.copy2(config_path, mcp_json)

    try:
        options = ClaudeAgentOptions(
            permission_mode="bypassPermissions",
            cwd=REPO / "daemon",
            max_budget_usd=2.0,
            max_turns=25,
        )

        tool_calls = []
        start = time.time()

        async with ClaudeSDKClient(options=options) as client:
            await client.query(task["prompt"])

            async for message in client.receive_messages():
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, ToolUseBlock):
                            tool_calls.append(block.name)

                elif isinstance(message, ResultMessage):
                    duration = time.time() - start
                    usage = message.usage or {}

                    result = {
                        "task_id": task["id"],
                        "difficulty": task.get("difficulty", "unknown"),
                        "config": config_name,
                        "server_count": server_count,
                        "run_id": run_id,
                        "collected_at": datetime.now(timezone.utc).isoformat(),
                        "duration_seconds": round(duration, 1),
                        "tokens": {
                            "input": usage.get("input_tokens", 0),
                            "output": usage.get("output_tokens", 0),
                            "cache_read": usage.get("cache_read_input_tokens", 0),
                            "cache_creation": usage.get("cache_creation_input_tokens", 0),
                            "total": usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
                        },
                        "cost_usd": message.total_cost_usd,
                        "num_turns": message.num_turns,
                        "is_error": getattr(message, "is_error", False),
                        "tool_calls": len(tool_calls),
                        "tool_breakdown": {},
                    }

                    for t in tool_calls:
                        result["tool_breakdown"][t] = result["tool_breakdown"].get(t, 0) + 1

                    cost_str = f"${result['cost_usd']:.2f}" if result['cost_usd'] else "N/A"
                    print(f" {result['duration_seconds']:.0f}s | {cost_str} | {len(tool_calls)} tools | {result['num_turns']} turns")
                    return result

    finally:
        mcp_json.unlink(missing_ok=True)
        if mcp_backup.exists():
            mcp_backup.rename(mcp_json)

    return None


def reset_repo():
    import subprocess
    subprocess.run(["git", "checkout", "."], cwd=str(REPO), capture_output=True)
    subprocess.run(["git", "clean", "-fd", "daemon/"], cwd=str(REPO), capture_output=True)


async def main():
    RESULTS.mkdir(exist_ok=True)

    print("A/B Benchmark: 27 servers vs 5 servers")
    print(f"Tasks: {len(TASKS)}")
    print(f"Runs: {len(TASKS) * 2} (each task × both configs)")
    print()

    # Build randomized run order
    runs = []
    for task in TASKS:
        order = ["27srv", "5srv"]
        random.shuffle(order)
        for config in order:
            runs.append((task, config))

    # Shuffle all runs globally for maximum randomization
    random.shuffle(runs)

    print(f"Run order (randomized):")
    for i, (task, config) in enumerate(runs):
        print(f"  {i+1:2d}. {task['id']:<20s} {config}")
    print()

    all_results = []
    for i, (task, config) in enumerate(runs):
        reset_repo()
        result = await run_single(task, config, i + 1)
        if result:
            all_results.append(result)
            # Save incrementally
            with open(RESULTS / "all_runs.json", "w") as f:
                json.dump(all_results, f, indent=2)

    # Summary
    print(f"\n{'='*60}")
    print("  RESULTS SUMMARY")
    print(f"{'='*60}\n")

    by_config = {"27srv": [], "5srv": []}
    for r in all_results:
        by_config[r["config"]].append(r)

    for config_name, results in by_config.items():
        costs = [r["cost_usd"] for r in results if r["cost_usd"]]
        durations = [r["duration_seconds"] for r in results]
        tools = [r["tool_calls"] for r in results]
        turns = [r["num_turns"] for r in results if r["num_turns"]]

        avg_cost = sum(costs) / len(costs) if costs else 0
        avg_dur = sum(durations) / len(durations) if durations else 0
        avg_tools = sum(tools) / len(tools) if tools else 0
        avg_turns = sum(turns) / len(turns) if turns else 0

        print(f"  {config_name} ({len(results)} runs):")
        print(f"    Avg cost:     ${avg_cost:.4f}")
        print(f"    Avg duration: {avg_dur:.0f}s")
        print(f"    Avg tools:    {avg_tools:.0f}")
        print(f"    Avg turns:    {avg_turns:.0f}")
        print()

    # By difficulty
    for diff in ["easy", "medium", "hard"]:
        d27 = [r for r in by_config["27srv"] if r.get("difficulty") == diff]
        d5 = [r for r in by_config["5srv"] if r.get("difficulty") == diff]
        if d27 and d5:
            avg27 = sum(r["cost_usd"] or 0 for r in d27) / len(d27)
            avg5 = sum(r["cost_usd"] or 0 for r in d5) / len(d5)
            delta = ((avg5 - avg27) / avg27 * 100) if avg27 > 0 else 0
            print(f"  {diff.upper():<8s}  27srv avg ${avg27:.2f}  |  5srv avg ${avg5:.2f}  |  Δ {delta:+.1f}%")
    print()

    # Per-task comparison
    print(f"  {'Task':<22s} {'Diff':<7s} {'27srv $':>8s} {'5srv $':>8s} {'Δ':>8s}")
    print(f"  {'-'*22} {'-'*7} {'-'*8} {'-'*8} {'-'*8}")

    task_results = {}
    for r in all_results:
        key = r["task_id"]
        if key not in task_results:
            task_results[key] = {"difficulty": r.get("difficulty", "?")}
        task_results[key][r["config"]] = r

    for task_id, configs in task_results.items():
        c27 = configs.get("27srv", {}).get("cost_usd", 0) or 0
        c5 = configs.get("5srv", {}).get("cost_usd", 0) or 0
        delta = ((c5 - c27) / c27 * 100) if c27 > 0 else 0
        diff = configs.get("difficulty", "?")
        print(f"  {task_id:<22s} {diff:<7s} ${c27:>7.2f} ${c5:>7.2f} {delta:>+7.1f}%")

    print()
    print(f"  Results saved to: {RESULTS / 'all_runs.json'}")


if __name__ == "__main__":
    asyncio.run(main())
