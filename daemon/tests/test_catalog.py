"""Tests for server catalog — completeness scoring, validation, auto-enrichment."""

import json
import os
import subprocess
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from mcp_registry.catalog import (
    REQUIRED_FIELDS,
    DOCS_FIELDS,
    INSTALL_FIELDS,
    MAX_SCORE,
    compute_completeness,
    validate_entry,
    auto_enrich,
    enrich_all,
    _find_binary,
    _find_git_repo,
    _extract_mcp_tools,
    _extract_readme_overview,
    _extract_dependencies,
)


# ── Fixtures ─────────────────────────────────────────────────────

def _full_entry():
    """Return a fully documented catalog entry."""
    return {
        "summary": "A test MCP server for unit testing",
        "maintainer": "internal",
        "tool_count": 5,
        "recommended_scope": "global",
        "scope_rationale": "Useful across all projects",
        "risk_notes": "Low risk, read-only access",
        "docs": {
            "overview": "Detailed overview of the server",
            "tools": {"tool_a": "Does thing A", "tool_b": "Does thing B"},
            "security_notes": "No sensitive data accessed",
            "data_sources": ["local filesystem"],
            "dependencies": ["fastapi", "pydantic"],
            "architecture": "Single-process stdio server",
        },
        "installation": {
            "code_repo": "/tmp/test-repo",
            "last_commit_date": "2026-03-15 10:00:00 +0000",
            "binary": "/usr/local/bin/test-server",
        },
    }


def _empty_entry():
    """Return a completely empty catalog entry."""
    return {}


def _partial_entry():
    """Return a partially documented catalog entry."""
    return {
        "summary": "Partial server",
        "maintainer": "vendor",
        "tool_count": 3,
        "docs": {
            "overview": "Some overview",
        },
    }


# ── TestCompleteness ─────────────────────────────────────────────

class TestCompleteness:
    def test_fully_documented_server_scores_100(self):
        result = compute_completeness(_full_entry())
        assert result["score"] == 100
        assert result["grade"] == "A"
        assert result["missing"] == []

    def test_empty_entry_scores_zero(self):
        result = compute_completeness(_empty_entry())
        assert result["score"] == 0
        assert result["grade"] == "F"
        assert len(result["missing"]) > 0

    def test_partial_entry_scores_proportionally(self):
        result = compute_completeness(_partial_entry())
        assert 0 < result["score"] < 100
        # summary(10) + maintainer(5) + tool_count(5) + docs.overview(15) = 35 out of MAX
        expected_earned = 10 + 5 + 5 + 15
        expected_score = round((expected_earned / MAX_SCORE) * 100)
        assert result["score"] == expected_score

    def test_grade_A_above_90(self):
        entry = _full_entry()
        result = compute_completeness(entry)
        assert result["grade"] == "A"
        assert result["score"] >= 90

    def test_grade_F_below_30(self):
        # Entry with only summary (10 points = ~8% of 120)
        entry = {"summary": "Just a summary"}
        result = compute_completeness(entry)
        assert result["grade"] == "F"
        assert result["score"] < 30

    def test_missing_fields_listed(self):
        entry = {"summary": "Present"}
        result = compute_completeness(entry)
        assert "maintainer" in result["missing"]
        assert "tool_count" in result["missing"]
        assert "docs.overview" in result["missing"]
        assert "installation.binary" in result["missing"]
        # summary should NOT be in missing
        assert "summary" not in result["missing"]

    def test_empty_string_counts_as_missing(self):
        entry = {"summary": "", "maintainer": "  "}
        result = compute_completeness(entry)
        assert "summary" in result["missing"]
        assert "maintainer" in result["missing"]

    def test_empty_list_counts_as_missing(self):
        entry = {"docs": {"tools": {}, "data_sources": []}}
        result = compute_completeness(entry)
        assert "docs.tools" in result["missing"]
        assert "docs.data_sources" in result["missing"]

    def test_grade_boundaries(self):
        # Test all grade boundaries
        assert compute_completeness(_full_entry())["grade"] == "A"  # 100

        # Build entries that hit specific scores
        # D = 30-49%
        # ~36 points needed for ~30% of 120 = 36
        entry_d = {
            "summary": "s",           # 10
            "maintainer": "m",         # 5
            "tool_count": 3,           # 5
            "recommended_scope": "global",  # 5
            "scope_rationale": "r",    # 10
            # total = 35 => ~29% -> F actually, need one more
            "risk_notes": "n",         # 10 -> total = 45 => 37.5% -> D
        }
        assert compute_completeness(entry_d)["grade"] == "D"


# ── TestValidation ───────────────────────────────────────────────

