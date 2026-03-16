"""Tests for notifications store and detector."""

import json
import pytest
from pathlib import Path
from unittest.mock import patch

from mcp_registry import notifications
from mcp_registry.notifications import NotificationStore
from mcp_registry import detector


# ── Notification Store Tests ─────────────────────────────────────

class TestNotificationStore:

    @pytest.fixture(autouse=True)
    def fresh_store(self, tmp_path, monkeypatch):
        monkeypatch.setattr("mcp_registry.notifications.DATA_DIR", tmp_path)
        monkeypatch.setattr(
            "mcp_registry.notifications.NOTIFICATIONS_FILE",
            tmp_path / "notifications.json",
        )
        self.store = NotificationStore()
        # Also patch the module-level singleton so detector uses our store
        monkeypatch.setattr("mcp_registry.notifications._store", self.store)
        self.tmp_path = tmp_path

    def test_create_and_retrieve(self):
        n = self.store.create("new_repo", "Test repo", "Detail here",
                              context={"repo": "/tmp/test"})
        assert n is not None
        assert n["type"] == "new_repo"
        assert n["status"] == "pending"
        assert n["priority"] == "low"

        items = self.store.get("pending")
        assert len(items) == 1
        assert items[0]["id"] == n["id"]

    def test_approve_changes_status(self):
        n = self.store.create("drift", "Drift", "Some drift",
                              actions=[{"label": "Fix", "endpoint": "/deploy",
                                        "method": "POST", "body": {}}],
                              context={"group": "test"})
        result = self.store.approve(n["id"])
        assert result is not None
        assert result["notification"]["status"] == "approved"
        assert result["action"]["label"] == "Fix"

        # No longer in pending
        assert len(self.store.get("pending")) == 0
        assert len(self.store.get("approved")) == 1

    def test_dismiss_changes_status(self):
        n = self.store.create("health_failure", "Unhealthy", "Server down",
                              context={"server": "test"})
        result = self.store.dismiss(n["id"])
        assert result is not None
        assert result["notification"]["status"] == "dismissed"

        assert len(self.store.get("pending")) == 0
        assert len(self.store.get("dismissed")) == 1

    def test_count_pending(self):
        self.store.create("new_repo", "A", "a", context={"repo": "/a"})
        self.store.create("health_failure", "B", "b", context={"server": "x"})
        self.store.create("secrets_exposed", "C", "c", context={"file": "y"})

        counts = self.store.count_pending()
        assert counts["total"] == 3
        assert counts["low"] == 1
        assert counts["high"] == 1
        assert counts["critical"] == 1

    def test_deduplication_via_fingerprint(self):
        ctx = {"repo": "/tmp/same"}
        n1 = self.store.create("new_repo", "First", "d", context=ctx)
        n2 = self.store.create("new_repo", "Second", "d", context=ctx)
        assert n1 is not None
        assert n2 is None  # duplicate
        assert len(self.store.get("pending")) == 1

    def test_dedup_allows_after_dismiss(self):
        ctx = {"repo": "/tmp/same"}
        n1 = self.store.create("new_repo", "First", "d", context=ctx)
        self.store.dismiss(n1["id"])
        # Now it should allow a new one with the same fingerprint
        n2 = self.store.create("new_repo", "Again", "d", context=ctx)
        assert n2 is not None

    def test_persistence(self):
        self.store.create("drift", "Persist test", "d",
                          context={"group": "g1"})
        # Create a new store from the same path
        store2 = NotificationStore()
        items = store2.get("pending")
        assert len(items) == 1
        assert items[0]["title"] == "Persist test"

    def test_approve_nonexistent_returns_none(self):
        assert self.store.approve("nonexistent-id") is None

    def test_dismiss_nonexistent_returns_none(self):
        assert self.store.dismiss("nonexistent-id") is None

    def test_priority_ordering(self):
        self.store.create("new_repo", "Low", "l", context={"repo": "/l"})
        self.store.create("secrets_exposed", "Critical", "c", context={"f": "x"})
        self.store.create("drift", "Medium", "m", context={"group": "g"})
        self.store.create("health_failure", "High", "h", context={"server": "s"})

        items = self.store.get("pending")
        priorities = [n["priority"] for n in items]
        assert priorities == ["critical", "high", "medium", "low"]


