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
        backup = REGISTRY_FILE.with_suffix(".backup")
        for path in [REGISTRY_FILE, backup]:
            if path.exists():
                try:
                    with open(path) as f:
                        loaded = json.load(f)
                    for key in _default_state():
                        if key not in loaded:
                            loaded[key] = _default_state()[key]
                    self._data = loaded
                    if path == backup:
                        logger.warning("Loaded from backup (primary was corrupt)")
                    else:
                        logger.info("Loaded registry from %s", path)
                    return
                except (json.JSONDecodeError, OSError) as e:
                    logger.warning("Failed to load %s: %s", path, e)
        logger.info("No registry found, starting fresh")

    def _save(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        # Backup current file before overwriting
        backup = REGISTRY_FILE.with_suffix(".backup")
        if REGISTRY_FILE.exists():
            try:
                backup.write_bytes(REGISTRY_FILE.read_bytes())
            except OSError:
                pass
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

    def validate_groups(self):
        """Flag groups whose paths no longer exist on disk."""
        with self._lock:
            changed = False
            for key, group in self._data["groups"].items():
                path = group.get("path")
                if path and not Path(path).is_dir():
                    if not group.get("_missing"):
                        group["_missing"] = True
                        changed = True
                        logger.warning("Group %s path missing: %s", key, path)
                else:
                    if group.get("_missing"):
                        del group["_missing"]
                        changed = True
            if changed:
                self._save()

    # ── queries ──────────────────────────────────────────────────

    def snapshot(self) -> dict:
        with self._lock:
            return json.loads(json.dumps(self._data))

    def snapshot_lite(self) -> dict:
        """Snapshot without env vars — safe for SSE broadcast."""
        with self._lock:
            data = json.loads(json.dumps(self._data))
        for srv in data.get("servers", {}).values():
            srv.pop("env", None)
        return data

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

    # ── webhook ────────────────────────────────────────────────────

    def set_webhook(self, group: str, url: str) -> bool:
        """Set a webhook URL for deploy notifications on a group."""
        with self._lock:
            if group not in self._data["groups"]:
                return False
            self._data["groups"][group]["webhook_url"] = url
            self._save()
        self._notify("webhook_set", {"group": group})
        return True

    def get_webhook(self, group: str) -> str | None:
        """Get the webhook URL for a group, or None if not set."""
        with self._lock:
            g = self._data["groups"].get(group, {})
            return g.get("webhook_url")

    def delete_webhook(self, group: str) -> bool:
        """Remove the webhook URL from a group."""
        with self._lock:
            if group not in self._data["groups"]:
                return False
            self._data["groups"][group].pop("webhook_url", None)
            self._save()
        self._notify("webhook_deleted", {"group": group})
        return True

    # ── dependencies ──────────────────────────────────────────────

    def set_dependencies(self, server_name: str, deps: list[str]) -> bool:
        """Set the depends_on list for a server."""
        with self._lock:
            if server_name not in self._data["servers"]:
                return False
            self._data["servers"][server_name]["depends_on"] = list(deps)
            self._save()
        self._notify("dependencies_changed", {"server": server_name})
        return True

    def get_dependencies(self, server_name: str) -> list[str] | None:
        """Get the depends_on list for a server, or None if server not found."""
        with self._lock:
            srv = self._data["servers"].get(server_name)
            if srv is None:
                return None
            return list(srv.get("depends_on", []))

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

    # ── group-level server config overrides ───────────────────────

    def set_group_server_config(self, group: str, server: str,
                                config: dict) -> bool:
        """Set per-server config overrides at the group level.

        Example: set_group_server_config("repos-greenmark", "cerebro-mcp",
                     {"env": {"SUPABASE_URL": "https://staging.supabase.co"}})

        Only the keys you provide are overridden — everything else
        comes from the base server config.
        """
        with self._lock:
            if group not in self._data["groups"]:
                return False
            g = self._data["groups"][group]
            if "server_config" not in g:
                g["server_config"] = {}
            if config:
                g["server_config"][server] = config
            else:
                g["server_config"].pop(server, None)
            self._save()
        self._notify("group_server_config_changed",
                     {"group": group, "server": server})
        return True

    def get_group_server_config(self, group: str, server: str) -> dict:
        """Get per-server config overrides for a group."""
        with self._lock:
            g = self._data["groups"].get(group, {})
            return dict(g.get("server_config", {}).get(server, {}))

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
