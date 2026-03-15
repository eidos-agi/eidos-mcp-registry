#!/usr/bin/env python3
"""
Compare before/after benchmark results and generate summary.

Usage:
    python3 compare.py

Reads all task*-before.json and task*-after.json from results/ and
outputs a comparison table.
"""

import json
from pathlib import Path

RESULTS_DIR = Path(__file__).parent / "results"


def load_result(task_num, phase):
    filepath = RESULTS_DIR / f"task{task_num}-{phase}.json"
    if not filepath.exists():
        return None
    with open(filepath) as f:
        return json.load(f)


def pct_change(before, after):
    if before == 0:
        return "N/A"
    change = ((after - before) / before) * 100
    return f"{change:+.1f}%"


def main():
    print("\n" + "=" * 80)
    print("  EIDOS MCP REGISTRY — BENCHMARK COMPARISON")
    print("  All 27 servers in universal (BEFORE) vs properly scoped (AFTER)")
    print("=" * 80)

    totals = {"before": {}, "after": {}}

    for task_num in ["1", "2", "3"]:
        before = load_result(task_num, "before")
        after = load_result(task_num, "after")

        if not before and not after:
            continue

        print(f"\n  Task {task_num}: {before['task_name'] if before else after['task_name']}")
        print(f"  {'-' * 70}")

        header = f"  {'Metric':<30} {'BEFORE':>12} {'AFTER':>12} {'Change':>12}"
        print(header)
        print(f"  {'-' * 70}")

        if before and after:
            rows = [
                ("Duration", before["duration_human"], after["duration_human"],
                 pct_change(before["duration_seconds"], after["duration_seconds"])),
                ("Total tokens", f"{before['tokens']['total']:,}", f"{after['tokens']['total']:,}",
                 pct_change(before["tokens"]["total"], after["tokens"]["total"])),
                ("Input tokens", f"{before['tokens']['input']:,}", f"{after['tokens']['input']:,}",
                 pct_change(before["tokens"]["input"], after["tokens"]["input"])),
                ("Output tokens", f"{before['tokens']['output']:,}", f"{after['tokens']['output']:,}",
                 pct_change(before["tokens"]["output"], after["tokens"]["output"])),
                ("Cost (USD)", f"${before['cost_usd']:.4f}", f"${after['cost_usd']:.4f}",
                 pct_change(before["cost_usd"], after["cost_usd"])),
                ("Tool calls", str(before["tool_calls"]["total"]), str(after["tool_calls"]["total"]),
                 pct_change(before["tool_calls"]["total"], after["tool_calls"]["total"])),
                ("Failed calls", str(before["tool_calls"]["failed"]), str(after["tool_calls"]["failed"]),
                 pct_change(before["tool_calls"]["failed"], after["tool_calls"]["failed"])),
                ("Wrong-server calls", str(before["tool_calls"]["wrong_server"]),
                 str(after["tool_calls"]["wrong_server"]),
                 pct_change(before["tool_calls"]["wrong_server"], after["tool_calls"]["wrong_server"])),
            ]
            for label, b, a, change in rows:
                print(f"  {label:<30} {b:>12} {a:>12} {change:>12}")

            # Accumulate totals
            for phase, data in [("before", before), ("after", after)]:
                for key in ["duration_seconds", "cost_usd"]:
                    totals[phase][key] = totals[phase].get(key, 0) + data[key]
                for key in ["total", "input", "output"]:
                    tk = f"tokens_{key}"
                    totals[phase][tk] = totals[phase].get(tk, 0) + data["tokens"][key]
                for key in ["total", "failed", "wrong_server"]:
                    tk = f"tools_{key}"
                    totals[phase][tk] = totals[phase].get(tk, 0) + data["tool_calls"][key]

        elif before:
            print(f"  (AFTER data not yet collected)")
            for label, val in [
                ("Duration", before["duration_human"]),
                ("Total tokens", f"{before['tokens']['total']:,}"),
                ("Cost (USD)", f"${before['cost_usd']:.4f}"),
                ("Tool calls", str(before["tool_calls"]["total"])),
            ]:
                print(f"  {label:<30} {val:>12} {'---':>12} {'---':>12}")

    # Print totals if we have both phases
    if totals["before"] and totals["after"]:
        b, a = totals["before"], totals["after"]
        print(f"\n{'=' * 80}")
        print(f"  TOTALS ACROSS ALL TASKS")
        print(f"  {'-' * 70}")
        print(f"  {'Metric':<30} {'BEFORE':>12} {'AFTER':>12} {'Savings':>12}")
        print(f"  {'-' * 70}")

        dur_b = f"{int(b.get('duration_seconds',0)//60)}m {int(b.get('duration_seconds',0)%60)}s"
        dur_a = f"{int(a.get('duration_seconds',0)//60)}m {int(a.get('duration_seconds',0)%60)}s"
        print(f"  {'Total time':<30} {dur_b:>12} {dur_a:>12} {pct_change(b.get('duration_seconds',0), a.get('duration_seconds',0)):>12}")
        print(f"  {'Total tokens':<30} {b.get('tokens_total',0):>12,} {a.get('tokens_total',0):>12,} {pct_change(b.get('tokens_total',0), a.get('tokens_total',0)):>12}")
        print(f"  {'Total cost':<30} {'$'+f'{b.get(\"cost_usd\",0):.2f}':>12} {'$'+f'{a.get(\"cost_usd\",0):.2f}':>12} {pct_change(b.get('cost_usd',0), a.get('cost_usd',0)):>12}")
        print(f"  {'Total tool calls':<30} {b.get('tools_total',0):>12} {a.get('tools_total',0):>12} {pct_change(b.get('tools_total',0), a.get('tools_total',0)):>12}")
        print(f"  {'Wrong-server calls':<30} {b.get('tools_wrong_server',0):>12} {a.get('tools_wrong_server',0):>12} {pct_change(b.get('tools_wrong_server',0), a.get('tools_wrong_server',0)):>12}")

        savings = b.get("cost_usd", 0) - a.get("cost_usd", 0)
        time_saved = b.get("duration_seconds", 0) - a.get("duration_seconds", 0)
        print(f"\n  SAVINGS: ${savings:.2f} and {int(time_saved//60)}m {int(time_saved%60)}s across 3 tasks")
        print(f"  Projected monthly (100 msgs/day): ${savings * 100 * 30:.0f}")

    print(f"\n{'=' * 80}\n")


if __name__ == "__main__":
    main()
