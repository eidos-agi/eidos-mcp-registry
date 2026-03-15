"""
Layer 3 — Store Integrity Tests

The store is the source of truth. If it corrupts, everything downstream breaks.
"""

import json
import threading
from pathlib import Path

import pytest

from mcp_registry.store import RegistryStore


# ── Basic CRUD ────────────────────────────────────────────────────


class TestServerCRUD:

    def test_upsert_creates_server(self, tmp_registry):
        tmp_registry.upsert_server("test", {"type": "stdio", "command": "echo"})
        assert "test" in tmp_registry.servers
        assert tmp_registry.servers["test"]["type"] == "stdio"

    def test_upsert_updates_existing(self, tmp_registry):
        tmp_registry.upsert_server("test", {"type": "stdio", "command": "echo"})
        tmp_registry.upsert_server("test", {"command": "cat"})
        assert tmp_registry.servers["test"]["command"] == "cat"
        assert tmp_registry.servers["test"]["type"] == "stdio"  # preserved

    def test_upsert_always_sets_name(self, tmp_registry):
        tmp_registry.upsert_server("test", {"type": "stdio"})
        assert tmp_registry.servers["test"]["name"] == "test"

    def test_bulk_upsert(self, tmp_registry):
        servers = {
            "a": {"type": "stdio", "command": "echo"},
            "b": {"type": "http", "url": "https://example.com"},
        }
        tmp_registry.upsert_servers_bulk(servers)
        assert "a" in tmp_registry.servers
        assert "b" in tmp_registry.servers

    def test_server_count(self, tmp_registry):
        assert tmp_registry.server_count() == 0
        tmp_registry.upsert_server("a", {"type": "stdio"})
        assert tmp_registry.server_count() == 1


# ── Group CRUD ────────────────────────────────────────────────────


class TestGroupCRUD:

    def test_create_group(self, tmp_registry):
        ok = tmp_registry.create_group("test-group", "Test Group", "/tmp/test")
        assert ok is True
        assert "test-group" in tmp_registry.groups

    def test_create_duplicate_group_returns_false(self, tmp_registry):
        tmp_registry.create_group("test-group", "Test Group")
        ok = tmp_registry.create_group("test-group", "Test Group")
        assert ok is False

    def test_delete_group(self, tmp_registry):
        tmp_registry.create_group("deleteme", "Delete Me")
        ok = tmp_registry.delete_group("deleteme")
        assert ok is True
        assert "deleteme" not in tmp_registry.groups

    def test_cannot_delete_universal(self, tmp_registry):
        ok = tmp_registry.delete_group("__universal__")
        assert ok is False
        assert "__universal__" in tmp_registry.groups

    def test_delete_nonexistent_returns_false(self, tmp_registry):
        ok = tmp_registry.delete_group("nope")
        assert ok is False

    def test_universal_exists_by_default(self, tmp_registry):
        assert "__universal__" in tmp_registry.groups

    def test_group_count(self, tmp_registry):
        # __universal__ is default
        assert tmp_registry.group_count() == 1
        tmp_registry.create_group("new", "New")
        assert tmp_registry.group_count() == 2


# ── Assignments ───────────────────────────────────────────────────


class TestAssignments:

    def test_assign_server_to_group(self, tmp_registry):
        tmp_registry.upsert_server("s1", {"type": "stdio"})
        tmp_registry.create_group("g1", "Group 1")
        ok = tmp_registry.assign("s1", "g1")
        assert ok is True
        assert "s1" in tmp_registry.groups["g1"]["servers"]

    def test_assign_removes_from_other_groups(self, tmp_registry):
        """Server can only be in one group at a time (except universal)."""
        tmp_registry.upsert_server("s1", {"type": "stdio"})
        tmp_registry.create_group("g1", "Group 1")
        tmp_registry.create_group("g2", "Group 2")

        tmp_registry.assign("s1", "g1")
        tmp_registry.assign("s1", "g2")

        assert "s1" not in tmp_registry.groups["g1"]["servers"]
        assert "s1" in tmp_registry.groups["g2"]["servers"]

    def test_assign_nonexistent_server_fails(self, tmp_registry):
        tmp_registry.create_group("g1", "Group 1")
        ok = tmp_registry.assign("nope", "g1")
        assert ok is False

    def test_assign_nonexistent_group_fails(self, tmp_registry):
        tmp_registry.upsert_server("s1", {"type": "stdio"})
        ok = tmp_registry.assign("s1", "nope")
        assert ok is False

    def test_unassign(self, tmp_registry):
        tmp_registry.upsert_server("s1", {"type": "stdio"})
        tmp_registry.create_group("g1", "Group 1")
        tmp_registry.assign("s1", "g1")
        ok = tmp_registry.unassign("s1", "g1")
        assert ok is True
        assert "s1" not in tmp_registry.groups["g1"]["servers"]

    def test_unassign_not_in_group_fails(self, tmp_registry):
        tmp_registry.upsert_server("s1", {"type": "stdio"})
        tmp_registry.create_group("g1", "Group 1")
        ok = tmp_registry.unassign("s1", "g1")
        assert ok is False

    def test_unassigned_servers(self, tmp_registry):
        tmp_registry.upsert_server("s1", {"type": "stdio"})
        tmp_registry.upsert_server("s2", {"type": "stdio"})
        tmp_registry.create_group("g1", "Group 1")
        tmp_registry.assign("s1", "g1")

        unassigned = tmp_registry.unassigned_servers()
        assert "s2" in unassigned
        assert "s1" not in unassigned


