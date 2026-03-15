"""Server catalog management — schema, validation, auto-enrichment, completeness scoring."""

import ast
import json
import logging
import os
import re
import shutil
import subprocess
from pathlib import Path

logger = logging.getLogger("mcp_registry.catalog")

# ── Required fields and weights ──────────────────────────────────

REQUIRED_FIELDS = {
    "summary": 10,
    "maintainer": 5,
    "tool_count": 5,
    "recommended_scope": 5,
    "scope_rationale": 10,
    "risk_notes": 10,
}

DOCS_FIELDS = {
    "overview": 15,
    "tools": 15,
    "security_notes": 10,
    "data_sources": 5,
    "dependencies": 5,
    "architecture": 5,
}

INSTALL_FIELDS = {
    "code_repo": 5,
    "last_commit_date": 3,
    "binary": 2,
}

MAX_SCORE = sum(REQUIRED_FIELDS.values()) + sum(DOCS_FIELDS.values()) + sum(INSTALL_FIELDS.values())

VALID_SCOPES = {"global", "per-group", "per-project"}


def _has_value(val) -> bool:
    """Check whether a value is present and non-empty."""
    if val is None:
        return False
    if isinstance(val, str):
        return len(val.strip()) > 0
    if isinstance(val, (list, dict)):
        return len(val) > 0
    if isinstance(val, (int, float)):
        return True
    return bool(val)


# ── Completeness scoring ─────────────────────────────────────────

def compute_completeness(entry: dict) -> dict:
    """Compute completeness score for a catalog entry.

    Returns {"score": 0-100, "missing": [...], "grade": "A/B/C/D/F"}.
    """
    earned = 0
    missing = []

    # Required fields (top-level)
    for field, weight in REQUIRED_FIELDS.items():
        if _has_value(entry.get(field)):
            earned += weight
        else:
            missing.append(field)

    # Docs fields (nested under "docs")
    docs = entry.get("docs", {}) or {}
    for field, weight in DOCS_FIELDS.items():
        if _has_value(docs.get(field)):
            earned += weight
        else:
            missing.append(f"docs.{field}")

    # Install fields (nested under "installation")
    install = entry.get("installation", {}) or {}
    for field, weight in INSTALL_FIELDS.items():
        if _has_value(install.get(field)):
            earned += weight
        else:
            missing.append(f"installation.{field}")

    score = round((earned / MAX_SCORE) * 100) if MAX_SCORE > 0 else 0
    grade = _score_to_grade(score)

    return {"score": score, "missing": missing, "grade": grade}


def _score_to_grade(score: int) -> str:
    if score >= 90:
        return "A"
    elif score >= 75:
        return "B"
    elif score >= 50:
        return "C"
    elif score >= 30:
        return "D"
    else:
        return "F"


# ── Validation ───────────────────────────────────────────────────

def validate_entry(entry: dict) -> list[str]:
    """Validate a catalog entry. Returns list of validation errors."""
    errors = []

    if not _has_value(entry.get("summary")):
        errors.append("Missing required field: summary")

    if not _has_value(entry.get("maintainer")):
        errors.append("Missing required field: maintainer")

    scope = entry.get("recommended_scope")
    if scope and scope not in VALID_SCOPES:
        errors.append(f"Invalid recommended_scope: '{scope}' (must be one of {VALID_SCOPES})")

    tool_count = entry.get("tool_count")
    if tool_count is not None and not isinstance(tool_count, int):
        errors.append(f"tool_count must be an integer, got {type(tool_count).__name__}")

    if tool_count is not None and isinstance(tool_count, int) and tool_count < 0:
        errors.append("tool_count must be non-negative")

    return errors


# ── Auto-enrichment ──────────────────────────────────────────────

def auto_enrich(name: str, config: dict) -> dict:
    """Given server name and its claude.json config, inspect filesystem to fill in missing data.

    Returns a dict of fields to merge into the catalog entry.
    """
    enriched = {}

    command = config.get("command")
    if not command:
        return enriched

    # 1. Find binary via `which`
    binary_path = _find_binary(command)
    if binary_path:
        install = {}
        install["binary"] = binary_path

        # 2. Follow symlinks to real path
        real_path = _resolve_symlink(binary_path)
        if real_path and real_path != binary_path:
            install["binary_resolves_to"] = real_path

        # 3. Walk up to find .git repo
        code_path = real_path or binary_path
        repo_root = _find_git_repo(code_path)
        if repo_root:
            install["code_repo"] = repo_root

            # 4. Get last commit date
            commit_info = _get_last_commit(repo_root)
            if commit_info:
                install["last_commit_date"] = commit_info.get("date", "")
                install["last_commit_message"] = commit_info.get("message", "")

            # 5. Search for @mcp.tool decorated functions
            tools = _extract_mcp_tools(repo_root)
            if tools:
                enriched.setdefault("docs", {})["tools"] = tools
                enriched["tool_count"] = len(tools)

            # 6. Extract overview from README.md
            overview = _extract_readme_overview(repo_root)
            if overview:
                enriched.setdefault("docs", {})["overview"] = overview

            # 7. Extract dependencies
            deps = _extract_dependencies(repo_root)
            if deps:
                enriched.setdefault("docs", {})["dependencies"] = deps

        if install:
            enriched["installation"] = install

    return enriched


def enrich_all(catalog: dict, claude_json: dict) -> dict:
    """Run auto_enrich for every server in the catalog.

    Args:
        catalog: The full catalog dict (with "servers" key).
        claude_json: The parsed ~/.claude.json data.

    Returns:
        Updated catalog with enriched fields merged in.
    """
    mcp_servers = claude_json.get("mcpServers", {})
    servers = catalog.get("servers", {})
    enriched_count = 0

    for name in list(servers.keys()):
        config = mcp_servers.get(name, {})
        if not config:
            continue

        new_fields = auto_enrich(name, config)
        if new_fields:
            _deep_merge(servers[name], new_fields)
            enriched_count += 1

    catalog["servers"] = servers
    return catalog


