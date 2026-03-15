"""
Thread-safe registry state with JSON persistence.

Data lives at ~/.eidos-mcp-registry/registry.json
"""

import json
import logging
import threading
from pathlib import Path
from typing import Callable

logger = logging.getLogger("mcp_registry.store")

DATA_DIR = Path.home() / ".eidos-mcp-registry"
REGISTRY_FILE = DATA_DIR / "registry.json"


def _default_state() -> dict:
    return {
        "servers": {},
        "groups": {
            "__universal__": {"label": "Universal", "path": None, "servers": []},
        },
        "repo_overrides": {},
    }


class RegistryStore:
    """Thread-safe store for MCP server registry."""

    def __init__(self):
        self._lock = threading.Lock()
        self._data = _default_state()
        self._on_change: list[Callable] = []
        self._load()

    # ── persistence ──────────────────────────────────────────────

    def _load(self):
        if REGISTRY_FILE.exists():
            try:
                with open(REGISTRY_FILE) as f:
                    loaded = json.load(f)
                # Merge with defaults to handle missing keys
                for key in _default_state():
                    if key not in loaded:
                        loaded[key] = _default_state()[key]
                self._data = loaded
                logger.info("Loaded registry from %s", REGISTRY_FILE)
            except (json.JSONDecodeError, OSError) as e:
                logger.warning("Failed to load registry: %s", e)

    def _save(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        tmp = REGISTRY_FILE.with_suffix(".tmp")
        with open(tmp, "w") as f:
            json.dump(self._data, f, indent=2)
        tmp.rename(REGISTRY_FILE)

    def _notify(self, event: str, detail: dict | None = None):
        payload = {"event": event, **(detail or {})}
        for fn in self._on_change:
            try:
                fn(payload)
            except Exception:
                logger.exception("Change listener error")

    def on_change(self, fn: Callable):
        self._on_change.append(fn)

    # ── queries ──────────────────────────────────────────────────

    def snapshot(self) -> dict:
        with self._lock:
            return json.loads(json.dumps(self._data))

    @property
    def servers(self) -> dict:
        with self._lock:
            return dict(self._data["servers"])

    @property
    def groups(self) -> dict:
        with self._lock:
            return dict(self._data["groups"])

    @property
    def repo_overrides(self) -> dict:
        with self._lock:
            return dict(self._data["repo_overrides"])

    def server_count(self) -> int:
        with self._lock:
            return len(self._data["servers"])

    def group_count(self) -> int:
        with self._lock:
            return len(self._data["groups"])

    # ── server mutations ─────────────────────────────────────────

    def upsert_server(self, name: str, config: dict):
        with self._lock:
            existing = self._data["servers"].get(name, {})
            existing.update(config)
            existing["name"] = name
            self._data["servers"][name] = existing
            self._save()
        self._notify("server_upserted", {"server": name})

    def upsert_servers_bulk(self, servers: dict[str, dict]):
        with self._lock:
            for name, config in servers.items():
                existing = self._data["servers"].get(name, {})
                existing.update(config)
                existing["name"] = name
                self._data["servers"][name] = existing
            self._save()
        self._notify("servers_bulk_upserted", {"count": len(servers)})

    def update_health(self, name: str, status: str, ts: float):
        with self._lock:
            if name in self._data["servers"]:
                self._data["servers"][name]["health"] = status
                self._data["servers"][name]["health_ts"] = ts
                self._save()
        self._notify("health_updated", {"server": name, "status": status})

    # ── group mutations ──────────────────────────────────────────

    def create_group(self, key: str, label: str, path: str | None = None):
        with self._lock:
            if key in self._data["groups"]:
                return False
            self._data["groups"][key] = {
                "label": label,
                "path": path,
                "servers": [],
            }
            self._save()
        self._notify("group_created", {"group": key})
        return True

    def delete_group(self, key: str) -> bool:
        if key == "__universal__":
            return False
        with self._lock:
            if key not in self._data["groups"]:
                return False
            del self._data["groups"][key]
            self._save()
        self._notify("group_deleted", {"group": key})
        return True

    # ── assignment mutations ─────────────────────────────────────

    def assign(self, server: str, group: str) -> bool:
        with self._lock:
            if group not in self._data["groups"]:
                return False
            if server not in self._data["servers"]:
                return False
            servers = self._data["groups"][group]["servers"]
            # Remove from any other group first
            for g in self._data["groups"].values():
                if server in g["servers"] and g is not self._data["groups"][group]:
                    g["servers"].remove(server)
            if server not in servers:
                servers.append(server)
            self._save()
        self._notify("server_assigned", {"server": server, "group": group})
        return True

    def unassign(self, server: str, group: str) -> bool:
        with self._lock:
            if group not in self._data["groups"]:
                return False
            servers = self._data["groups"][group]["servers"]
            if server not in servers:
                return False
            servers.remove(server)
            self._save()
        self._notify("server_unassigned", {"server": server, "group": group})
        return True

    def unassigned_servers(self) -> list[str]:
        """Servers not in any group."""
        with self._lock:
            assigned = set()
            for g in self._data["groups"].values():
                assigned.update(g["servers"])
            return [s for s in self._data["servers"] if s not in assigned]

    # ── repo overrides ───────────────────────────────────────────

    def set_override(self, repo: str, add: list[str] | None = None,
                     remove: list[str] | None = None):
        with self._lock:
            override = {}
            if add:
                override["add"] = add
            if remove:
                override["remove"] = remove
            if override:
                self._data["repo_overrides"][repo] = override
            elif repo in self._data["repo_overrides"]:
                del self._data["repo_overrides"][repo]
            self._save()
        self._notify("override_changed", {"repo": repo})

    def effective_servers(self, repo_path: str, group_key: str) -> list[str]:
        """Compute effective servers for a repo: universal + group + overrides."""
        with self._lock:
            universal = list(self._data["groups"].get("__universal__", {}).get("servers", []))
            group_servers = list(self._data["groups"].get(group_key, {}).get("servers", []))
            combined = list(dict.fromkeys(universal + group_servers))  # dedupe, preserve order
            override = self._data["repo_overrides"].get(repo_path, {})
            for s in override.get("add", []):
                if s not in combined:
                    combined.append(s)
            for s in override.get("remove", []):
                if s in combined:
                    combined.remove(s)
            return combined
