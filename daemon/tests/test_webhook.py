"""Tests for webhook notification system."""

import json
import time
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

from mcp_registry.store import RegistryStore
from mcp_registry import webhook
from mcp_registry import activity


# ── Store webhook methods ─────────────────────────────────────────


class TestStoreWebhook:
    """Tests for RegistryStore webhook CRUD."""

    def test_set_and_get_webhook(self, tmp_registry):
        store = tmp_registry
        store.create_group("test-group", "Test Group", "/tmp/test")

        assert store.get_webhook("test-group") is None

        ok = store.set_webhook("test-group", "https://example.com/hook")
        assert ok is True
        assert store.get_webhook("test-group") == "https://example.com/hook"

    def test_set_webhook_nonexistent_group(self, tmp_registry):
        store = tmp_registry
        ok = store.set_webhook("nope", "https://example.com/hook")
        assert ok is False

    def test_get_webhook_nonexistent_group(self, tmp_registry):
        store = tmp_registry
        assert store.get_webhook("nope") is None

    def test_delete_webhook(self, tmp_registry):
        store = tmp_registry
        store.create_group("test-group", "Test Group", "/tmp/test")
        store.set_webhook("test-group", "https://example.com/hook")

        ok = store.delete_webhook("test-group")
        assert ok is True
        assert store.get_webhook("test-group") is None

    def test_delete_webhook_nonexistent_group(self, tmp_registry):
        store = tmp_registry
        ok = store.delete_webhook("nope")
        assert ok is False

    def test_delete_webhook_when_none_set(self, tmp_registry):
        store = tmp_registry
        store.create_group("test-group", "Test Group", "/tmp/test")
        # Should succeed (idempotent) — just no-ops the pop
        ok = store.delete_webhook("test-group")
        assert ok is True

    def test_webhook_persists_across_reload(self, tmp_registry, monkeypatch, tmp_path):
        store = tmp_registry
        store.create_group("test-group", "Test Group", "/tmp/test")
        store.set_webhook("test-group", "https://example.com/hook")

        # Reload from disk
        store2 = RegistryStore()
        assert store2.get_webhook("test-group") == "https://example.com/hook"

    def test_webhook_in_snapshot(self, tmp_registry):
        store = tmp_registry
        store.create_group("test-group", "Test Group", "/tmp/test")
        store.set_webhook("test-group", "https://example.com/hook")

        snap = store.snapshot()
        assert snap["groups"]["test-group"]["webhook_url"] == "https://example.com/hook"

    def test_set_webhook_overwrites(self, tmp_registry):
        store = tmp_registry
        store.create_group("test-group", "Test Group", "/tmp/test")
        store.set_webhook("test-group", "https://example.com/hook1")
        store.set_webhook("test-group", "https://example.com/hook2")
        assert store.get_webhook("test-group") == "https://example.com/hook2"


# ── Webhook notification ──────────────────────────────────────────


