"""Shared fixtures for MCP Registry tests."""

import json
import os
import tempfile
from pathlib import Path

import pytest

from mcp_registry.store import RegistryStore


# ── Fixtures ──────────────────────────────────────────────────────


@pytest.fixture
def tmp_registry(tmp_path, monkeypatch):
    """RegistryStore backed by a temp directory instead of ~/.eidos-mcp-registry."""
    monkeypatch.setattr("mcp_registry.store.DATA_DIR", tmp_path)
    monkeypatch.setattr("mcp_registry.store.REGISTRY_FILE", tmp_path / "registry.json")
    store = RegistryStore()
    return store


@pytest.fixture
def populated_store(tmp_registry):
    """Store with realistic servers and groups pre-loaded."""
    store = tmp_registry

    # Servers — mix of stdio, http, sse
    store.upsert_server("taskr", {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@anthropic/taskr-mcp"],
        "env": {"TASKR_API_KEY": "sk-test-123"},
        "source_scope": "user",
    })
    store.upsert_server("github", {
        "type": "http",
        "url": "https://mcp.github.com",
        "headers": {"Authorization": "Bearer ghp_test"},
        "source_scope": "user",
    })
    store.upsert_server("context7", {
        "type": "sse",
        "url": "https://context7.dev/sse",
        "source_scope": "user",
    })
    store.upsert_server("cerebro-mcp", {
        "type": "stdio",
        "command": "node",
        "args": ["dist/index.js"],
        "env": {"CEREBRO_DB": "/tmp/cerebro.db"},
        "source_scope": "user",
    })
    store.upsert_server("wrike", {
        "type": "stdio",
        "command": "node",
        "args": ["dist/index.js"],
        "env": {"WRIKE_TOKEN": "abc123"},
        "source_scope": "user",
    })

    # Groups
    store.create_group("__universal__", "Universal")  # already exists, noop
    store.assign("context7", "__universal__")

    return store


@pytest.fixture
def repo_tree(tmp_path):
    """Create a fake repo group directory with git repos."""
    group_dir = tmp_path / "repos-test"
    group_dir.mkdir()

    repos = []
    for name in ["alpha", "bravo", "charlie"]:
        repo = group_dir / name
        repo.mkdir()
        (repo / ".git").mkdir()  # fake git marker
        repos.append(str(repo))

    return str(group_dir), repos


@pytest.fixture
def store_with_group(populated_store, repo_tree):
    """Populated store + a group pointing at the fake repo tree."""
    group_path, repos = repo_tree
    populated_store.create_group("repos-test", "Test Repos", group_path)
    populated_store.assign("taskr", "repos-test")
    populated_store.assign("cerebro-mcp", "repos-test")
    return populated_store, group_path, repos


# ── Schema Constants ──────────────────────────────────────────────

# Valid keys per transport type, from official Claude Code docs
VALID_STDIO_KEYS = {"type", "command", "args", "env"}
VALID_HTTP_KEYS = {"type", "url", "headers", "oauth"}
VALID_SSE_KEYS = {"type", "url", "headers"}

VALID_KEYS_BY_TYPE = {
    "stdio": VALID_STDIO_KEYS,
    "http": VALID_HTTP_KEYS,
    "sse": VALID_SSE_KEYS,
    "streamable-http": VALID_HTTP_KEYS,
}

# Keys that must be present for a server to work
REQUIRED_KEYS_BY_TYPE = {
    "stdio": {"type", "command"},
    "http": {"type", "url"},
    "sse": {"type", "url"},
    "streamable-http": {"type", "url"},
}
