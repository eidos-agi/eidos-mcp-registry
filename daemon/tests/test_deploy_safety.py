"""
Layer 2 — Deploy Safety Tests

These tests verify that deploy operations are safe, idempotent,
and never lose data. If these fail, we'd corrupt repos.
"""

import json
from pathlib import Path

import pytest

from mcp_registry.deployer import _build_mcp_json, preview, deploy


# ── Idempotency ───────────────────────────────────────────────────


class TestDeployIdempotency:
    """Deploy twice → second run produces no changes."""

    def test_deploy_then_preview_shows_no_changes(self, store_with_group):
        store, group_path, repos = store_with_group

        # First deploy
        result1 = deploy(store, only_groups=["repos-test"])
        assert len(result1["written"]) > 0

        # Preview after deploy — should show zero changes
        changes = preview(store)
        test_changes = {k: v for k, v in changes.items() if v["group"] == "repos-test"}
        assert len(test_changes) == 0, (
            f"Deploy is not idempotent: {len(test_changes)} changes after deploy"
        )

    def test_deploy_twice_writes_same_content(self, store_with_group):
        store, group_path, repos = store_with_group

        deploy(store, only_groups=["repos-test"])
        contents_after_first = {}
        for repo in repos:
            mcp_path = Path(repo) / ".mcp.json"
            if mcp_path.exists():
                contents_after_first[str(mcp_path)] = mcp_path.read_text()

        deploy(store, only_groups=["repos-test"])
        for path, content in contents_after_first.items():
            assert Path(path).read_text() == content


# ── Preview == Deploy ─────────────────────────────────────────────


class TestPreviewMatchesDeploy:
    """What preview reports must match what deploy actually writes."""

    def test_preview_file_list_matches_deploy(self, store_with_group):
        store, group_path, repos = store_with_group

        changes = preview(store)
        test_changes = {k: v for k, v in changes.items() if v["group"] == "repos-test"}

        result = deploy(store, only_groups=["repos-test"])

        # Every previewed file was written
        assert set(result["written"]) == set(test_changes.keys())

    def test_preview_server_list_matches_file_content(self, store_with_group):
        store, group_path, repos = store_with_group

        changes = preview(store)
        deploy(store, only_groups=["repos-test"])

        for mcp_path, change in changes.items():
            if change["group"] != "repos-test":
                continue
            with open(mcp_path) as f:
                written = json.load(f)
            assert set(written["mcpServers"].keys()) == set(change["servers"])

    def test_preview_action_is_create_for_new_repos(self, store_with_group):
        store, group_path, repos = store_with_group

        changes = preview(store)
        for change in changes.values():
            if change["group"] == "repos-test":
                assert change["action"] == "create"

    def test_preview_action_is_update_for_existing(self, store_with_group):
        store, group_path, repos = store_with_group

        # First deploy creates the files
        deploy(store, only_groups=["repos-test"])

        # Modify a server to force a change
        store.upsert_server("wrike", {
            "type": "stdio",
            "command": "node",
            "args": ["dist/index.js"],
        })
        store.assign("wrike", "repos-test")

        changes = preview(store)
        for change in changes.values():
            if change["group"] == "repos-test":
                assert change["action"] == "update"


# ── Overwrite Detection ───────────────────────────────────────────