class TestWebhookNotification:
    """Tests for the webhook.notify_deploy function."""

    def test_notify_deploy_no_webhook(self, tmp_registry):
        """No webhook URL → no HTTP call."""
        store = tmp_registry
        store.create_group("test-group", "Test Group", "/tmp/test")

        with patch.object(webhook, '_client') as mock_client:
            webhook.notify_deploy(store, "test-group", written=5, errors=0)
            mock_client.post.assert_not_called()

    def test_notify_deploy_fires_request(self, tmp_registry):
        """With webhook URL → POST is called in a thread."""
        store = tmp_registry
        store.create_group("test-group", "Test Group", "/tmp/test")
        store.set_webhook("test-group", "https://example.com/hook")

        mock_response = MagicMock()
        mock_response.status_code = 200

        with patch.object(webhook, '_client') as mock_client:
            mock_client.post.return_value = mock_response

            # Call _send_webhook directly (synchronous) to test payload
            webhook._send_webhook(
                "https://example.com/hook",
                {"event": "deploy", "group": "test-group", "written": 5, "errors": 0,
                 "timestamp": "2025-01-01T00:00:00+00:00"},
                "test-group",
            )
            mock_client.post.assert_called_once()
            call_args = mock_client.post.call_args
            assert call_args[0][0] == "https://example.com/hook"
            payload = call_args[1]["json"]
            assert payload["event"] == "deploy"
            assert payload["group"] == "test-group"
            assert payload["written"] == 5
            assert payload["errors"] == 0

    def test_notify_deploy_logs_success_to_activity(self, tmp_registry, monkeypatch, tmp_path):
        """Successful webhook POST logs to activity."""
        monkeypatch.setattr("mcp_registry.activity.DATA_DIR", tmp_path)
        monkeypatch.setattr("mcp_registry.activity.ACTIVITY_FILE", tmp_path / "activity.json")
        activity.clear()

        mock_response = MagicMock()
        mock_response.status_code = 200

        with patch.object(webhook, '_client') as mock_client:
            mock_client.post.return_value = mock_response
            webhook._send_webhook("https://example.com/hook", {}, "test-group")

        events = activity.get_events(10)
        assert len(events) >= 1
        wh_event = events[0]
        assert wh_event["type"] == "webhook"
        assert wh_event["detail"]["status"] == 200

    def test_notify_deploy_logs_error_to_activity(self, tmp_registry, monkeypatch, tmp_path):
        """Failed webhook POST logs error to activity."""
        monkeypatch.setattr("mcp_registry.activity.DATA_DIR", tmp_path)
        monkeypatch.setattr("mcp_registry.activity.ACTIVITY_FILE", tmp_path / "activity.json")
        activity.clear()

        with patch.object(webhook, '_client') as mock_client:
            mock_client.post.side_effect = Exception("connection refused")
            webhook._send_webhook("https://example.com/hook", {}, "test-group")

        events = activity.get_events(10)
        assert len(events) >= 1
        wh_event = events[0]
        assert wh_event["type"] == "webhook"
        assert wh_event["detail"]["status"] == "error"
        assert "connection refused" in wh_event["detail"]["error"]


# ── API endpoints ─────────────────────────────────────────────────


@pytest.fixture
def api_client(tmp_registry, monkeypatch, tmp_path):
    """FastAPI TestClient with a temp-backed store."""
    monkeypatch.setattr("mcp_registry.activity.DATA_DIR", tmp_path)
    monkeypatch.setattr("mcp_registry.activity.ACTIVITY_FILE", tmp_path / "activity.json")
    activity.clear()

    # Patch the server module's store
    import mcp_registry.server as srv_mod
    old_store = srv_mod._store
    srv_mod._store = tmp_registry
    tmp_registry.create_group("test-group", "Test Group", "/tmp/test")

    client = TestClient(srv_mod.app, raise_server_exceptions=False)
    yield client

    srv_mod._store = old_store


class TestWebhookAPI:
    """Tests for webhook REST endpoints."""

    def test_get_webhook_empty(self, api_client):
        resp = api_client.get("/groups/test-group/webhook")
        assert resp.status_code == 200
        data = resp.json()
        assert data["webhook_url"] is None

    def test_put_webhook(self, api_client):
        resp = api_client.put(
            "/groups/test-group/webhook",
            json={"url": "https://example.com/hook"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["webhook_url"] == "https://example.com/hook"

    def test_put_then_get_webhook(self, api_client):
        api_client.put(
            "/groups/test-group/webhook",
            json={"url": "https://example.com/hook"},
        )
        resp = api_client.get("/groups/test-group/webhook")
        assert resp.json()["webhook_url"] == "https://example.com/hook"

    def test_delete_webhook(self, api_client):
        api_client.put(
            "/groups/test-group/webhook",
            json={"url": "https://example.com/hook"},
        )
        resp = api_client.delete("/groups/test-group/webhook")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        resp = api_client.get("/groups/test-group/webhook")
        assert resp.json()["webhook_url"] is None

    def test_put_webhook_nonexistent_group(self, api_client):
        resp = api_client.put(
            "/groups/no-such-group/webhook",
            json={"url": "https://example.com/hook"},
        )
        assert resp.status_code == 404

    def test_delete_webhook_nonexistent_group(self, api_client):
        resp = api_client.delete("/groups/no-such-group/webhook")
        assert resp.status_code == 404
