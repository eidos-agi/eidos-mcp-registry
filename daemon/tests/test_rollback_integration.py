"""Rollback integration tests — deploy → modify → rollback → verify."""

import json
import time
from pathlib import Path

import pytest

from mcp_registry.deployer import preview, deploy
from mcp_registry import deploy_history, activity


@pytest.fixture(autouse=True)
def clean_history(tmp_path, monkeypatch):
    monkeypatch.setattr("mcp_registry.deploy_history.HISTORY_DIR", tmp_path / "deploy-history")
    monkeypatch.setattr("mcp_registry.activity.DATA_DIR", tmp_path / "activity-data")
    monkeypatch.setattr("mcp_registry.activity.ACTIVITY_FILE", tmp_path / "activity-data" / "activity.json")
    activity.clear()
    yield


class TestFullRollbackCycle:
    """Deploy → snapshot → redeploy → rollback → verify original state."""

    def test_deploy_snapshot_rollback_restores_original(self, store_with_group):
        store, group_path, repos = store_with_group

        # First deploy
        changes = preview(store)
        sid = deploy_history.snapshot_before_deploy(changes)
        deploy(store, only_groups=["repos-test"])

        # Verify deployed
        mcp = Path(repos[0]) / ".mcp.json"
        assert mcp.exists()
        original_content = json.loads(mcp.read_text())

        # Modify registry — add a server
        store.upsert_server("wrike", {
            "type": "stdio", "command": "node", "args": ["dist/index.js"],
        })
        store.assign("wrike", "repos-test")

        # Second deploy (snapshot before)
        changes2 = preview(store)
        sid2 = deploy_history.snapshot_before_deploy(changes2)
        deploy(store, only_groups=["repos-test"])

        # Verify wrike was added
        data = json.loads(mcp.read_text())
        assert "wrike" in data["mcpServers"]

        # Rollback to sid2 (before second deploy) — should restore first deploy state
        result = deploy_history.rollback(sid2)
        assert len(result["restored"]) > 0

        restored = json.loads(mcp.read_text())
        assert restored == original_content
        assert "wrike" not in restored["mcpServers"]

    def test_rollback_new_files_deletes_them(self, store_with_group):
        store, group_path, repos = store_with_group

        # Snapshot before first deploy (files don't exist yet)
        changes = preview(store)
        sid = deploy_history.snapshot_before_deploy(changes)

        # Deploy creates the files
        deploy(store, only_groups=["repos-test"])
        for repo in repos:
            assert (Path(repo) / ".mcp.json").exists()

        # Rollback — files should be deleted since they didn't exist before
        result = deploy_history.rollback(sid)
        assert len(result["deleted"]) == len(repos)
        for repo in repos:
            assert not (Path(repo) / ".mcp.json").exists()

    def test_multiple_snapshots_independent(self, store_with_group):
        store, group_path, repos = store_with_group

        # Snapshot 1 — before any deploy
        changes1 = preview(store)
        sid1 = deploy_history.snapshot_before_deploy(changes1)

        # Deploy
        deploy(store, only_groups=["repos-test"])

        # Modify and deploy again
        store.upsert_server("github", {
            "type": "http", "url": "https://mcp.github.com",
        })
        store.assign("github", "repos-test")

        changes2 = preview(store)
        sid2 = deploy_history.snapshot_before_deploy(changes2)
        deploy(store, only_groups=["repos-test"])

        # Rollback to sid2 should give us first deploy state
        deploy_history.rollback(sid2)
        data = json.loads((Path(repos[0]) / ".mcp.json").read_text())
        assert "github" not in data["mcpServers"]
        assert "taskr" in data["mcpServers"]

        # Rollback to sid1 should delete files entirely
        deploy_history.rollback(sid1)
        assert not (Path(repos[0]) / ".mcp.json").exists()


class TestRollbackEdgeCases:

    def test_rollback_already_rolled_back(self, store_with_group):
        """Rollback twice should be safe (idempotent for deletes)."""
        store, group_path, repos = store_with_group

        changes = preview(store)
        sid = deploy_history.snapshot_before_deploy(changes)
        deploy(store, only_groups=["repos-test"])

        # First rollback
        result1 = deploy_history.rollback(sid)
        assert len(result1["deleted"]) > 0

        # Second rollback — files already gone
        result2 = deploy_history.rollback(sid)
        # Should succeed without errors (files don't exist, nothing to delete)
        assert len(result2["errors"]) == 0

    def test_rollback_with_manual_edit_between(self, store_with_group):
        """Rollback after someone manually edited .mcp.json."""
        store, group_path, repos = store_with_group

        # Deploy
        changes = preview(store)
        sid = deploy_history.snapshot_before_deploy(changes)
        deploy(store, only_groups=["repos-test"])

        # Manual edit
        mcp = Path(repos[0]) / ".mcp.json"
        data = json.loads(mcp.read_text())
        data["mcpServers"]["hand-added"] = {"type": "stdio", "command": "manual"}
        mcp.write_text(json.dumps(data))

        # Rollback should still work — restores pre-deploy state
        result = deploy_history.rollback(sid)
        assert not mcp.exists()  # Was new file, so deleted

    def test_rollback_preserves_non_managed_files(self, store_with_group):
        """Rollback only touches files that were in the snapshot."""
        store, group_path, repos = store_with_group

        changes = preview(store)
        sid = deploy_history.snapshot_before_deploy(changes)
        deploy(store, only_groups=["repos-test"])

        # Create an unrelated file
        other_file = Path(repos[0]) / "README.md"
        other_file.write_text("# My Repo")

        deploy_history.rollback(sid)

        # Unrelated file should still exist
        assert other_file.exists()
        assert other_file.read_text() == "# My Repo"

    def test_snapshot_with_corrupt_mcp_json(self, store_with_group):
        """Snapshot should handle corrupt existing .mcp.json gracefully."""
        store, group_path, repos = store_with_group

        # Create a corrupt .mcp.json
        mcp = Path(repos[0]) / ".mcp.json"
        mcp.write_text("NOT JSON{{{")

        changes = preview(store)
        # Should not crash
        sid = deploy_history.snapshot_before_deploy(changes)
        assert sid  # Still returns a valid ID

    def test_history_survives_rollback(self, store_with_group):
        """Rollback should not delete the snapshot itself."""
        store, group_path, repos = store_with_group

        changes = preview(store)
        sid = deploy_history.snapshot_before_deploy(changes)
        deploy(store, only_groups=["repos-test"])

        # Rollback
        deploy_history.rollback(sid)

        # Snapshot should still be in history
        history = deploy_history.list_history()
        ids = [h["id"] for h in history]
        assert sid in ids


