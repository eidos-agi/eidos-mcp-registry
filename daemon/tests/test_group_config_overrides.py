"""
Per-Group Server Config Overrides

Different orgs need different configs for the same MCP server.
Example: cerebro-mcp → production Supabase for greenmark, staging for local dev.

The override is a deep merge: base config + group overrides.
Only valid Claude Code keys are applied.
"""

import json
from pathlib import Path

from mcp_registry.deployer import (
    _build_mcp_json,
    _build_server_entry,
    _deep_merge,
    preview,
    deploy,
)


# ── Deep Merge ────────────────────────────────────────────────────


class TestDeepMerge:

    def test_flat_override(self):
        base = {"command": "echo", "type": "stdio"}
        override = {"command": "cat"}
        result = _deep_merge(base, override)
        assert result == {"command": "cat", "type": "stdio"}

    def test_nested_env_merge(self):
        base = {"env": {"A": "1", "B": "2"}}
        override = {"env": {"B": "NEW", "C": "3"}}
        result = _deep_merge(base, override)
        assert result == {"env": {"A": "1", "B": "NEW", "C": "3"}}

    def test_override_adds_new_keys(self):
        base = {"type": "stdio"}
        override = {"command": "echo"}
        result = _deep_merge(base, override)
        assert result == {"type": "stdio", "command": "echo"}

    def test_empty_override_is_noop(self):
        base = {"type": "stdio", "command": "echo"}
        result = _deep_merge(base, {})
        assert result == base

    def test_deep_nested(self):
        base = {"a": {"b": {"c": 1, "d": 2}}}
        override = {"a": {"b": {"c": 99}}}
        result = _deep_merge(base, override)
        assert result == {"a": {"b": {"c": 99, "d": 2}}}


# ── Store API ─────────────────────────────────────────────────────


class TestGroupServerConfigStore:

    def test_set_and_get(self, tmp_registry):
        tmp_registry.upsert_server("cerebro", {"type": "stdio", "command": "cerebro-mcp"})
        tmp_registry.create_group("grp", "Group")
        tmp_registry.assign("cerebro", "grp")

        ok = tmp_registry.set_group_server_config("grp", "cerebro", {
            "env": {"SUPABASE_URL": "https://staging.supabase.co"}
        })
        assert ok is True

        config = tmp_registry.get_group_server_config("grp", "cerebro")
        assert config == {"env": {"SUPABASE_URL": "https://staging.supabase.co"}}

    def test_nonexistent_group_returns_false(self, tmp_registry):
        ok = tmp_registry.set_group_server_config("nope", "cerebro", {"env": {}})
        assert ok is False

    def test_get_unconfigured_returns_empty(self, tmp_registry):
        tmp_registry.create_group("grp", "Group")
        config = tmp_registry.get_group_server_config("grp", "cerebro")
        assert config == {}

    def test_clear_config(self, tmp_registry):
        tmp_registry.create_group("grp", "Group")
        tmp_registry.set_group_server_config("grp", "cerebro", {"env": {"A": "1"}})
        tmp_registry.set_group_server_config("grp", "cerebro", {})
        config = tmp_registry.get_group_server_config("grp", "cerebro")
        assert config == {}

    def test_persists_across_reload(self, tmp_path, monkeypatch):
        from mcp_registry.store import RegistryStore
        monkeypatch.setattr("mcp_registry.store.DATA_DIR", tmp_path)
        monkeypatch.setattr("mcp_registry.store.REGISTRY_FILE", tmp_path / "registry.json")

        store1 = RegistryStore()
        store1.create_group("grp", "Group")
        store1.set_group_server_config("grp", "cerebro", {"env": {"KEY": "val"}})

        store2 = RegistryStore()
        config = store2.get_group_server_config("grp", "cerebro")
        assert config == {"env": {"KEY": "val"}}


# ── Deployer Integration ──────────────────────────────────────────


