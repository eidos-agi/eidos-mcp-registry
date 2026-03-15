"""
Scan worker — runs as a subprocess, streams JSON lines to stdout.

Usage: python -m mcp_registry.scan_worker

Each line is a JSON object with a "step" field for progress tracking.
Final line has step="result" with the full scan data.
The parent daemon reads these lines and publishes to SSE.
"""

import json

from mcp_registry.scanner import (
    scan_claude_mcp_list,
    scan_claude_json,
    discover_repo_groups,
    list_repos_in_group,
)


def emit(step, detail="", **kw):
    print(json.dumps({"step": step, "detail": detail, **kw}), flush=True)


def main():
    emit("parallel_start", "Launching 3 discovery sources in parallel...")

    # We run these sequentially in the subprocess — it's already isolated
    # from the daemon, so no need for threads here.

    # Lane 1: CLI
    emit("lane_start", "Running claude mcp list...", lane="cli", label="CLI Discovery")
    cli_servers = scan_claude_mcp_list()
    emit("lane_done", f"{len(cli_servers)} servers from CLI",
         lane="cli", servers=sorted(cli_servers.keys()), count=len(cli_servers))

    # Lane 2: Config
    emit("lane_start", "Reading ~/.claude.json...", lane="config", label="Config Files")
    json_servers = scan_claude_json()
    emit("lane_done", f"{len(json_servers)} servers from config",
         lane="config", servers=sorted(json_servers.keys()), count=len(json_servers))

    # Lane 3: Groups
    emit("lane_start", "Scanning ~/repos-*/ directories...", lane="groups", label="Repo Groups")
    repo_groups = discover_repo_groups()
    group_details = []
    for key, group in repo_groups.items():
        repos = list_repos_in_group(group["path"]) if group.get("path") else []
        group_details.append({"key": key, "label": group["label"],
                              "path": group.get("path"), "repos": len(repos)})
    total_repos = sum(g["repos"] for g in group_details)
    emit("lane_done", f"{len(repo_groups)} groups, {total_repos} repos",
         lane="groups", groups=group_details, count=len(repo_groups),
         total_repos=total_repos)

    # Merge
    all_servers = {**json_servers, **cli_servers}
    emit("merge_start", f"Merging {len(all_servers)} unique servers...")
    emit("merge_done", f"{len(all_servers)} servers, {len(repo_groups)} groups ready",
         servers_found=len(all_servers), groups_found=len(repo_groups))

    # Final result — full data for the daemon to ingest
    emit("result",
         servers=all_servers,
         groups={k: {"label": v["label"], "path": v.get("path")} for k, v in repo_groups.items()},
         servers_found=len(all_servers),
         groups_found=len(repo_groups),
         group_details=group_details)


if __name__ == "__main__":
    main()
