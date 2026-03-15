"""
Tests for server dependency tracking system.

Covers: store CRUD, deployer unmet detection, API endpoints.
"""

import json

import pytest

from mcp_registry.store import RegistryStore
from mcp_registry.deployer import preview as deploy_preview


# ── Store: Dependency CRUD ────────────────────────────────────────


class TestDependencyStore:

    def test_set_dependencies(self, tmp_registry):
        tmp_registry.upsert_server("cerebro-mcp", {"type": "stdio", "command": "node"})
        ok = tmp_registry.set_dependencies("cerebro-mcp", ["keeper", "context7"])
        assert ok is True

        deps = tmp_registry.get_dependencies("cerebro-mcp")
        assert deps == ["keeper", "context7"]

    def test_set_dependencies_nonexistent_server(self, tmp_registry):
        ok = tmp_registry.set_dependencies("nope", ["keeper"])
        assert ok is False

    def test_get_dependencies_nonexistent_server(self, tmp_registry):
        result = tmp_registry.get_dependencies("nope")
        assert result is None

    def test_get_dependencies_no_deps_set(self, tmp_registry):
        tmp_registry.upsert_server("simple", {"type": "stdio", "command": "echo"})
        deps = tmp_registry.get_dependencies("simple")
        assert deps == []

    def test_set_dependencies_overwrites(self, tmp_registry):
        tmp_registry.upsert_server("srv", {"type": "stdio", "command": "echo"})
        tmp_registry.set_dependencies("srv", ["a", "b"])
        tmp_registry.set_dependencies("srv", ["c"])
        assert tmp_registry.get_dependencies("srv") == ["c"]

    def test_set_empty_dependencies(self, tmp_registry):
        tmp_registry.upsert_server("srv", {"type": "stdio", "command": "echo"})
        tmp_registry.set_dependencies("srv", ["a"])
        tmp_registry.set_dependencies("srv", [])
        assert tmp_registry.get_dependencies("srv") == []

    def test_dependencies_persist(self, tmp_path, monkeypatch):
        monkeypatch.setattr("mcp_registry.store.DATA_DIR", tmp_path)
        monkeypatch.setattr("mcp_registry.store.REGISTRY_FILE", tmp_path / "registry.json")

        store1 = RegistryStore()
        store1.upsert_server("srv", {"type": "stdio", "command": "echo"})
        store1.set_dependencies("srv", ["keeper", "context7"])

        store2 = RegistryStore()
        assert store2.get_dependencies("srv") == ["keeper", "context7"]

    def test_dependencies_in_snapshot(self, tmp_registry):
        tmp_registry.upsert_server("srv", {"type": "stdio", "command": "echo"})
        tmp_registry.set_dependencies("srv", ["keeper"])
        snap = tmp_registry.snapshot()
        assert snap["servers"]["srv"]["depends_on"] == ["keeper"]

    def test_set_dependencies_fires_notification(self, tmp_registry):
        tmp_registry.upsert_server("srv", {"type": "stdio", "command": "echo"})
        events = []
        tmp_registry.on_change(lambda e: events.append(e))
        tmp_registry.set_dependencies("srv", ["keeper"])
        dep_events = [e for e in events if e["event"] == "dependencies_changed"]
        assert len(dep_events) == 1
        assert dep_events[0]["server"] == "srv"


# ── Deployer: Unmet Dependency Detection ──────────────────────────


