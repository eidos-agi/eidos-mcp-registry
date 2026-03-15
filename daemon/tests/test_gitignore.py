"""Gitignore bulk operations tests."""

from pathlib import Path

import pytest

from mcp_registry.deployer import check_gitignore_status, add_gitignore_bulk


class TestCheckGitignoreStatus:

    def test_all_ignored(self, store_with_group):
        store, group_path, repos = store_with_group
        for repo in repos:
            (Path(repo) / ".gitignore").write_text(".mcp.json\n")

        result = check_gitignore_status(store, "repos-test")
        assert result["ignored"] == 3
        assert result["not_ignored"] == 0

    def test_none_ignored(self, store_with_group):
        store, group_path, repos = store_with_group
        result = check_gitignore_status(store, "repos-test")
        assert result["ignored"] == 0
        assert result["not_ignored"] == 3

    def test_mixed(self, store_with_group):
        store, group_path, repos = store_with_group
        (Path(repos[0]) / ".gitignore").write_text(".mcp.json\n")

        result = check_gitignore_status(store, "repos-test")
        assert result["ignored"] == 1
        assert result["not_ignored"] == 2

    def test_nonexistent_group(self, tmp_registry):
        result = check_gitignore_status(tmp_registry, "nope")
        assert "error" in result


class TestAddGitignoreBulk:

    def test_creates_gitignore(self, store_with_group):
        store, group_path, repos = store_with_group
        result = add_gitignore_bulk(store, "repos-test")
        assert result["added"] == 3
        assert result["already"] == 0

        for repo in repos:
            gi = Path(repo) / ".gitignore"
            assert gi.exists()
            assert ".mcp.json" in gi.read_text()

    def test_appends_to_existing(self, store_with_group):
        store, group_path, repos = store_with_group
        (Path(repos[0]) / ".gitignore").write_text("node_modules/\n")

        result = add_gitignore_bulk(store, "repos-test")
        assert result["added"] == 3

        content = (Path(repos[0]) / ".gitignore").read_text()
        assert "node_modules/" in content
        assert ".mcp.json" in content

    def test_skips_already_ignored(self, store_with_group):
        store, group_path, repos = store_with_group
        (Path(repos[0]) / ".gitignore").write_text(".mcp.json\n")

        result = add_gitignore_bulk(store, "repos-test")
        assert result["already"] == 1
        assert result["added"] == 2

    def test_nonexistent_group(self, tmp_registry):
        result = add_gitignore_bulk(tmp_registry, "nope")
        assert "error" in result