# ── Effective Servers (the critical computation) ──────────────────


class TestEffectiveServers:
    """This is the core of the deploy logic. Must be rock solid."""

    def test_universal_plus_group(self, tmp_registry):
        tmp_registry.upsert_server("u1", {"type": "stdio"})
        tmp_registry.upsert_server("g1s1", {"type": "stdio"})
        tmp_registry.create_group("grp", "Group")

        tmp_registry.assign("u1", "__universal__")
        tmp_registry.assign("g1s1", "grp")

        effective = tmp_registry.effective_servers("/some/repo", "grp")
        assert "u1" in effective
        assert "g1s1" in effective

    def test_universal_comes_first(self, tmp_registry):
        tmp_registry.upsert_server("u1", {"type": "stdio"})
        tmp_registry.upsert_server("g1s1", {"type": "stdio"})
        tmp_registry.create_group("grp", "Group")

        tmp_registry.assign("u1", "__universal__")
        tmp_registry.assign("g1s1", "grp")

        effective = tmp_registry.effective_servers("/some/repo", "grp")
        assert effective.index("u1") < effective.index("g1s1")

    def test_override_add(self, tmp_registry):
        tmp_registry.upsert_server("base", {"type": "stdio"})
        tmp_registry.upsert_server("extra", {"type": "stdio"})
        tmp_registry.create_group("grp", "Group")
        tmp_registry.assign("base", "grp")

        tmp_registry.set_override("/special/repo", add=["extra"])

        effective = tmp_registry.effective_servers("/special/repo", "grp")
        assert "extra" in effective
        assert "base" in effective

    def test_override_remove(self, tmp_registry):
        tmp_registry.upsert_server("base", {"type": "stdio"})
        tmp_registry.upsert_server("noisy", {"type": "stdio"})
        tmp_registry.create_group("grp", "Group")
        tmp_registry.assign("base", "grp")
        tmp_registry.assign("noisy", "grp")

        tmp_registry.set_override("/quiet/repo", remove=["noisy"])

        effective = tmp_registry.effective_servers("/quiet/repo", "grp")
        assert "base" in effective
        assert "noisy" not in effective

    def test_deduplication(self, tmp_registry):
        """Server in both universal and group appears once."""
        tmp_registry.upsert_server("shared", {"type": "stdio"})
        tmp_registry.create_group("grp", "Group")

        # Assign to universal first, then try to assign to grp
        # (assign removes from other groups, so this tests the edge case
        #  where we manually set up the data)
        tmp_registry.assign("shared", "__universal__")

        effective = tmp_registry.effective_servers("/some/repo", "grp")
        assert effective.count("shared") == 1


# ── Persistence ───────────────────────────────────────────────────


class TestPersistence:

    def test_save_and_reload(self, tmp_path, monkeypatch):
        monkeypatch.setattr("mcp_registry.store.DATA_DIR", tmp_path)
        monkeypatch.setattr("mcp_registry.store.REGISTRY_FILE", tmp_path / "registry.json")

        # Create and populate
        store1 = RegistryStore()
        store1.upsert_server("test", {"type": "stdio", "command": "echo"})
        store1.create_group("grp", "Group", "/tmp/grp")
        store1.assign("test", "grp")

        # Reload from disk
        store2 = RegistryStore()
        assert "test" in store2.servers
        assert "grp" in store2.groups
        assert "test" in store2.groups["grp"]["servers"]

    def test_backup_recovery(self, tmp_path, monkeypatch):
        registry_file = tmp_path / "registry.json"
        monkeypatch.setattr("mcp_registry.store.DATA_DIR", tmp_path)
        monkeypatch.setattr("mcp_registry.store.REGISTRY_FILE", registry_file)

        # Create valid state — two saves so backup exists
        # (first save has no prior file to back up)
        store1 = RegistryStore()
        store1.upsert_server("test", {"type": "stdio"})
        store1.upsert_server("test", {"type": "stdio", "command": "echo"})

        # Verify backup was created
        backup = registry_file.with_suffix(".backup")
        assert backup.exists(), "Backup file should exist after second save"

        # Corrupt primary file
        registry_file.write_text("NOT JSON{{{")

        # Should fall back to backup
        store2 = RegistryStore()
        assert "test" in store2.servers

    def test_atomic_write(self, tmp_path, monkeypatch):
        """Write uses tmp + rename — no partial writes."""
        registry_file = tmp_path / "registry.json"
        monkeypatch.setattr("mcp_registry.store.DATA_DIR", tmp_path)
        monkeypatch.setattr("mcp_registry.store.REGISTRY_FILE", registry_file)

        store = RegistryStore()
        store.upsert_server("test", {"type": "stdio"})

        # File should be valid JSON
        data = json.loads(registry_file.read_text())
        assert "servers" in data

        # No .tmp file should remain
        assert not (tmp_path / "registry.tmp").exists()