class TestDeployerUnmetDependencies:

    def test_unmet_deps_detected(self, store_with_group):
        store, group_path, repos = store_with_group
        # cerebro-mcp depends on keeper, but keeper is not in the group
        store.set_dependencies("cerebro-mcp", ["keeper"])

        changes = deploy_preview(store)
        assert len(changes) > 0

        for path, change in changes.items():
            unmet = change.get("unmet_dependencies", {})
            assert "cerebro-mcp" in unmet
            assert "keeper" in unmet["cerebro-mcp"]

    def test_no_unmet_when_dep_present(self, store_with_group):
        store, group_path, repos = store_with_group
        # cerebro-mcp depends on taskr, and taskr IS in the group
        store.set_dependencies("cerebro-mcp", ["taskr"])

        changes = deploy_preview(store)
        for path, change in changes.items():
            unmet = change.get("unmet_dependencies", {})
            # cerebro-mcp should NOT appear since taskr is in the effective set
            assert "cerebro-mcp" not in unmet

    def test_no_unmet_when_dep_in_universal(self, store_with_group):
        store, group_path, repos = store_with_group
        # cerebro-mcp depends on context7, which is in universal
        store.set_dependencies("cerebro-mcp", ["context7"])

        changes = deploy_preview(store)
        for path, change in changes.items():
            unmet = change.get("unmet_dependencies", {})
            assert "cerebro-mcp" not in unmet

    def test_no_unmet_when_no_deps(self, store_with_group):
        store, group_path, repos = store_with_group
        # No dependencies set
        changes = deploy_preview(store)
        for path, change in changes.items():
            unmet = change.get("unmet_dependencies", {})
            assert len(unmet) == 0

    def test_multiple_servers_with_unmet(self, store_with_group):
        store, group_path, repos = store_with_group
        # Both servers have unmet deps
        store.set_dependencies("cerebro-mcp", ["keeper"])
        store.set_dependencies("taskr", ["wrike"])

        changes = deploy_preview(store)
        for path, change in changes.items():
            unmet = change.get("unmet_dependencies", {})
            assert "cerebro-mcp" in unmet
            assert "keeper" in unmet["cerebro-mcp"]
            assert "taskr" in unmet
            assert "wrike" in unmet["taskr"]

    def test_partial_deps_met(self, store_with_group):
        store, group_path, repos = store_with_group
        # cerebro-mcp depends on taskr (present) and keeper (missing)
        store.set_dependencies("cerebro-mcp", ["taskr", "keeper"])

        changes = deploy_preview(store)
        for path, change in changes.items():
            unmet = change.get("unmet_dependencies", {})
            assert "cerebro-mcp" in unmet
            assert unmet["cerebro-mcp"] == ["keeper"]


# ── API Endpoints ─────────────────────────────────────────────────


class TestDependencyAPI:

    @pytest.fixture
    def client(self, tmp_path, monkeypatch):
        monkeypatch.setattr("mcp_registry.store.DATA_DIR", tmp_path)
        monkeypatch.setattr("mcp_registry.store.REGISTRY_FILE", tmp_path / "registry.json")

        from fastapi.testclient import TestClient
        from mcp_registry.server import app, _store

        # We need to use the lifespan, but for unit tests we can
        # just set up the store directly
        import mcp_registry.server as srv_mod
        store = RegistryStore()
        store.upsert_server("cerebro-mcp", {"type": "stdio", "command": "node"})
        store.upsert_server("keeper", {"type": "stdio", "command": "node"})
        srv_mod._store = store

        client = TestClient(app, raise_server_exceptions=False)
        yield client, store

        srv_mod._store = None

    def test_put_dependencies(self, client):
        c, store = client
        resp = c.put("/servers/cerebro-mcp/dependencies",
                     json={"depends_on": ["keeper"]})
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["depends_on"] == ["keeper"]

    def test_get_dependencies(self, client):
        c, store = client
        store.set_dependencies("cerebro-mcp", ["keeper"])
        resp = c.get("/servers/cerebro-mcp/dependencies")
        assert resp.status_code == 200
        data = resp.json()
        assert data["server"] == "cerebro-mcp"
        assert data["depends_on"] == ["keeper"]

    def test_get_dependencies_empty(self, client):
        c, store = client
        resp = c.get("/servers/cerebro-mcp/dependencies")
        assert resp.status_code == 200
        assert resp.json()["depends_on"] == []

    def test_put_dependencies_not_found(self, client):
        c, store = client
        resp = c.put("/servers/nope/dependencies",
                     json={"depends_on": ["keeper"]})
        assert resp.status_code == 404

    def test_get_dependencies_not_found(self, client):
        c, store = client
        resp = c.get("/servers/nope/dependencies")
        assert resp.status_code == 404