class TestMergeStrategy:
    """Deploy must merge with existing .mcp.json, not overwrite."""

    def test_preserves_unmanaged_servers(self, store_with_group):
        """Servers we don't manage must survive deploy."""
        store, group_path, repos = store_with_group

        # Pre-populate a repo with an extra server we don't manage
        mcp_path = Path(repos[0]) / ".mcp.json"
        mcp_path.write_text(json.dumps({
            "mcpServers": {
                "legacy-server": {"type": "stdio", "command": "echo"},
            }
        }))

        changes = preview(store)
        change = changes[str(mcp_path)]
        # legacy-server should be kept
        assert "legacy-server" in change["unmanaged_kept"]
        # And present in the final content
        assert "legacy-server" in change["content"]["mcpServers"]

    def test_preserves_extra_top_level_keys(self, store_with_group):
        """Keys beyond mcpServers must survive deploy."""
        store, group_path, repos = store_with_group

        mcp_path = Path(repos[0]) / ".mcp.json"
        mcp_path.write_text(json.dumps({
            "mcpServers": {},
            "customConfig": {"foo": "bar"},
        }))

        changes = preview(store)
        change = changes[str(mcp_path)]
        assert change["content"]["customConfig"] == {"foo": "bar"}

    def test_registry_wins_on_conflict(self, store_with_group):
        """When both existing and registry define same server, registry wins."""
        store, group_path, repos = store_with_group

        mcp_path = Path(repos[0]) / ".mcp.json"
        mcp_path.write_text(json.dumps({
            "mcpServers": {
                "taskr": {"type": "stdio", "command": "old-command", "args": ["--old"]},
            }
        }))

        changes = preview(store)
        change = changes[str(mcp_path)]
        # Registry's version of taskr should win
        taskr = change["content"]["mcpServers"]["taskr"]
        assert taskr["command"] == "npx"  # from populated_store fixture

    def test_merge_end_to_end(self, store_with_group):
        """Full merge: unmanaged kept + managed updated + managed added."""
        store, group_path, repos = store_with_group

        mcp_path = Path(repos[0]) / ".mcp.json"
        mcp_path.write_text(json.dumps({
            "mcpServers": {
                "taskr": {"type": "stdio", "command": "old"},
                "custom-tool": {"type": "stdio", "command": "my-tool"},
            },
            "someOtherKey": True,
        }))

        deploy(store, only_groups=["repos-test"])

        with open(mcp_path) as f:
            result = json.load(f)

        # custom-tool preserved (unmanaged)
        assert "custom-tool" in result["mcpServers"]
        assert result["mcpServers"]["custom-tool"]["command"] == "my-tool"
        # taskr updated (managed, registry wins)
        assert result["mcpServers"]["taskr"]["command"] == "npx"
        # cerebro-mcp added (managed, new)
        assert "cerebro-mcp" in result["mcpServers"]
        # top-level key preserved
        assert result["someOtherKey"] is True
        # tracking key written
        assert "_registry_managed" in result
        assert "taskr" in result["_registry_managed"]
        assert "cerebro-mcp" in result["_registry_managed"]
        assert "custom-tool" not in result["_registry_managed"]

    def test_removes_previously_managed_server(self, store_with_group):
        """Unassigning a server should remove it from .mcp.json on next deploy."""
        store, group_path, repos = store_with_group

        # First deploy — both taskr and cerebro-mcp are managed
        deploy(store, only_groups=["repos-test"])
        mcp_path = Path(repos[0]) / ".mcp.json"
        data = json.loads(mcp_path.read_text())
        assert "cerebro-mcp" in data["mcpServers"]
        assert "cerebro-mcp" in data["_registry_managed"]

        # Unassign cerebro-mcp
        store.unassign("cerebro-mcp", "repos-test")

        # Second deploy — cerebro-mcp should be REMOVED
        deploy(store, only_groups=["repos-test"])
        data = json.loads(mcp_path.read_text())
        assert "cerebro-mcp" not in data["mcpServers"]
        assert "cerebro-mcp" not in data["_registry_managed"]
        # taskr should still be there
        assert "taskr" in data["mcpServers"]

    def test_removal_preserves_unmanaged(self, store_with_group):
        """Removing a managed server must not affect unmanaged servers."""
        store, group_path, repos = store_with_group

        # Pre-populate with an unmanaged server
        mcp_path = Path(repos[0]) / ".mcp.json"
        mcp_path.write_text(json.dumps({
            "mcpServers": {
                "custom-tool": {"type": "stdio", "command": "my-tool"},
            },
        }))

        # First deploy
        deploy(store, only_groups=["repos-test"])
        data = json.loads(mcp_path.read_text())
        assert "custom-tool" in data["mcpServers"]

        # Unassign cerebro-mcp and redeploy
        store.unassign("cerebro-mcp", "repos-test")
        deploy(store, only_groups=["repos-test"])

        data = json.loads(mcp_path.read_text())
        assert "custom-tool" in data["mcpServers"], "Unmanaged server must survive"
        assert "cerebro-mcp" not in data["mcpServers"], "Unassigned managed server must be gone"

    def test_preview_shows_servers_removed(self, store_with_group):
        """Preview must list servers that will be removed."""
        store, group_path, repos = store_with_group

        deploy(store, only_groups=["repos-test"])
        store.unassign("cerebro-mcp", "repos-test")

        changes = preview(store)
        for change in changes.values():
            if change["group"] == "repos-test":
                assert "cerebro-mcp" in change["servers_removed"]

    def test_no_changes_on_fresh_repo(self, store_with_group):
        store, group_path, repos = store_with_group

        changes = preview(store)
        for change in changes.values():
            assert change["unmanaged_kept"] == []
            assert change["servers_removed"] == []


