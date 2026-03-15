"""Activity log tests."""

import pytest
from mcp_registry import activity


@pytest.fixture(autouse=True)
def clean_activity(tmp_path, monkeypatch):
    monkeypatch.setattr("mcp_registry.activity.DATA_DIR", tmp_path)
    monkeypatch.setattr("mcp_registry.activity.ACTIVITY_FILE", tmp_path / "activity.json")
    activity.clear()
    yield


class TestActivityLog:

    def test_log_and_get(self):
        activity.log_event("assign", {"server": "taskr", "group": "repos-test"})
        events = activity.get_events()
        assert len(events) == 1
        assert events[0]["type"] == "assign"
        assert events[0]["detail"]["server"] == "taskr"

    def test_newest_first(self):
        activity.log_event("assign", {"order": 1})
        activity.log_event("unassign", {"order": 2})
        events = activity.get_events()
        assert events[0]["type"] == "unassign"
        assert events[1]["type"] == "assign"

    def test_limit(self):
        for i in range(10):
            activity.log_event("assign", {"i": i})
        events = activity.get_events(limit=3)
        assert len(events) == 3

    def test_ring_buffer_max_100(self):
        for i in range(120):
            activity.log_event("assign", {"i": i})
        events = activity.get_events(limit=200)
        assert len(events) == 100

    def test_persistence(self, tmp_path, monkeypatch):
        activity.log_event("deploy", {"test": True})
        # Reset in-memory state
        activity._events.clear()
        activity._loaded = False
        # Reload
        events = activity.get_events()
        assert len(events) == 1
        assert events[0]["type"] == "deploy"

    def test_empty_events(self):
        events = activity.get_events()
        assert events == []

    def test_event_has_timestamp(self):
        activity.log_event("scan", {})
        events = activity.get_events()
        assert "ts" in events[0]
        assert isinstance(events[0]["ts"], float)