def _deep_merge(base: dict, updates: dict) -> None:
    """Merge updates into base, only filling empty/missing fields."""
    for key, value in updates.items():
        if key not in base or not _has_value(base[key]):
            base[key] = value
        elif isinstance(base[key], dict) and isinstance(value, dict):
            _deep_merge(base[key], value)


# ── Filesystem helpers ───────────────────────────────────────────

def _find_binary(command: str) -> str | None:
    """Find binary path via `which`."""
    binary = shutil.which(command)
    if binary:
        return str(Path(binary).resolve()) if os.path.islink(binary) else binary
    return binary


def _resolve_symlink(path: str) -> str | None:
    """Follow symlinks to find the real path."""
    try:
        real = str(Path(path).resolve())
        return real
    except (OSError, ValueError):
        return None


def _find_git_repo(path: str) -> str | None:
    """Walk up from path to find a .git directory."""
    try:
        p = Path(path)
        # Start from parent if path is a file
        if p.is_file():
            p = p.parent
        for parent in [p] + list(p.parents):
            if (parent / ".git").exists():
                return str(parent)
    except (OSError, ValueError):
        pass
    return None


def _get_last_commit(repo_root: str) -> dict | None:
    """Get last commit date and message from a git repo."""
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%ci|||%s"],
            capture_output=True, text=True, timeout=5,
            cwd=repo_root,
        )
        if result.returncode == 0 and result.stdout.strip():
            parts = result.stdout.strip().split("|||", 1)
            return {
                "date": parts[0].strip(),
                "message": parts[1].strip() if len(parts) > 1 else "",
            }
    except (subprocess.TimeoutExpired, OSError) as e:
        logger.warning("Failed to get git log for %s: %s", repo_root, e)
    return None


def _extract_mcp_tools(repo_root: str) -> dict:
    """Search for @mcp.tool or @server.tool decorated functions and extract names + docstrings."""
    tools = {}
    repo = Path(repo_root)

    # Search Python files
    for py_file in repo.rglob("*.py"):
        # Skip common non-source dirs
        rel = str(py_file.relative_to(repo))
        if any(skip in rel for skip in ["node_modules", ".git", "__pycache__", ".venv", "venv"]):
            continue
        try:
            source = py_file.read_text(errors="ignore")
            if "@mcp.tool" not in source and "@server.tool" not in source and "@app.tool" not in source:
                continue
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    for decorator in node.decorator_list:
                        dec_str = ast.dump(decorator)
                        if "mcp" in dec_str or "server" in dec_str or "app" in dec_str:
                            if "tool" in dec_str:
                                docstring = ast.get_docstring(node) or ""
                                tools[node.name] = docstring.split("\n")[0] if docstring else ""
        except (SyntaxError, OSError, UnicodeDecodeError):
            continue

    return tools


def _extract_readme_overview(repo_root: str) -> str | None:
    """Extract the first paragraph from README.md."""
    readme = Path(repo_root) / "README.md"
    if not readme.exists():
        return None
    try:
        text = readme.read_text(errors="ignore")
        # Skip title lines (# heading)
        lines = text.split("\n")
        paragraph_lines = []
        in_paragraph = False
        for line in lines:
            stripped = line.strip()
            if not stripped:
                if in_paragraph:
                    break
                continue
            if stripped.startswith("#"):
                if in_paragraph:
                    break
                continue
            if stripped.startswith("![") or stripped.startswith("[!["):
                continue
            in_paragraph = True
            paragraph_lines.append(stripped)

        if paragraph_lines:
            overview = " ".join(paragraph_lines)
            # Truncate to reasonable length
            if len(overview) > 500:
                overview = overview[:497] + "..."
            return overview
    except OSError:
        pass
    return None


def _extract_dependencies(repo_root: str) -> list[str]:
    """Extract dependencies from requirements.txt or pyproject.toml."""
    deps = []
    repo = Path(repo_root)

    # Try requirements.txt
    req_file = repo / "requirements.txt"
    if req_file.exists():
        try:
            for line in req_file.read_text(errors="ignore").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and not line.startswith("-"):
                    # Strip version specifiers for readability
                    pkg = re.split(r"[>=<!\[]", line)[0].strip()
                    if pkg:
                        deps.append(pkg)
        except OSError:
            pass

    # Try pyproject.toml (simple extraction)
    if not deps:
        pyproject = repo / "pyproject.toml"
        if pyproject.exists():
            try:
                text = pyproject.read_text(errors="ignore")
                # Find [project.dependencies] or dependencies = [...]
                in_deps = False
                for line in text.splitlines():
                    if "dependencies" in line and "=" in line:
                        in_deps = True
                        continue
                    if in_deps:
                        if line.strip().startswith("]"):
                            break
                        match = re.search(r'"([^"]+)"', line)
                        if match:
                            pkg = re.split(r"[>=<!\[]", match.group(1))[0].strip()
                            if pkg:
                                deps.append(pkg)
            except OSError:
                pass

    # Try package.json for Node projects
    if not deps:
        pkg_json = repo / "package.json"
        if pkg_json.exists():
            try:
                data = json.loads(pkg_json.read_text(errors="ignore"))
                for key in ("dependencies", "peerDependencies"):
                    if key in data:
                        deps.extend(data[key].keys())
            except (json.JSONDecodeError, OSError):
                pass

    return deps[:30]  # Cap at 30
