"""Secrets masking tests — ${VAR} references in deployed .mcp.json."""

import json
from pathlib import Path

import pytest

from mcp_registry.deployer import _build_server_entry, _build_mcp_json, preview, deploy


class TestSecretsMasking:

    def test_mask_api_key(self):
        srv = {"type": "stdio", "command": "echo", "env": {"API_KEY": "sk-123"}}
        entry = _build_server_entry(srv, mask_secrets=True)
        assert entry["env"]["API_KEY"] == "${API_KEY}"

    def test_mask_token(self):
        srv = {"type": "stdio", "command": "echo", "env": {"WRIKE_TOKEN": "abc"}}
        entry = _build_server_entry(srv, mask_secrets=True)
        assert entry["env"]["WRIKE_TOKEN"] == "${WRIKE_TOKEN}"

    def test_no_mask_safe_vars(self):
        srv = {"type": "stdio", "command": "echo", "env": {"NODE_ENV": "prod", "PORT": "3000"}}
        entry = _build_server_entry(srv, mask_secrets=True)
        assert entry["env"]["NODE_ENV"] == "prod"
        assert entry["env"]["PORT"] == "3000"

    def test_no_mask_without_flag(self):
        srv = {"type": "stdio", "command": "echo", "env": {"API_KEY": "sk-123"}}
        entry = _build_server_entry(srv, mask_secrets=False)
        assert entry["env"]["API_KEY"] == "sk-123"

    def test_default_no_mask(self):
        srv = {"type": "stdio", "command": "echo", "env": {"API_KEY": "sk-123"}}
        entry = _build_server_entry(srv)
        assert entry["env"]["API_KEY"] == "sk-123"

    def test_build_mcp_json_masks_when_requested(self):
        servers = {
            "taskr": {
                "type": "stdio",
                "command": "npx",
                "env": {"TASKR_API_KEY": "sk-test"},
            }
        }
        result = _build_mcp_json(["taskr"], servers, mask_secrets=True)
        assert result["mcpServers"]["taskr"]["env"]["TASKR_API_KEY"] == "${TASKR_API_KEY}"

    def test_preview_masks_secrets(self, store_with_group):
        store, group_path, repos = store_with_group
        changes = preview(store)
        for change in changes.values():
            content = change["content"]
            # taskr has TASKR_API_KEY which should be masked
            if "taskr" in content.get("mcpServers", {}):
                taskr_env = content["mcpServers"]["taskr"].get("env", {})
                if "TASKR_API_KEY" in taskr_env:
                    assert taskr_env["TASKR_API_KEY"] == "${TASKR_API_KEY}"

    def test_deploy_masks_secrets(self, store_with_group):
        store, group_path, repos = store_with_group
        deploy(store, only_groups=["repos-test"])

        mcp_path = Path(repos[0]) / ".mcp.json"
        data = json.loads(mcp_path.read_text())
        # taskr has TASKR_API_KEY
        if "taskr" in data["mcpServers"]:
            taskr_env = data["mcpServers"]["taskr"].get("env", {})
            if "TASKR_API_KEY" in taskr_env:
                assert taskr_env["TASKR_API_KEY"] == "${TASKR_API_KEY}"

    def test_mixed_env_partial_masking(self):
        srv = {
            "type": "stdio", "command": "echo",
            "env": {"API_KEY": "secret", "NODE_ENV": "prod", "DB_PASSWORD": "hunter2"}
        }
        entry = _build_server_entry(srv, mask_secrets=True)
        assert entry["env"]["API_KEY"] == "${API_KEY}"
        assert entry["env"]["NODE_ENV"] == "prod"
        assert entry["env"]["DB_PASSWORD"] == "${DB_PASSWORD}"