class TestGroupConfigInDeploy:

    def test_env_override_applied(self, store_with_group):
        """Group-level env override should appear in deployed .mcp.json."""
        store, group_path, repos = store_with_group

        store.set_group_server_config("repos-test", "cerebro-mcp", {
            "env": {"CEREBRO_DB": "/override/path.db"}
        })

        deploy(store, only_groups=["repos-test"])

        mcp_path = Path(repos[0]) / ".mcp.json"
        data = json.loads(mcp_path.read_text())
        cerebro = data["mcpServers"]["cerebro-mcp"]
        assert cerebro["env"]["CEREBRO_DB"] == "/override/path.db"

    def test_env_merge_not_replace(self, store_with_group):
        """Override merges env vars, doesn't replace the whole env dict."""
        store, group_path, repos = store_with_group

        # Base config has CEREBRO_DB from fixture
        store.set_group_server_config("repos-test", "cerebro-mcp", {
            "env": {"EXTRA_VAR": "hello"}
        })

        deploy(store, only_groups=["repos-test"])

        mcp_path = Path(repos[0]) / ".mcp.json"
        data = json.loads(mcp_path.read_text())
        cerebro_env = data["mcpServers"]["cerebro-mcp"]["env"]
        # Both original and override env vars present
        assert cerebro_env["CEREBRO_DB"] == "/tmp/cerebro.db"  # from fixture
        assert cerebro_env["EXTRA_VAR"] == "hello"  # from override

    def test_command_override(self, store_with_group):
        """Can override the command itself per group."""
        store, group_path, repos = store_with_group

        store.set_group_server_config("repos-test", "taskr", {
            "command": "/custom/path/to/taskr"
        })

        deploy(store, only_groups=["repos-test"])

        mcp_path = Path(repos[0]) / ".mcp.json"
        data = json.loads(mcp_path.read_text())
        assert data["mcpServers"]["taskr"]["command"] == "/custom/path/to/taskr"

    def test_no_override_uses_base(self, store_with_group):
        """Without group config, base server config is used."""
        store, group_path, repos = store_with_group

        deploy(store, only_groups=["repos-test"])

        mcp_path = Path(repos[0]) / ".mcp.json"
        data = json.loads(mcp_path.read_text())
        # taskr should use base config (npx from fixture)
        assert data["mcpServers"]["taskr"]["command"] == "npx"

    def test_internal_keys_not_applied(self, store_with_group):
        """Group config should not allow injecting internal fields."""
        store, group_path, repos = store_with_group

        store.set_group_server_config("repos-test", "taskr", {
            "name": "hacked",
            "source_scope": "hacked",
            "health": "hacked",
            "env": {"LEGIT": "yes"},
        })

        deploy(store, only_groups=["repos-test"])

        mcp_path = Path(repos[0]) / ".mcp.json"
        data = json.loads(mcp_path.read_text())
        taskr = data["mcpServers"]["taskr"]
        assert "name" not in taskr
        assert "source_scope" not in taskr
        assert "health" not in taskr
        assert taskr["env"]["LEGIT"] == "yes"

    def test_different_groups_different_config(self, populated_store, tmp_path):
        """Two groups can have different configs for the same server."""
        store = populated_store

        # Group A
        group_a = tmp_path / "repos-a"
        group_a.mkdir()
        (group_a / "repo1").mkdir()
        (group_a / "repo1" / ".git").mkdir()
        store.create_group("repos-a", "Group A", str(group_a))
        store.assign("cerebro-mcp", "repos-a")
        store.set_group_server_config("repos-a", "cerebro-mcp", {
            "env": {"CEREBRO_DB": "/prod/cerebro.db"}
        })

        # Group B — need to re-assign cerebro-mcp since assign removes from other groups
        group_b = tmp_path / "repos-b"
        group_b.mkdir()
        (group_b / "repo2").mkdir()
        (group_b / "repo2" / ".git").mkdir()
        store.create_group("repos-b", "Group B", str(group_b))
        # cerebro-mcp got moved to repos-a, so add a different server to repos-b
        store.upsert_server("cerebro-staging", {
            "type": "stdio",
            "command": "cerebro-mcp",
            "env": {"CEREBRO_DB": "/default.db"},
        })
        store.assign("cerebro-staging", "repos-b")
        store.set_group_server_config("repos-b", "cerebro-staging", {
            "env": {"CEREBRO_DB": "/staging/cerebro.db"}
        })

        deploy(store)

        # Group A gets prod config
        data_a = json.loads((group_a / "repo1" / ".mcp.json").read_text())
        assert data_a["mcpServers"]["cerebro-mcp"]["env"]["CEREBRO_DB"] == "/prod/cerebro.db"

        # Group B gets staging config
        data_b = json.loads((group_b / "repo2" / ".mcp.json").read_text())
        assert data_b["mcpServers"]["cerebro-staging"]["env"]["CEREBRO_DB"] == "/staging/cerebro.db"

    def test_idempotent_with_overrides(self, store_with_group):
        """Deploy with overrides should be idempotent."""
        store, group_path, repos = store_with_group

        store.set_group_server_config("repos-test", "cerebro-mcp", {
            "env": {"EXTRA": "val"}
        })

        deploy(store, only_groups=["repos-test"])
        changes = preview(store)
        test_changes = {k: v for k, v in changes.items() if v["group"] == "repos-test"}
        assert len(test_changes) == 0, "Deploy with overrides should be idempotent"