class TestActivityIntegration:

    def test_activity_accumulates_across_operations(self, store_with_group):
        store, group_path, repos = store_with_group

        # Multiple operations
        activity.log_event("assign", {"server": "taskr", "group": "repos-test"})
        activity.log_event("deploy", {"groups": ["repos-test"], "written": 3})
        activity.log_event("config_change", {"server": "taskr"})

        events = activity.get_events()
        assert len(events) == 3
        # Newest first
        assert events[0]["type"] == "config_change"
        assert events[1]["type"] == "deploy"
        assert events[2]["type"] == "assign"

    def test_activity_detail_preserved(self, store_with_group):
        store, group_path, repos = store_with_group

        activity.log_event("deploy", {
            "groups": ["repos-test"],
            "written": 3,
            "errors": 0,
            "action": "deploy",
        })

        events = activity.get_events()
        detail = events[0]["detail"]
        assert detail["groups"] == ["repos-test"]
        assert detail["written"] == 3
        assert detail["errors"] == 0

    def test_activity_persists_through_clear_and_reload(self, tmp_path, monkeypatch):
        """Events written, cleared in memory, then reloaded from disk."""
        activity.log_event("scan", {"servers_found": 10, "groups_found": 3})

        # Simulate process restart by clearing in-memory state
        activity._events.clear()
        activity._loaded = False

        events = activity.get_events()
        assert len(events) == 1
        assert events[0]["type"] == "scan"
        assert events[0]["detail"]["servers_found"] == 10


class TestSecretsMaskingInDeploy:
    """Verify secrets are properly masked in deployed .mcp.json files."""

    def test_api_key_masked_in_deployed_file(self, store_with_group):
        store, group_path, repos = store_with_group

        deploy(store, only_groups=["repos-test"])

        mcp = Path(repos[0]) / ".mcp.json"
        data = json.loads(mcp.read_text())

        # taskr has TASKR_API_KEY which should be masked
        taskr_env = data["mcpServers"]["taskr"].get("env", {})
        if "TASKR_API_KEY" in taskr_env:
            assert taskr_env["TASKR_API_KEY"] == "${TASKR_API_KEY}", \
                "Secret should be masked as ${VAR} reference"

    def test_non_secret_env_not_masked(self, store_with_group):
        store, group_path, repos = store_with_group

        deploy(store, only_groups=["repos-test"])

        mcp = Path(repos[0]) / ".mcp.json"
        data = json.loads(mcp.read_text())

        # cerebro has CEREBRO_DB which is NOT a secret pattern
        cerebro_env = data["mcpServers"]["cerebro-mcp"].get("env", {})
        if "CEREBRO_DB" in cerebro_env:
            assert cerebro_env["CEREBRO_DB"] == "/tmp/cerebro.db", \
                "Non-secret env var should keep its literal value"

    def test_masked_deploy_is_idempotent(self, store_with_group):
        """Deploy twice with masking should produce identical files."""
        store, group_path, repos = store_with_group

        deploy(store, only_groups=["repos-test"])
        first = (Path(repos[0]) / ".mcp.json").read_text()

        deploy(store, only_groups=["repos-test"])
        second = (Path(repos[0]) / ".mcp.json").read_text()

        assert first == second, "Masked deploy should be idempotent"

    def test_rollback_restores_masked_content(self, store_with_group):
        """Rollback should restore the masked values, not unmask them."""
        store, group_path, repos = store_with_group

        changes = preview(store)
        sid = deploy_history.snapshot_before_deploy(changes)
        deploy(store, only_groups=["repos-test"])

        original = (Path(repos[0]) / ".mcp.json").read_text()

        # Modify and redeploy
        store.upsert_server("wrike", {
            "type": "stdio", "command": "node",
            "env": {"WRIKE_TOKEN": "abc123"},
        })
        store.assign("wrike", "repos-test")

        changes2 = preview(store)
        sid2 = deploy_history.snapshot_before_deploy(changes2)
        deploy(store, only_groups=["repos-test"])

        # Rollback
        deploy_history.rollback(sid2)
        restored = json.loads((Path(repos[0]) / ".mcp.json").read_text())
        original_parsed = json.loads(original)
        assert restored == original_parsed
