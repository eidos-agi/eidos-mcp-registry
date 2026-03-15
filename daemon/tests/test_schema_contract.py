"""
Layer 1 — Schema Contract Tests

Core invariant: every .mcp.json we produce must be valid for Claude Code.
If these tests fail, we'd break MCP tool discovery for every repo we deploy to.
"""

import json

import pytest

from mcp_registry.deployer import _build_mcp_json, _has_secrets
from tests.conftest import VALID_KEYS_BY_TYPE, REQUIRED_KEYS_BY_TYPE


# ── Schema Validity ───────────────────────────────────────────────


class TestMcpJsonSchema:
    """Every .mcp.json entry must only contain keys Claude Code understands."""

    def test_stdio_server_has_valid_keys(self):
        servers = {
            "taskr": {
                "type": "stdio",
                "command": "npx",
                "args": ["-y", "@anthropic/taskr-mcp"],
                "env": {"TASKR_API_KEY": "sk-test"},
                "name": "taskr",  # internal, should not appear in output
                "source_scope": "user",  # internal
                "health": "connected",  # internal
            }
        }
        result = _build_mcp_json(["taskr"], servers)
        entry = result["mcpServers"]["taskr"]

        # Only valid Claude Code keys
        invalid = set(entry.keys()) - VALID_KEYS_BY_TYPE["stdio"]
        assert not invalid, f"Invalid keys in stdio entry: {invalid}"

        # Required keys present
        missing = REQUIRED_KEYS_BY_TYPE["stdio"] - set(entry.keys())
        assert not missing, f"Missing required keys: {missing}"

    def test_http_server_has_valid_keys(self):
        servers = {
            "github": {
                "type": "http",
                "url": "https://mcp.github.com",
                "headers": {"Authorization": "Bearer ghp_xxx"},
                "name": "github",
                "source_scope": "user",
            }
        }
        result = _build_mcp_json(["github"], servers)
        entry = result["mcpServers"]["github"]

        invalid = set(entry.keys()) - VALID_KEYS_BY_TYPE["http"]
        assert not invalid, f"Invalid keys in http entry: {invalid}"

        missing = REQUIRED_KEYS_BY_TYPE["http"] - set(entry.keys())
        assert not missing, f"Missing required keys: {missing}"

    def test_sse_server_has_valid_keys(self):
        servers = {
            "context7": {
                "type": "sse",
                "url": "https://context7.dev/sse",
                "name": "context7",
                "source_scope": "user",
            }
        }
        result = _build_mcp_json(["context7"], servers)
        entry = result["mcpServers"]["context7"]

        invalid = set(entry.keys()) - VALID_KEYS_BY_TYPE["sse"]
        assert not invalid, f"Invalid keys in sse entry: {invalid}"

        missing = REQUIRED_KEYS_BY_TYPE["sse"] - set(entry.keys())
        assert not missing, f"Missing required keys: {missing}"

    def test_internal_fields_never_leak(self):
        """name, source_scope, health, health_ts must NEVER appear in .mcp.json."""
        internal_fields = {"name", "source_scope", "health", "health_ts", "_missing"}
        servers = {
            "test": {
                "type": "stdio",
                "command": "echo",
                "args": ["hello"],
                "name": "test",
                "source_scope": "user",
                "health": "connected",
                "health_ts": 1234567890.0,
                "_missing": True,
            }
        }
        result = _build_mcp_json(["test"], servers)
        entry = result["mcpServers"]["test"]

        leaked = internal_fields & set(entry.keys())
        assert not leaked, f"Internal fields leaked into .mcp.json: {leaked}"

    def test_output_is_valid_json(self):
        """Round-trip: build → serialize → parse → compare."""
        servers = {
            "taskr": {"type": "stdio", "command": "npx", "args": ["-y", "taskr"]},
            "github": {"type": "http", "url": "https://mcp.github.com"},
        }
        result = _build_mcp_json(["taskr", "github"], servers)

        # Must be JSON-serializable
        serialized = json.dumps(result, indent=2)
        parsed = json.loads(serialized)
        assert parsed == result

    def test_top_level_key_is_mcpServers(self):
        """Claude Code expects exactly {"mcpServers": {...}} at top level."""
        result = _build_mcp_json([], {})
        assert list(result.keys()) == ["mcpServers"]

    def test_empty_server_list_produces_empty_mcpServers(self):
        result = _build_mcp_json([], {})
        assert result == {"mcpServers": {}}

    def test_missing_server_name_produces_empty_entry(self):
        """If server name isn't in all_servers, entry should be empty dict."""
        result = _build_mcp_json(["nonexistent"], {})
        assert result == {"mcpServers": {"nonexistent": {}}}