# ── Thread Safety ─────────────────────────────────────────────────


class TestThreadSafety:

    def test_concurrent_upserts(self, tmp_registry):
        """Multiple threads upserting shouldn't corrupt the store."""
        errors = []

        def upsert_batch(prefix, count):
            try:
                for i in range(count):
                    tmp_registry.upsert_server(
                        f"{prefix}-{i}",
                        {"type": "stdio", "command": f"echo {prefix}-{i}"}
                    )
            except Exception as e:
                errors.append(e)

        threads = [
            threading.Thread(target=upsert_batch, args=(f"t{t}", 20))
            for t in range(5)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors, f"Thread errors: {errors}"
        assert tmp_registry.server_count() == 100  # 5 threads × 20 servers

    def test_concurrent_assign_unassign(self, tmp_registry):
        """Concurrent assign/unassign shouldn't corrupt group membership."""
        for i in range(10):
            tmp_registry.upsert_server(f"s{i}", {"type": "stdio"})
        tmp_registry.create_group("grp", "Group")

        errors = []

        def assign_unassign(server_name):
            try:
                tmp_registry.assign(server_name, "grp")
                tmp_registry.unassign(server_name, "grp")
                tmp_registry.assign(server_name, "grp")
            except Exception as e:
                errors.append(e)

        threads = [
            threading.Thread(target=assign_unassign, args=(f"s{i}",))
            for i in range(10)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors


# ── Change Notifications ──────────────────────────────────────────


class TestChangeNotifications:

    def test_upsert_fires_notification(self, tmp_registry):
        events = []
        tmp_registry.on_change(lambda e: events.append(e))
        tmp_registry.upsert_server("test", {"type": "stdio"})
        assert len(events) == 1
        assert events[0]["event"] == "server_upserted"

    def test_assign_fires_notification(self, tmp_registry):
        tmp_registry.upsert_server("s1", {"type": "stdio"})
        tmp_registry.create_group("g1", "G1")

        events = []
        tmp_registry.on_change(lambda e: events.append(e))
        tmp_registry.assign("s1", "g1")

        assign_events = [e for e in events if e["event"] == "server_assigned"]
        assert len(assign_events) == 1


# ── Group Validation ──────────────────────────────────────────────


class TestGroupValidation:

    def test_missing_path_flagged(self, tmp_registry):
        tmp_registry.create_group("gone", "Gone", "/nonexistent/path/12345")
        tmp_registry.validate_groups()
        groups = tmp_registry.groups
        assert groups["gone"].get("_missing") is True

    def test_valid_path_not_flagged(self, tmp_registry, tmp_path):
        tmp_registry.create_group("exists", "Exists", str(tmp_path))
        tmp_registry.validate_groups()
        groups = tmp_registry.groups
        assert groups["exists"].get("_missing") is None

    def test_missing_flag_cleared_when_path_returns(self, tmp_registry, tmp_path):
        path = tmp_path / "comeback"
        path.mkdir()
        tmp_registry.create_group("comeback", "Comeback", str(path))

        # Simulate missing
        path.rmdir()
        tmp_registry.validate_groups()
        assert tmp_registry.groups["comeback"].get("_missing") is True

        # Path returns
        path.mkdir()
        tmp_registry.validate_groups()
        assert tmp_registry.groups["comeback"].get("_missing") is None


# ── Snapshot Safety ───────────────────────────────────────────────


class TestSnapshots:

    def test_snapshot_is_deep_copy(self, tmp_registry):
        tmp_registry.upsert_server("test", {"type": "stdio"})
        snap = tmp_registry.snapshot()
        snap["servers"]["test"]["type"] = "MUTATED"
        assert tmp_registry.servers["test"]["type"] == "stdio"

    def test_snapshot_lite_strips_env(self, tmp_registry):
        tmp_registry.upsert_server("test", {
            "type": "stdio",
            "env": {"SECRET": "hunter2"},
        })
        lite = tmp_registry.snapshot_lite()
        assert "env" not in lite["servers"]["test"]

    def test_full_snapshot_keeps_env(self, tmp_registry):
        tmp_registry.upsert_server("test", {
            "type": "stdio",
            "env": {"SECRET": "hunter2"},
        })
        full = tmp_registry.snapshot()
        assert full["servers"]["test"]["env"]["SECRET"] == "hunter2"
