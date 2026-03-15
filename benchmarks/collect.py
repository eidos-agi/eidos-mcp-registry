#!/usr/bin/env python3
"""
Benchmark data collector — extracts metrics from Claude Code session transcripts.

Usage:
    python3 collect.py <session-id> <task-number> <phase>

    session-id: The Claude Code session ID (from /sessions or session list)
    task-number: 1, 2, or 3
    phase: "before" or "after"

Example:
    python3 collect.py abc123-def456 1 before
"""

import json
import sys
import os
import re
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

BENCHMARKS_DIR = Path(__file__).parent
RESULTS_DIR = BENCHMARKS_DIR / "results"

# Servers that should only be relevant per-group (not universal)
# Used to detect "wrong tool" calls when scoped
IRRELEVANT_SERVERS_FOR_REGISTRY_WORK = {
    "wrike", "outlook", "eidos-mail", "reeves-messages", "reeves-comms",
    "reeves-global", "reeves-view", "rhea-diagrams", "helios",
    "eidos-image-forge", "eidos-book-forge", "eidos-elt-forge", "elt-forge",
    "eidos-consent", "director-daemon", "claude-resume", "railguey",
    "vercel", "keeper", "pal", "cerebro-mcp", "backlog",
}

TASK_NAMES = {
    "1": "Webhook Notification System",
    "2": "Server Dependency Tracking",
    "3": "Config Diff Viewer",
}


def find_session_file(session_id):
    """Find the session transcript JSONL file."""
    # Claude Code stores sessions in ~/.claude/projects/
    claude_dir = Path.home() / ".claude" / "projects"
    if not claude_dir.exists():
        print(f"ERROR: ~/.claude/projects/ not found")
        return None

    # Search for the session file
    for jsonl in claude_dir.rglob("*.jsonl"):
        if session_id in str(jsonl):
            return jsonl

    # Also check direct session files
    for jsonl in (Path.home() / ".claude").rglob("*.jsonl"):
        if session_id in str(jsonl):
            return jsonl

    print(f"ERROR: Session {session_id} not found")
    return None


def parse_session(filepath):
    """Parse a Claude Code session JSONL transcript."""
    messages = []
    with open(filepath) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
                messages.append(msg)
            except json.JSONDecodeError:
                continue
    return messages


def extract_metrics(messages):
    """Extract benchmark metrics from session messages.

    NOTE: Claude Code transcripts do NOT contain token/cost data.
    We extract: timestamps, tool calls, tool errors.
    Token counts and cost must be entered manually from /cost output.
    """
    metrics = {
        "timestamps": [],
        "tool_calls": [],
        "tool_calls_by_server": defaultdict(int),
        "tool_calls_failed": 0,
        "tool_calls_total": 0,
        "wrong_server_calls": [],
    }

    for msg in messages:
        # Extract timestamps
        if "timestamp" in msg:
            metrics["timestamps"].append(msg["timestamp"])

        # Extract tool calls from assistant messages
        if msg.get("type") == "assistant":
            content = msg.get("message", {}).get("content", [])
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        tool_name = block.get("name", "")
                        metrics["tool_calls_total"] += 1
                        metrics["tool_calls"].append(tool_name)

                        # Categorize by MCP server
                        if tool_name.startswith("mcp__"):
                            parts = tool_name.split("__")
                            if len(parts) >= 3:
                                server = parts[1]
                                metrics["tool_calls_by_server"][server] += 1

                                # Check if this is a "wrong" tool call
                                if server in IRRELEVANT_SERVERS_FOR_REGISTRY_WORK:
                                    metrics["wrong_server_calls"].append(tool_name)
                        else:
                            # Built-in tool (Read, Write, Bash, etc.)
                            metrics["tool_calls_by_server"]["_builtin"] += 1

        # Extract tool results — check for errors
        if msg.get("type") == "assistant":
            content = msg.get("message", {}).get("content", [])
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_result":
                        result_content = block.get("content", "")
                        if isinstance(result_content, str) and "error" in result_content.lower():
                            metrics["tool_calls_failed"] += 1

    # Compute duration from timestamps
    if len(metrics["timestamps"]) >= 2:
        try:
            start = datetime.fromisoformat(metrics["timestamps"][0].replace("Z", "+00:00"))
            end = datetime.fromisoformat(metrics["timestamps"][-1].replace("Z", "+00:00"))
            metrics["duration_seconds"] = (end - start).total_seconds()
        except (ValueError, TypeError):
            metrics["duration_seconds"] = 0
    else:
        metrics["duration_seconds"] = 0

    return metrics


def save_result(task_num, phase, metrics, manual_cost=None, manual_tokens=None):
    """Save benchmark result as JSON."""
    RESULTS_DIR.mkdir(exist_ok=True)

    result = {
        "task": task_num,
        "task_name": TASK_NAMES.get(str(task_num), f"Task {task_num}"),
        "phase": phase,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": metrics["duration_seconds"],
        "duration_human": f"{int(metrics['duration_seconds'] // 60)}m {int(metrics['duration_seconds'] % 60)}s",
        "tokens": manual_tokens or {"total": 0, "note": "enter from /cost"},
        "cost_usd": manual_cost or 0,
        "tool_calls": {
            "total": metrics["tool_calls_total"],
            "failed": metrics["tool_calls_failed"],
            "wrong_server": len(metrics["wrong_server_calls"]),
            "wrong_server_details": metrics["wrong_server_calls"][:50],
            "by_server": dict(metrics["tool_calls_by_server"]),
        },
    }

    filename = f"task{task_num}-{phase}.json"
    filepath = RESULTS_DIR / filename
    with open(filepath, "w") as f:
        json.dump(result, f, indent=2)

    return filepath, result


