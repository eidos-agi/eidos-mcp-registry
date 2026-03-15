"""Deploy history and rollback tests."""

import json
import time
from pathlib import Path

import pytest

from mcp_registry import deploy_history


@pytest.fixture(autouse=True)
def clean_history(tmp_path, monkeypatch):
    monkeypatch.setattr("mcp_registry.deploy_history.HISTORY_DIR", tmp_path / "deploy-history")
    yield


class TestSnapshot:

    def test_snapshot_creates_manifest(self, tmp_path):
        repo = tmp_path / "repo"
        repo.mkdir()
        mcp = repo / ".mcp.json"
        mcp.write_text(json.dumps({"mcpServers": {"taskr": {"type": "stdio"}}}))

        changes = {str(mcp): {"group": "repos-test"}}
        sid = deploy_history.snapshot_before_deploy(changes)

        assert sid
        history = deploy_history.list_history()
        assert len(history) == 1
        assert history[0]["id"] == sid
        assert history[0]["file_count"] == 1

    def test_snapshot_new_file(self, tmp_path):
        mcp = tmp_path / "repo" / ".mcp.json"
        changes = {str(mcp): {"group": "repos-test"}}
        sid = deploy_history.snapshot_before_deploy(changes)

        history = deploy_history.list_history()
        assert history[0]["file_count"] == 1


class TestRollback:

    def test_rollback_restores_content(self, tmp_path):
        repo = tmp_path / "repo"
        repo.mkdir()
        mcp = repo / ".mcp.json"
        original = {"mcpServers": {"taskr": {"type": "stdio", "command": "old"}}}
        mcp.write_text(json.dumps(original, indent=2))

        changes = {str(mcp): {"group": "repos-test"}}
        sid = deploy_history.snapshot_before_deploy(changes)

        # Simulate deploy overwrote the file
        mcp.write_text(json.dumps({"mcpServers": {"taskr": {"type": "stdio", "command": "new"}}}))

        result = deploy_history.rollback(sid)
        assert len(result["restored"]) == 1
        restored = json.loads(mcp.read_text())
        assert restored == original

    def test_rollback_deletes_new_file(self, tmp_path):
        repo = tmp_path / "repo"
        repo.mkdir()
        mcp = repo / ".mcp.json"

        changes = {str(mcp): {"group": "repos-test"}}
        sid = deploy_history.snapshot_before_deploy(changes)

        # Simulate deploy created the file
        mcp.write_text(json.dumps({"mcpServers": {}}))

        result = deploy_history.rollback(sid)
        assert len(result["deleted"]) == 1
        assert not mcp.exists()

    def test_rollback_nonexistent_snapshot(self):
        result = deploy_history.rollback("nonexistent")
        assert "error" in result

    def test_list_history_empty(self):
        assert deploy_history.list_history() == []

    def test_list_history_order(self, tmp_path):
        repo = tmp_path / "repo"
        repo.mkdir()
        mcp = repo / ".mcp.json"
        mcp.write_text(json.dumps({"mcpServers": {}}))

        changes = {str(mcp): {"group": "g1"}}
        sid1 = deploy_history.snapshot_before_deploy(changes)

        time.sleep(0.01)  # ensure different timestamps
        sid2 = deploy_history.snapshot_before_deploy(changes)

        history = deploy_history.list_history()
        assert len(history) == 2
        assert history[0]["id"] == sid2  # newest first

    def test_list_history_limit(self, tmp_path):
        repo = tmp_path / "repo"
        repo.mkdir()
        mcp = repo / ".mcp.json"
        mcp.write_text(json.dumps({"mcpServers": {}}))

        changes = {str(mcp): {"group": "g1"}}
        for _ in range(5):
            deploy_history.snapshot_before_deploy(changes)

        history = deploy_history.list_history(limit=2)
        assert len(history) == 2