# ── Gitignore Detection ──────────────────────────────────────────


class TestGitignoreDetection:

    def test_detects_gitignored_mcp_json(self, store_with_group):
        store, group_path, repos = store_with_group

        # Add .gitignore with .mcp.json
        gitignore = Path(repos[0]) / ".gitignore"
        gitignore.write_text(".mcp.json\nnode_modules/\n")

        changes = preview(store)
        mcp_path = str(Path(repos[0]) / ".mcp.json")
        assert changes[mcp_path]["gitignored"] is True

    def test_not_gitignored_by_default(self, store_with_group):
        store, group_path, repos = store_with_group

        changes = preview(store)
        for change in changes.values():
            assert change["gitignored"] is False


# ── Group Filtering ───────────────────────────────────────────────


class TestGroupFiltering:
    """Deploy with only_groups must not touch other groups."""

    def test_only_deploys_selected_groups(self, store_with_group):
        store, group_path, repos = store_with_group

        # Create a second group
        second_dir = Path(group_path).parent / "repos-other"
        second_dir.mkdir()
        (second_dir / "delta").mkdir()
        (second_dir / "delta" / ".git").mkdir()
        store.create_group("repos-other", "Other Repos", str(second_dir))
        store.assign("wrike", "repos-other")

        # Deploy only repos-test
        result = deploy(store, only_groups=["repos-test"])

        # repos-other should be untouched
        delta_mcp = second_dir / "delta" / ".mcp.json"
        assert not delta_mcp.exists()

        # repos-test should be written
        assert len(result["written"]) == len(repos)


# ── Error Handling ────────────────────────────────────────────────


class TestDeployErrors:
    """Deploy must surface errors, not silently fail."""

    def test_readonly_repo_produces_error(self, store_with_group):
        store, group_path, repos = store_with_group

        # Make one repo read-only
        import os
        readonly_repo = Path(repos[0])
        readonly_repo.chmod(0o555)

        try:
            result = deploy(store, only_groups=["repos-test"])
            # The readonly repo should be in errors, others should succeed
            error_paths = [e["path"] for e in result["errors"]]
            written_plus_errors = len(result["written"]) + len(result["errors"])
            assert written_plus_errors == len(repos)
        finally:
            # Restore permissions for cleanup
            readonly_repo.chmod(0o755)

    def test_deploy_returns_all_three_result_keys(self, store_with_group):
        store, group_path, repos = store_with_group
        result = deploy(store, only_groups=["repos-test"])
        assert "written" in result
        assert "errors" in result
        assert "removed_from_user" in result


# ── No Deploy Without Assignments ─────────────────────────────────


class TestNoEmptyDeploy:
    """Groups with no assigned servers must not trigger .mcp.json writes."""

    def test_empty_group_not_deployed(self, populated_store, repo_tree):
        store = populated_store
        group_path, repos = repo_tree

        # Create group but assign nothing
        store.create_group("repos-empty", "Empty Group", group_path)

        changes = preview(store)
        empty_changes = {k: v for k, v in changes.items() if v["group"] == "repos-empty"}
        assert len(empty_changes) == 0

    def test_universal_only_not_deployed(self, populated_store, repo_tree):
        """Groups with only inherited universal servers don't get .mcp.json."""
        store = populated_store
        group_path, repos = repo_tree

        # Group exists, has a path, but no direct server assignments
        # (context7 is in __universal__ so it's inherited, not assigned)
        store.create_group("repos-inherited", "Inherited Only", group_path)

        changes = preview(store)
        inherited_changes = {k: v for k, v in changes.items()
                           if v["group"] == "repos-inherited"}
        assert len(inherited_changes) == 0


# ── Progress Callback ─────────────────────────────────────────────


