"""
Tests for deploy preview diff support — existing_content field
and diff line computation.
"""

import json
from pathlib import Path

import pytest

from mcp_registry.deployer import preview, deploy


# ── existing_content in preview ──────────────────────────────────


class TestExistingContentInPreview:
    """Preview must return existing_content alongside content."""

    def test_existing_content_null_for_new_files(self, store_with_group):
        """When .mcp.json doesn't exist yet, existing_content should be None."""
        store, group_path, repos = store_with_group

        changes = preview(store)
        for change in changes.values():
            if change["group"] == "repos-test":
                assert change["existing_content"] is None
                assert change["action"] == "create"

    def test_existing_content_matches_file_for_updates(self, store_with_group):
        """When .mcp.json already exists, existing_content should match it."""
        store, group_path, repos = store_with_group

        # First deploy creates the files
        deploy(store, only_groups=["repos-test"])

        # Record what's on disk
        on_disk = {}
        for repo in repos:
            mcp_path = Path(repo) / ".mcp.json"
            with open(mcp_path) as f:
                on_disk[str(mcp_path)] = json.load(f)

        # Add a new server to force changes
        store.upsert_server("wrike", {
            "type": "stdio",
            "command": "node",
            "args": ["dist/index.js"],
        })
        store.assign("wrike", "repos-test")

        # Preview should show existing_content matching what was on disk
        changes = preview(store)
        for path, change in changes.items():
            if change["group"] == "repos-test":
                assert change["existing_content"] is not None
                assert change["existing_content"] == on_disk[path]
                assert change["action"] == "update"

    def test_existing_content_includes_unmanaged_servers(self, store_with_group):
        """existing_content must reflect the full file, including unmanaged servers."""
        store, group_path, repos = store_with_group

        # Pre-populate a repo with an extra server
        mcp_path = Path(repos[0]) / ".mcp.json"
        existing_data = {
            "mcpServers": {
                "custom-tool": {"type": "stdio", "command": "my-tool"},
            },
            "customConfig": {"foo": "bar"},
        }
        mcp_path.write_text(json.dumps(existing_data))

        changes = preview(store)
        change = changes[str(mcp_path)]
        assert change["existing_content"] == existing_data
        # content (after) should include both custom-tool and managed servers
        assert "custom-tool" in change["content"]["mcpServers"]

    def test_existing_content_preserved_in_all_repos(self, store_with_group):
        """Every repo in the preview must have the existing_content key."""
        store, group_path, repos = store_with_group

        changes = preview(store)
        for change in changes.values():
            assert "existing_content" in change

    def test_content_differs_from_existing(self, store_with_group):
        """content (after) should differ from existing_content (before) when there are changes."""
        store, group_path, repos = store_with_group

        # Pre-populate with old data
        mcp_path = Path(repos[0]) / ".mcp.json"
        mcp_path.write_text(json.dumps({
            "mcpServers": {
                "taskr": {"type": "stdio", "command": "old-command"},
            }
        }))

        changes = preview(store)
        change = changes[str(mcp_path)]
        # existing has old-command, content has npx
        assert change["existing_content"]["mcpServers"]["taskr"]["command"] == "old-command"
        assert change["content"]["mcpServers"]["taskr"]["command"] == "npx"


# ── Diff line computation (pure logic, no filesystem) ────────────


class TestDiffComputation:
    """Test the diff algorithm used by the frontend, replicated here in Python."""

    @staticmethod
    def compute_diff(old_lines, new_lines):
        """Python replica of the frontend computeDiff for testing."""
        m = len(old_lines)
        n = len(new_lines)

        # LCS table
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if old_lines[i - 1] == new_lines[j - 1]:
                    dp[i][j] = dp[i - 1][j - 1] + 1
                else:
                    dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])

        # Backtrack
        result = []
        i, j = m, n
        while i > 0 or j > 0:
            if i > 0 and j > 0 and old_lines[i - 1] == new_lines[j - 1]:
                result.append(("unchanged", old_lines[i - 1]))
                i -= 1
                j -= 1
            elif j > 0 and (i == 0 or dp[i][j - 1] >= dp[i - 1][j]):
                result.append(("add", new_lines[j - 1]))
                j -= 1
            else:
                result.append(("remove", old_lines[i - 1]))
                i -= 1
        result.reverse()
        return result

    def test_identical_content_all_unchanged(self):
        lines = ['{"mcpServers": {}}']
        diff = self.compute_diff(lines, lines)
        assert all(d[0] == "unchanged" for d in diff)
        assert len(diff) == 1

    def test_new_file_all_additions(self):
        old = []
        new = ['  "mcpServers": {', '    "taskr": {}', '  }']
        diff = self.compute_diff(old, new)
        assert all(d[0] == "add" for d in diff)
        assert len(diff) == 3

    def test_removed_content_all_removals(self):
        old = ['  "taskr": {}', '  "cerebro": {}']
        new = []
        diff = self.compute_diff(old, new)
        assert all(d[0] == "remove" for d in diff)
        assert len(diff) == 2

    def test_mixed_changes(self):
        old_obj = {"mcpServers": {"taskr": {"type": "stdio", "command": "old"}}}
        new_obj = {"mcpServers": {"taskr": {"type": "stdio", "command": "npx"}, "wrike": {"type": "stdio"}}}

        old_lines = json.dumps(old_obj, indent=2).split("\n")
        new_lines = json.dumps(new_obj, indent=2).split("\n")

        diff = self.compute_diff(old_lines, new_lines)

        types = [d[0] for d in diff]
        assert "add" in types
        assert "remove" in types
        assert "unchanged" in types

    def test_add_server_produces_additions(self):
        """Adding a server should produce addition lines containing the new server."""
        old_obj = {"mcpServers": {"taskr": {"type": "stdio"}}}
        new_obj = {"mcpServers": {"taskr": {"type": "stdio"}, "wrike": {"type": "http"}}}

        old_lines = json.dumps(old_obj, indent=2).split("\n")
        new_lines = json.dumps(new_obj, indent=2).split("\n")

        diff = self.compute_diff(old_lines, new_lines)
        added_text = " ".join(d[1] for d in diff if d[0] == "add")
        assert "wrike" in added_text

    def test_remove_server_produces_removals(self):
        """Removing a server should produce removal lines."""
        old_obj = {"mcpServers": {"taskr": {"type": "stdio"}, "wrike": {"type": "http"}}}
        new_obj = {"mcpServers": {"taskr": {"type": "stdio"}}}

        old_lines = json.dumps(old_obj, indent=2).split("\n")
        new_lines = json.dumps(new_obj, indent=2).split("\n")

        diff = self.compute_diff(old_lines, new_lines)
        removed_text = " ".join(d[1] for d in diff if d[0] == "remove")
        assert "wrike" in removed_text

    def test_preserves_line_content(self):
        """Every line in old/new should appear exactly in the diff output."""
        old = ["line1", "line2", "line3"]
        new = ["line1", "line4", "line3"]

        diff = self.compute_diff(old, new)
        diff_texts = [d[1] for d in diff]

        # line1 and line3 unchanged
        assert ("unchanged", "line1") in diff
        assert ("unchanged", "line3") in diff
        # line2 removed, line4 added
        assert ("remove", "line2") in diff
        assert ("add", "line4") in diff