def print_summary(result):
    """Print a human-readable summary."""
    print(f"\n{'='*60}")
    print(f"  BENCHMARK RESULT: {result['task_name']}")
    print(f"  Phase: {result['phase'].upper()}")
    print(f"{'='*60}")
    print(f"  Duration:        {result['duration_human']}")
    print(f"  Total tokens:    {result['tokens']['total']:,}")
    print(f"  Cost:            ${result['cost_usd']:.4f}")
    print(f"  Tool calls:      {result['tool_calls']['total']}")
    print(f"  Failed calls:    {result['tool_calls']['failed']}")
    print(f"  Wrong-server:    {result['tool_calls']['wrong_server']}")
    print(f"{'='*60}")

    # Top tool servers
    by_server = result["tool_calls"]["by_server"]
    if by_server:
        print(f"\n  Tool calls by server:")
        for srv, count in sorted(by_server.items(), key=lambda x: -x[1])[:10]:
            wrong = " ← WRONG SERVER" if srv in IRRELEVANT_SERVERS_FOR_REGISTRY_WORK else ""
            print(f"    {srv:<25} {count:>4}{wrong}")

    if result["tool_calls"]["wrong_server_details"]:
        print(f"\n  Wrong-server tool calls:")
        for tool in result["tool_calls"]["wrong_server_details"]:
            print(f"    {tool}")

    print()


def manual_entry(task_num, phase):
    """Manually enter metrics when session parsing isn't available."""
    RESULTS_DIR.mkdir(exist_ok=True)

    print(f"\nManual entry for Task {task_num} ({phase})")
    print("Enter the values from the Claude Code session summary:\n")

    duration = input("  Duration (seconds): ").strip()
    tokens_input = input("  Input tokens: ").strip()
    tokens_output = input("  Output tokens: ").strip()
    cache_read = input("  Cache read tokens (0 if unknown): ").strip()
    cost = input("  Total cost ($): ").strip()
    tool_total = input("  Total tool calls: ").strip()
    tool_failed = input("  Failed tool calls: ").strip()
    wrong_server = input("  Wrong-server tool calls: ").strip()

    result = {
        "task": task_num,
        "task_name": TASK_NAMES.get(str(task_num), f"Task {task_num}"),
        "phase": phase,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "entry_method": "manual",
        "duration_seconds": float(duration or 0),
        "duration_human": f"{int(float(duration or 0) // 60)}m {int(float(duration or 0) % 60)}s",
        "tokens": {
            "input": int(tokens_input or 0),
            "output": int(tokens_output or 0),
            "cache_read": int(cache_read or 0),
            "total": int(tokens_input or 0) + int(tokens_output or 0) + int(cache_read or 0),
        },
        "cost_usd": float(cost or 0),
        "tool_calls": {
            "total": int(tool_total or 0),
            "failed": int(tool_failed or 0),
            "wrong_server": int(wrong_server or 0),
        },
    }

    filename = f"task{task_num}-{phase}.json"
    filepath = RESULTS_DIR / filename
    with open(filepath, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\n  Saved to {filepath}")
    return filepath, result


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(__doc__)
        print("\nAlternatively, for manual entry:")
        print("  python3 collect.py manual <task-number> <phase>")
        sys.exit(1)

    session_or_manual = sys.argv[1]
    task_num = sys.argv[2]
    phase = sys.argv[3]

    if phase not in ("before", "after"):
        print(f"ERROR: phase must be 'before' or 'after', got '{phase}'")
        sys.exit(1)

    if task_num not in ("1", "2", "3"):
        print(f"ERROR: task must be 1, 2, or 3, got '{task_num}'")
        sys.exit(1)

    if session_or_manual == "manual":
        filepath, result = manual_entry(task_num, phase)
        print_summary(result)
    else:
        session_file = find_session_file(session_or_manual)
        if not session_file:
            print(f"\nTip: Use 'manual' as session-id to enter data manually:")
            print(f"  python3 collect.py manual {task_num} {phase}")
            sys.exit(1)

        print(f"Parsing session: {session_file}")
        messages = parse_session(session_file)
        print(f"  Found {len(messages)} messages")

        metrics = extract_metrics(messages)
        print(f"  Duration: {int(metrics['duration_seconds']//60)}m {int(metrics['duration_seconds']%60)}s")
        print(f"  Tool calls: {metrics['tool_calls_total']}")
        print(f"  Wrong-server calls: {len(metrics['wrong_server_calls'])}")

        # Token/cost data must come from user — not in transcript
        print(f"\n  Token/cost data is NOT in session transcripts.")
        print(f"  Enter from the /cost output at end of session:\n")
        cost_str = input("  Total cost ($, e.g. 1.23): ").strip()
        tokens_input = input("  Input tokens (e.g. 450000): ").strip()
        tokens_output = input("  Output tokens (e.g. 32000): ").strip()
        cache_read = input("  Cache read tokens (0 if unknown): ").strip()

        manual_cost = float(cost_str) if cost_str else 0
        manual_tokens = {
            "input": int(tokens_input) if tokens_input else 0,
            "output": int(tokens_output) if tokens_output else 0,
            "cache_read": int(cache_read) if cache_read else 0,
            "total": (int(tokens_input or 0) + int(tokens_output or 0) + int(cache_read or 0)),
        }

        filepath, result = save_result(task_num, phase, metrics, manual_cost, manual_tokens)

        print(f"\n  Saved to {filepath}")
        print_summary(result)