# ── Detector Tests ───────────────────────────────────────────────

class TestDetector:

    @pytest.fixture(autouse=True)
    def setup(self, tmp_path, monkeypatch):
        monkeypatch.setattr("mcp_registry.notifications.DATA_DIR", tmp_path)
        monkeypatch.setattr(
            "mcp_registry.notifications.NOTIFICATIONS_FILE",
            tmp_path / "notifications.json",
        )
        # Reset the module-level singleton
        fresh = NotificationStore()
        monkeypatch.setattr("mcp_registry.notifications._store", fresh)
        self.tmp_path = tmp_path

    @pytest.fixture
    def store_with_repos(self, tmp_registry, tmp_path):
        """Store with a group pointing at repos, some with .mcp.json, some without."""
        group_dir = tmp_path / "repos-test"
        group_dir.mkdir()

        # Repo with .mcp.json
        repo_a = group_dir / "has-mcp"
        repo_a.mkdir()
        (repo_a / ".git").mkdir()
        (repo_a / ".mcp.json").write_text('{"mcpServers": {}}')

        # Repo without .mcp.json
        repo_b = group_dir / "no-mcp"
        repo_b.mkdir()
        (repo_b / ".git").mkdir()

        # Another repo without
        repo_c = group_dir / "also-no-mcp"
        repo_c.mkdir()
        (repo_c / ".git").mkdir()

        store = tmp_registry
        store.create_group("repos-test", "Test Repos", str(group_dir))
        store.upsert_server("taskr", {"type": "stdio", "command": "npx"})
        store.assign("taskr", "repos-test")

        return store

    def test_detect_new_repos(self, store_with_repos):
        count = detector.detect_new_repos(store_with_repos)
        assert count == 2  # no-mcp and also-no-mcp

        items = notifications.get_notifications("pending")
        assert len(items) == 2
        titles = {n["title"] for n in items}
        assert any("no-mcp" in t for t in titles)
        assert any("also-no-mcp" in t for t in titles)

    def test_detect_new_repos_no_duplicates(self, store_with_repos):
        detector.detect_new_repos(store_with_repos)
        count2 = detector.detect_new_repos(store_with_repos)
        assert count2 == 0  # already notified

    def test_detect_gitignore_missing(self, tmp_registry, tmp_path):
        group_dir = tmp_path / "repos-gi"
        group_dir.mkdir()

        # Repo with .mcp.json but NO gitignore entry
        repo_a = group_dir / "unprotected"
        repo_a.mkdir()
        (repo_a / ".git").mkdir()
        (repo_a / ".mcp.json").write_text('{}')

        # Repo with .mcp.json AND gitignore entry
        repo_b = group_dir / "protected"
        repo_b.mkdir()
        (repo_b / ".git").mkdir()
        (repo_b / ".mcp.json").write_text('{}')
        (repo_b / ".gitignore").write_text(".mcp.json\n")

        store = tmp_registry
        store.create_group("repos-gi", "GI Test", str(group_dir))
        store.upsert_server("s1", {"type": "stdio", "command": "x"})
        store.assign("s1", "repos-gi")

        count = detector.detect_gitignore_missing(store)
        assert count == 1

        items = notifications.get_notifications("pending")
        assert len(items) == 1
        assert "gitignore" in items[0]["title"].lower() or ".mcp.json" in items[0]["title"]
        assert items[0]["priority"] == "medium"

    def test_detect_health_failures(self, tmp_registry):
        import time
        store = tmp_registry
        store.upsert_server("sick-server", {
            "type": "stdio", "command": "x",
            "health": "failed", "health_ts": time.time() - 600,
        })

        count = detector.detect_health_failures(store)
        assert count == 1

        items = notifications.get_notifications("pending")
        assert items[0]["type"] == "health_failure"

    def test_run_all_detections(self, store_with_repos):
        count = detector.run_all_detections(store_with_repos)
        assert count >= 2  # at least the new repos