class TestDriftDetection:
    """After deploy, any manual edit or registry change must be detectable."""

    def test_no_drift_after_clean_deploy(self, store_with_group):
        store, group_path, repos = store_with_group
        deploy(store, only_groups=["repos-test"])

        changes = preview(store)
        test_changes = {k: v for k, v in changes.items() if v["group"] == "repos-test"}
        assert len(test_changes) == 0, "Clean deploy should produce zero drift"

    def test_detects_manual_edit_to_managed_server(self, store_with_group):
        """Someone hand-edits a managed server — drift must be caught."""
        store, group_path, repos = store_with_group
        deploy(store, only_groups=["repos-test"])

        # Simulate manual edit: change a managed server's command
        mcp_path = Path(repos[0]) / ".mcp.json"
        data = json.loads(mcp_path.read_text())
        data["mcpServers"]["taskr"]["command"] = "hacked"
        mcp_path.write_text(json.dumps(data, indent=2))

        changes = preview(store)
        # Should detect drift because managed server was modified
        assert str(mcp_path) in changes

    def test_unmanaged_addition_not_treated_as_drift(self, store_with_group):
        """Adding an unmanaged server shouldn't cause drift (we merge, not replace)."""
        store, group_path, repos = store_with_group
        deploy(store, only_groups=["repos-test"])

        # Add an unmanaged server
        mcp_path = Path(repos[0]) / ".mcp.json"
        data = json.loads(mcp_path.read_text())
        data["mcpServers"]["custom-tool"] = {"type": "stdio", "command": "echo"}
        mcp_path.write_text(json.dumps(data, indent=2))

        changes = preview(store)
        # Should NOT show drift — the unmanaged server is preserved in merge,
        # and our managed servers haven't changed
        assert str(mcp_path) not in changes

    def test_detects_deleted_mcp_json(self, store_with_group):
        """Someone deletes a .mcp.json — drift must be caught."""
        store, group_path, repos = store_with_group
        deploy(store, only_groups=["repos-test"])

        # Delete one file
        mcp_path = Path(repos[1]) / ".mcp.json"
        mcp_path.unlink()

        changes = preview(store)
        assert str(mcp_path) in changes
        assert changes[str(mcp_path)]["action"] == "create"

    def test_detects_registry_change_without_redeploy(self, store_with_group):
        """Registry adds a server to group but nobody re-deploys."""
        store, group_path, repos = store_with_group
        deploy(store, only_groups=["repos-test"])

        # Add wrike to the group in registry (but don't re-deploy)
        store.assign("wrike", "repos-test")

        changes = preview(store)
        test_changes = {k: v for k, v in changes.items() if v["group"] == "repos-test"}
        assert len(test_changes) == len(repos), "All repos should show drift"
        # Each drifted repo should now need wrike
        for change in test_changes.values():
            assert "wrike" in change["servers"]

    def test_detects_server_removed_from_group(self, store_with_group):
        """Registry removes a server from group — preview shows drift with removal."""
        store, group_path, repos = store_with_group
        deploy(store, only_groups=["repos-test"])

        # Remove cerebro-mcp from the group
        store.unassign("cerebro-mcp", "repos-test")

        # Preview should detect drift — cerebro-mcp needs to be removed
        changes = preview(store)
        test_changes = {k: v for k, v in changes.items() if v["group"] == "repos-test"}
        assert len(test_changes) == len(repos)
        for change in test_changes.values():
            assert "cerebro-mcp" in change["servers_removed"]

        # Re-deploy removes it
        deploy(store, only_groups=["repos-test"])
        mcp_path = Path(repos[0]) / ".mcp.json"
        data = json.loads(mcp_path.read_text())
        assert "cerebro-mcp" not in data["mcpServers"]


class TestDeployProgress:
    """on_progress callback must fire for every file."""

    def test_progress_fires_for_each_file(self, store_with_group):
        store, group_path, repos = store_with_group
        progress_events = []

        def on_progress(info):
            progress_events.append(info)

        deploy(store, on_progress=on_progress, only_groups=["repos-test"])

        assert len(progress_events) == len(repos)
        for i, event in enumerate(progress_events):
            assert event["step"] == "write"
            assert event["progress"] == i + 1
            assert event["total"] == len(repos)
            assert "path" in event