# ── Golden File Tests ─────────────────────────────────────────────


class TestGoldenFiles:
    """Known inputs → exact expected outputs. Catches any drift in format."""

    def test_stdio_golden(self):
        servers = {
            "cerebro-mcp": {
                "type": "stdio",
                "command": "node",
                "args": ["dist/index.js"],
                "env": {"CEREBRO_DB": "/tmp/cerebro.db"},
                "name": "cerebro-mcp",
                "source_scope": "user",
                "health": "connected",
            }
        }
        result = _build_mcp_json(["cerebro-mcp"], servers)
        expected = {
            "mcpServers": {
                "cerebro-mcp": {
                    "type": "stdio",
                    "command": "node",
                    "args": ["dist/index.js"],
                    "env": {"CEREBRO_DB": "/tmp/cerebro.db"},
                }
            }
        }
        assert result == expected

    def test_http_golden(self):
        servers = {
            "github": {
                "type": "http",
                "url": "https://mcp.github.com",
                "headers": {"Authorization": "Bearer ghp_xxx"},
                "name": "github",
                "source_scope": "user",
            }
        }
        result = _build_mcp_json(["github"], servers)
        expected = {
            "mcpServers": {
                "github": {
                    "type": "http",
                    "url": "https://mcp.github.com",
                    "headers": {"Authorization": "Bearer ghp_xxx"},
                }
            }
        }
        assert result == expected

    def test_multi_server_golden(self):
        """Multiple servers in one .mcp.json — order preserved."""
        servers = {
            "taskr": {"type": "stdio", "command": "npx", "args": ["-y", "taskr"]},
            "context7": {"type": "sse", "url": "https://context7.dev/sse"},
        }
        result = _build_mcp_json(["taskr", "context7"], servers)
        assert set(result["mcpServers"].keys()) == {"taskr", "context7"}
        assert result["mcpServers"]["taskr"]["type"] == "stdio"
        assert result["mcpServers"]["context7"]["type"] == "sse"


# ── Secret Detection ──────────────────────────────────────────────


class TestSecretDetection:
    """_has_secrets must catch all common secret patterns."""

    def test_catches_api_key(self):
        assert _has_secrets({"TASKR_API_KEY": "sk-123"}) == ["TASKR_API_KEY"]

    def test_catches_token(self):
        assert _has_secrets({"WRIKE_TOKEN": "abc"}) == ["WRIKE_TOKEN"]

    def test_catches_secret(self):
        assert _has_secrets({"CLIENT_SECRET": "xxx"}) == ["CLIENT_SECRET"]

    def test_catches_password(self):
        assert _has_secrets({"DB_PASSWORD": "hunter2"}) == ["DB_PASSWORD"]

    def test_catches_credential(self):
        assert _has_secrets({"GOOGLE_CREDENTIAL": "..."}) == ["GOOGLE_CREDENTIAL"]

    def test_catches_auth(self):
        assert _has_secrets({"OAUTH_AUTH_CODE": "..."}) == ["OAUTH_AUTH_CODE"]

    def test_ignores_safe_vars(self):
        assert _has_secrets({"NODE_ENV": "production", "PORT": "3000"}) == []

    def test_case_insensitive(self):
        assert _has_secrets({"api_key": "x"}) == ["api_key"]
        assert _has_secrets({"Api_Key": "x"}) == ["Api_Key"]

    def test_empty_env(self):
        assert _has_secrets({}) == []

    def test_multiple_secrets(self):
        env = {"API_KEY": "x", "SECRET": "y", "PORT": "3000"}
        result = _has_secrets(env)
        assert "API_KEY" in result
        assert "SECRET" in result
        assert "PORT" not in result