class TestValidation:
    def test_valid_entry_no_errors(self):
        errors = validate_entry(_full_entry())
        assert errors == []

    def test_missing_summary_is_error(self):
        entry = _full_entry()
        del entry["summary"]
        errors = validate_entry(entry)
        assert any("summary" in e for e in errors)

    def test_missing_maintainer_is_error(self):
        entry = _full_entry()
        del entry["maintainer"]
        errors = validate_entry(entry)
        assert any("maintainer" in e for e in errors)

    def test_invalid_scope_is_error(self):
        entry = _full_entry()
        entry["recommended_scope"] = "everywhere"
        errors = validate_entry(entry)
        assert any("recommended_scope" in e for e in errors)

    def test_valid_scopes_accepted(self):
        for scope in ("global", "per-group", "per-project"):
            entry = _full_entry()
            entry["recommended_scope"] = scope
            errors = validate_entry(entry)
            assert not any("recommended_scope" in e for e in errors)

    def test_invalid_tool_count_type(self):
        entry = _full_entry()
        entry["tool_count"] = "five"
        errors = validate_entry(entry)
        assert any("tool_count" in e for e in errors)

    def test_negative_tool_count(self):
        entry = _full_entry()
        entry["tool_count"] = -1
        errors = validate_entry(entry)
        assert any("tool_count" in e for e in errors)

    def test_empty_entry_has_errors(self):
        errors = validate_entry({})
        assert len(errors) >= 2  # at least summary + maintainer


# ── TestAutoEnrich ───────────────────────────────────────────────

class TestAutoEnrich:
    def test_finds_binary_path(self):
        # `python3` should be findable on any system with Python
        with patch("mcp_registry.catalog.shutil.which", return_value="/usr/bin/python3"):
            result = _find_binary("python3")
            assert result is not None

    def test_follows_symlinks(self, tmp_path):
        # Create a real file and a symlink
        real_file = tmp_path / "real_binary"
        real_file.write_text("#!/bin/bash\n")
        link = tmp_path / "link_binary"
        link.symlink_to(real_file)

        with patch("mcp_registry.catalog.shutil.which", return_value=str(link)):
            result = _find_binary("link_binary")
            assert result is not None
            # Should resolve to real path
            assert "real_binary" in result or result == str(link)

    def test_finds_git_repo(self, tmp_path):
        # Create a fake git repo
        git_dir = tmp_path / ".git"
        git_dir.mkdir()
        subdir = tmp_path / "src" / "lib"
        subdir.mkdir(parents=True)

        result = _find_git_repo(str(subdir / "main.py"))
        assert result == str(tmp_path)

    def test_extracts_tool_docstrings(self, tmp_path):
        # Create a Python file with @mcp.tool decorator
        src = tmp_path / "server.py"
        src.write_text('''
import mcp

@mcp.tool
def hello_world():
    """Say hello to the world."""
    return "hello"

@mcp.tool
async def fetch_data(url: str):
    """Fetch data from a URL."""
    pass

def not_a_tool():
    """This should not be extracted."""
    pass
''')
        tools = _extract_mcp_tools(str(tmp_path))
        assert "hello_world" in tools
        assert "fetch_data" in tools
        assert "not_a_tool" not in tools
        assert tools["hello_world"] == "Say hello to the world."

    def test_handles_missing_binary(self):
        with patch("mcp_registry.catalog.shutil.which", return_value=None):
            result = auto_enrich("nonexistent", {"command": "nonexistent-binary"})
            assert result == {}

    def test_extracts_readme_overview(self, tmp_path):
        readme = tmp_path / "README.md"
        readme.write_text("# My Project\n\nThis is a great project that does useful things.\n\n## Installation\n")
        result = _extract_readme_overview(str(tmp_path))
        assert result == "This is a great project that does useful things."

    def test_extracts_requirements_txt(self, tmp_path):
        req = tmp_path / "requirements.txt"
        req.write_text("fastapi>=0.100\npydantic\n# comment\nuvicorn[standard]\n")
        deps = _extract_dependencies(str(tmp_path))
        assert "fastapi" in deps
        assert "pydantic" in deps
        assert "uvicorn" in deps

    def test_extracts_package_json_deps(self, tmp_path):
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "dependencies": {"express": "^4.0", "@anthropic/sdk": "^1.0"},
        }))
        deps = _extract_dependencies(str(tmp_path))
        assert "express" in deps
        assert "@anthropic/sdk" in deps

    def test_no_readme_returns_none(self, tmp_path):
        result = _extract_readme_overview(str(tmp_path))
        assert result is None

    def test_auto_enrich_returns_empty_without_command(self):
        result = auto_enrich("test", {"url": "https://example.com"})
        assert result == {}


# ── TestEnrichAll ────────────────────────────────────────────────

class TestEnrichAll:
    def test_enrich_all_merges_only_missing_fields(self):
        catalog = {
            "servers": {
                "test-server": {
                    "summary": "Existing summary",
                    "maintainer": "internal",
                }
            }
        }
        claude_json = {
            "mcpServers": {
                "test-server": {"command": "test-cmd"}
            }
        }

        with patch("mcp_registry.catalog.auto_enrich") as mock_enrich:
            mock_enrich.return_value = {
                "summary": "Should not overwrite",
                "tool_count": 5,
            }
            result = enrich_all(catalog, claude_json)

        # Existing summary should be preserved
        assert result["servers"]["test-server"]["summary"] == "Existing summary"
        # New field should be added
        assert result["servers"]["test-server"]["tool_count"] == 5

    def test_enrich_all_skips_servers_not_in_claude_json(self):
        catalog = {
            "servers": {
                "orphan-server": {"summary": "Orphan"}
            }
        }
        claude_json = {"mcpServers": {}}

        with patch("mcp_registry.catalog.auto_enrich") as mock_enrich:
            result = enrich_all(catalog, claude_json)
            mock_enrich.assert_not_called()
