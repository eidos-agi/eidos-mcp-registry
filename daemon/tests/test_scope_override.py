"""
Layer 4 — Scope Override Tests

Claude Code's scoping: project .mcp.json overrides user ~/.claude.json
for the SAME server name. This is critical to understand:
- If we deploy cerebro-mcp to project scope, it REPLACES the user-scope version
- Different env vars, different command, different url — project wins entirely
- This is either a feature (per-project config) or a bug (stale deploy)

These tests verify the deployer handles this correctly.
"""

import json
from pathlib import Path

import pytest

from mcp_registry.deployer import (
    _build_mcp_json,
    _build_server_entry,
    _merge_mcp_json,
    preview,
    deploy,
)


class TestScopeOverrideAwareness:
    """When a server exists at both user and project scope, project wins."""

    def test_deployed_config_matches_user_scope(self, store_with_group):
        """Default: deployed .mcp.json should match user scope config exactly."""
        store, group_path, repos = store_with_group

        deploy(store, only_groups=["repos-test"])

        mcp_path = Path(repos[0]) / ".mcp.json"
        data = json.loads(mcp_path.read_text())

        # Get the server config from the store (which came from user scope)
        snapshot = store.snapshot()
        for server_name in data["_registry_managed"]:
            deployed = data["mcpServers"][server_name]
            source = _build_server_entry(snapshot["servers"][server_name])
            assert deployed == source, (
                f"Deployed config for {server_name} doesn't match source. "
                f"This means project scope will override user scope with DIFFERENT config.\n"
                f"Deployed: {deployed}\n"
                f"Source:   {source}"
            )

    def test_empty_args_vs_missing_args(self):
        """args: [] and no args key should produce same effective config."""
        srv_with_args = {"type": "stdio", "command": "echo", "args": []}
        srv_without_args = {"type": "stdio", "command": "echo"}

        entry_with = _build_server_entry(srv_with_args)
        entry_without = _build_server_entry(srv_without_args)

        # Both should omit args (empty list is falsy)
        assert "args" not in entry_with, "Empty args should be omitted"
        assert "args" not in entry_without

    def test_empty_env_vs_missing_env(self):
        """env: {} and no env key should produce same effective config."""
        srv_with_env = {"type": "stdio", "command": "echo", "env": {}}
        srv_without_env = {"type": "stdio", "command": "echo"}

        entry_with = _build_server_entry(srv_with_env)
        entry_without = _build_server_entry(srv_without_env)

        assert "env" not in entry_with, "Empty env should be omitted"
        assert "env" not in entry_without


class TestOverrideDetection:
    """The deployer should detect when it would create a scope override."""

    def test_detect_servers_also_at_user_scope(self, store_with_group):
        """Preview should flag servers that exist at both user and project scope."""
        store, group_path, repos = store_with_group

        changes = preview(store)
        for change in changes.values():
            # Every server we deploy is also at user scope (source_scope: "user")
            # This IS a scope override situation
            snapshot = store.snapshot()
            for srv_name in change["servers"]:
                srv = snapshot["servers"].get(srv_name, {})
                if srv.get("source_scope") == "user":
                    # This server will be overridden at project scope
                    # The deployed config should match user scope exactly
                    deployed_entry = change["content"]["mcpServers"][srv_name]
                    source_entry = _build_server_entry(srv)
                    assert deployed_entry == source_entry, (
                        f"Server {srv_name} would create a scope override with "
                        f"DIFFERENT config than user scope"
                    )


class TestScopeOverrideEdgeCases:
    """Edge cases around the override behavior."""

    def test_project_scope_with_different_env(self, store_with_group):
        """If someone wants per-project env vars, the override is intentional."""
        store, group_path, repos = store_with_group

        # Simulate: user has taskr with one API key
        # Someone sets a per-repo override with a different key
        store.set_override(repos[0], add=["taskr"])

        # This is fine — the user intentionally wants different config per repo
        # But the deployer should use the SAME config from the registry
        # (per-repo env overrides are a future feature)
        changes = preview(store)
        mcp_path = str(Path(repos[0]) / ".mcp.json")
        if mcp_path in changes:
            assert "taskr" in changes[mcp_path]["content"]["mcpServers"]

    def test_http_server_override_preserves_url(self):
        """HTTP servers: url must match between scopes or it's a different server."""
        servers = {
            "github": {
                "type": "http",
                "url": "https://api.githubcopilot.com/mcp",
                "headers": {"Authorization": "Bearer ghp_xxx"},
            }
        }
        result = _build_mcp_json(["github"], servers)
        entry = result["mcpServers"]["github"]
        assert entry["url"] == "https://api.githubcopilot.com/mcp"
        assert entry["type"] == "http"

    def test_no_phantom_keys_in_override(self):
        """Deployed entry must not have keys absent from source — phantom keys
        would silently change behavior when project overrides user scope."""
        source = {
            "type": "stdio",
            "command": "cerebro-mcp",
            "env": {"KEY": "val"},
            "name": "cerebro-mcp",       # internal
            "source_scope": "user",       # internal
            "health": "connected",        # internal
        }
        entry = _build_server_entry(source)
        # Only valid Claude Code keys
        assert set(entry.keys()).issubset({"type", "command", "args", "env", "url", "headers", "oauth"})
        # No internal fields
        assert "name" not in entry
        assert "source_scope" not in entry
        assert "health" not in entry
