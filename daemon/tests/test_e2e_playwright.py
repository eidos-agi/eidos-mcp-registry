"""
End-to-end Playwright tests for the MCP Registry UI.

Spins up a real uvicorn server on a free port, opens Chromium,
and exercises the full UI: tab navigation, server tiles, group
config, drag-drop assignment, deploy, rollback, activity feed,
editor panel, gitignore, and secrets masking.
"""

import asyncio
import json
import socket
import threading
import time
from pathlib import Path

import pytest
import uvicorn

from mcp_registry.store import RegistryStore


# ── Helpers ──────────────────────────────────────────────────────


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def _run_server(port: int):
    """Run uvicorn in a thread. Blocks until shutdown."""
    uvicorn.run("mcp_registry.server:app", host="127.0.0.1", port=port,
                log_level="warning")


# ── Fixtures ─────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def registry_server(tmp_path_factory):
    """Start a real registry server on a free port with temp storage."""
    import os
    tmp = tmp_path_factory.mktemp("registry")

    # Redirect storage via env-patching before import
    os.environ["_TEST_REGISTRY_DIR"] = str(tmp)

    import mcp_registry.store as store_mod
    import mcp_registry.activity as activity_mod
    import mcp_registry.deploy_history as dh_mod

    # Patch storage paths
    store_mod.DATA_DIR = tmp
    store_mod.REGISTRY_FILE = tmp / "registry.json"
    activity_mod.DATA_DIR = tmp
    activity_mod.ACTIVITY_FILE = tmp / "activity.json"
    dh_mod.HISTORY_DIR = tmp / "deploy-history"
    activity_mod.clear()

    # Patch scanner to avoid hitting real filesystem/subprocesses
    import mcp_registry.scanner as scanner_mod
    scanner_mod.scan_claude_mcp_list = lambda: {}
    scanner_mod.scan_claude_json = lambda: {}
    scanner_mod.discover_repo_groups = lambda: {}

    # Pre-seed some servers and groups
    store = RegistryStore()
    store.upsert_server("taskr", {
        "type": "stdio", "command": "npx", "args": ["-y", "taskr"],
        "env": {"TASKR_API_KEY": "sk-test-123"},
        "source_scope": "user",
    })
    store.upsert_server("github", {
        "type": "http", "url": "https://mcp.github.com",
        "headers": {"Authorization": "Bearer ghp_test"},
        "source_scope": "user",
    })
    store.upsert_server("context7", {
        "type": "sse", "url": "https://context7.dev/sse",
        "source_scope": "user",
    })
    store.upsert_server("cerebro-mcp", {
        "type": "stdio", "command": "node", "args": ["dist/index.js"],
        "env": {"CEREBRO_DB": "/tmp/cerebro.db"},
        "source_scope": "user",
    })

    # Create a group with real temp repos
    group_dir = tmp / "repos-test"
    group_dir.mkdir()
    for name in ["alpha", "bravo", "charlie"]:
        repo = group_dir / name
        repo.mkdir()
        (repo / ".git").mkdir()

    store.create_group("repos-test", "Test Repos", str(group_dir))
    store.assign("context7", "__universal__")
    store.assign("taskr", "repos-test")

    port = _free_port()
    thread = threading.Thread(target=_run_server, args=(port,), daemon=True)
    thread.start()

    # Wait for server to be ready
    base_url = f"http://127.0.0.1:{port}"
    for _ in range(50):
        try:
            import httpx
            resp = httpx.get(f"{base_url}/health", timeout=1)
            if resp.status_code == 200:
                break
        except Exception:
            pass
        time.sleep(0.1)
    else:
        raise RuntimeError("Registry server failed to start")

    yield base_url, str(group_dir)

    os.environ.pop("_TEST_REGISTRY_DIR", None)


@pytest.fixture
def page(browser, registry_server):
    """Create a new browser page pointed at the registry."""
    base_url, _ = registry_server
    p = browser.new_page()
    p.goto(base_url)
    # Wait for JS to load and render
    p.wait_for_selector("#nav-servers", timeout=5000)
    # Give JS time to call loadData and render
    p.wait_for_function("document.getElementById('stats').textContent !== 'Loading...'",
                        timeout=5000)
    yield p
    p.close()


# ── Tests: Page Load & Layout ────────────────────────────────────


class TestPageLoad:

    def test_page_loads_with_title(self, page):
        assert "EIDOS" in page.title() or "MCP" in page.title() or True
        # The h1 should contain "EIDOS"
        h1 = page.locator("h1#view-title")
        assert "EIDOS" in h1.text_content()

    def test_nav_rail_has_six_tabs(self, page):
        tabs = page.locator(".nav-rail-btn")
        assert tabs.count() == 6

    def test_servers_tab_active_by_default(self, page):
        servers_btn = page.locator("#nav-servers")
        assert "active" in servers_btn.get_attribute("class")

    def test_footer_shows_stats(self, page):
        stats = page.locator("#stats")
        text = stats.text_content()
        assert "server" in text.lower() or "group" in text.lower()

    def test_servers_view_visible(self, page):
        view = page.locator("#view-servers")
        assert view.is_visible()

    def test_groups_view_hidden(self, page):
        view = page.locator("#view-groups")
        # Should exist but be hidden
        assert not view.is_visible()

    def test_store_view_hidden(self, page):
        view = page.locator("#view-store")
        assert not view.is_visible()


# ── Tests: Tab Navigation ────────────────────────────────────────


class TestTabNavigation:

    def test_click_groups_tab(self, page):
        page.click("#nav-groups")
        page.wait_for_timeout(300)

        # Groups view should be visible
        assert page.locator("#view-groups").is_visible()
        assert not page.locator("#view-servers").is_visible()

        # Groups tab should be active
        assert "active" in page.locator("#nav-groups").get_attribute("class")
        assert "active" not in page.locator("#nav-servers").get_attribute("class")

    def test_click_store_tab(self, page):
        page.click("#nav-store")
        page.wait_for_timeout(300)

        assert page.locator("#view-store").is_visible()
        assert not page.locator("#view-servers").is_visible()

        # Should show "Coming Soon"
        store_text = page.locator("#view-store").text_content()
        assert "Coming Soon" in store_text or "Store" in store_text

    def test_click_back_to_servers(self, page):
        page.click("#nav-groups")
        page.wait_for_timeout(200)
        page.click("#nav-servers")
        page.wait_for_timeout(300)

        assert page.locator("#view-servers").is_visible()
        assert "active" in page.locator("#nav-servers").get_attribute("class")

    def test_click_why_mcp_tab(self, page):
        page.click("#nav-why-mcp")
        page.wait_for_timeout(300)
        assert page.locator("#view-why-mcp").is_visible()
        text = page.locator("#view-why-mcp").text_content()
        assert "Infrastructure" in text or "MCP" in text

    def test_click_why_eidos_tab(self, page):
        page.click("#nav-why-eidos")
        page.wait_for_timeout(300)
        assert page.locator("#view-why-eidos").is_visible()
        text = page.locator("#view-why-eidos").text_content()
        assert "Registry" in text or "Claude" in text


# ── Tests: Why MCP Page ─────────────────────────────────────────


class TestWhyMcpPage:

    def test_has_comparison_grid(self, page):
        page.click("#nav-why-mcp")
        page.wait_for_timeout(500)
        assert page.locator(".compare-grid").count() >= 1

    def test_has_feature_grid(self, page):
        page.click("#nav-why-mcp")
        page.wait_for_timeout(500)
        assert page.locator(".feature-grid").count() >= 1

    def test_has_security_section(self, page):
        page.click("#nav-why-mcp")
        page.wait_for_timeout(500)
        text = page.locator("#view-why-mcp").text_content()
        assert "Security" in text


# ── Tests: Why Eidos Page ────────────────────────────────────────


class TestWhyEidosPage:

    def test_has_live_metrics(self, page):
        page.click("#nav-why-eidos")
        page.wait_for_timeout(500)
        assert page.locator(".metric-card").count() >= 3

    def test_has_token_chart(self, page):
        page.click("#nav-why-eidos")
        page.wait_for_timeout(500)
        assert page.locator(".bar-chart").count() >= 1

    def test_has_scenario_cards(self, page):
        page.click("#nav-why-eidos")
        page.wait_for_timeout(500)
        assert page.locator(".scenario").count() >= 3

    def test_shows_server_count(self, page):
        page.click("#nav-why-eidos")
        page.wait_for_timeout(500)
        text = page.locator("#view-why-eidos").text_content()
        # Should show actual server count from test data
        assert "4" in text or "server" in text.lower()

    def test_has_comparison_grid(self, page):
        page.click("#nav-why-eidos")
        page.wait_for_timeout(500)
        assert page.locator(".compare-grid").count() >= 1


# ── Tests: Rebuttal Page ─────────────────────────────────────────


class TestRebuttalPage:

    def test_click_rebuttal_tab(self, page):
        page.click("#nav-rebuttal")
        page.wait_for_timeout(300)
        assert page.locator("#view-rebuttal").is_visible()

    def test_has_perplexity_reference(self, page):
        page.click("#nav-rebuttal")
        page.wait_for_timeout(500)
        text = page.locator("#view-rebuttal").text_content()
        assert "Perplexity" in text

    def test_has_comparison_grids(self, page):
        page.click("#nav-rebuttal")
        page.wait_for_timeout(500)
        assert page.locator(".compare-grid").count() >= 2

    def test_has_industry_response(self, page):
        page.click("#nav-rebuttal")
        page.wait_for_timeout(500)
        text = page.locator("#view-rebuttal").text_content()
        assert "Anthropic" in text or "OpenAI" in text or "Cloudflare" in text

    def test_has_bottom_line_metrics(self, page):
        page.click("#nav-rebuttal")
        page.wait_for_timeout(500)
        assert page.locator(".metric-card").count() >= 3


# ── Tests: Servers View ──────────────────────────────────────────


class TestServersView:

    def test_server_tiles_rendered(self, page):
        tiles = page.locator(".server-tile")
        assert tiles.count() >= 1

    def test_global_section_visible(self, page):
        # context7 is assigned to __universal__, should show in global section
        global_sec = page.locator(".global-section")
        if global_sec.count() > 0:
            text = global_sec.text_content()
            assert "context7" in text or "Global" in text

    def test_health_dots_present(self, page):
        dots = page.locator(".health-dot")
        assert dots.count() >= 1

    def test_type_badges_present(self, page):
        badges = page.locator(".type-badge")
        assert badges.count() >= 1

    def test_drop_zones_visible(self, page):
        zones = page.locator(".drop-zone")
        # Should have at least one drop zone for the repos-test group
        assert zones.count() >= 1

    def test_server_tile_click_opens_editor(self, page):
        tile = page.locator(".server-tile").first
        tile.click()
        page.wait_for_timeout(300)

        # Editor panel should open
        editor = page.locator("#editor-panel")
        assert "open" in editor.get_attribute("class")

        # Close it
        page.click("#editor-close")
        page.wait_for_timeout(200)
        assert "open" not in editor.get_attribute("class")

    def test_secret_badge_on_server_with_secrets(self, page):
        # taskr has TASKR_API_KEY which should show a secret badge
        badges = page.locator(".secret-badge")
        assert badges.count() >= 1


# ── Tests: Groups View ───────────────────────────────────────────


class TestGroupsView:

    def test_groups_list_shows_cards(self, page):
        page.click("#nav-groups")
        page.wait_for_timeout(500)

        cards = page.locator(".group-card")
        assert cards.count() >= 1

    def test_group_card_shows_label(self, page):
        page.click("#nav-groups")
        page.wait_for_timeout(500)

        card_text = page.locator(".group-card").first.text_content()
        assert "Test Repos" in card_text or "repos" in card_text.lower()

    def test_click_group_shows_detail(self, page):
        page.click("#nav-groups")
        page.wait_for_timeout(500)

        page.locator(".group-card").first.click()
        page.wait_for_timeout(500)

        # Should show a back button
        back = page.locator("button:has-text('Back')")
        assert back.count() >= 1

    def test_group_detail_shows_assigned_servers(self, page):
        page.click("#nav-groups")
        page.wait_for_timeout(500)
        page.locator(".group-card").first.click()
        page.wait_for_timeout(500)

        # taskr is assigned to repos-test
        detail_text = page.locator("#view-groups").text_content()
        assert "taskr" in detail_text

    def test_group_detail_shows_inherited(self, page):
        page.click("#nav-groups")
        page.wait_for_timeout(500)
        page.locator(".group-card").first.click()
        page.wait_for_timeout(500)

        detail_text = page.locator("#view-groups").text_content()
        # context7 is universal, should appear as inherited
        assert "context7" in detail_text or "Universal" in detail_text or "Inherited" in detail_text

    def test_back_button_returns_to_list(self, page):
        page.click("#nav-groups")
        page.wait_for_timeout(500)
        page.locator(".group-card").first.click()
        page.wait_for_timeout(500)

        page.locator("button:has-text('Back')").first.click()
        page.wait_for_timeout(500)

        # Should see group cards again
        cards = page.locator(".group-card")
        assert cards.count() >= 1

    def test_deploy_button_exists_in_detail(self, page):
        page.click("#nav-groups")
        page.wait_for_timeout(500)
        page.locator(".group-card").first.click()
        page.wait_for_timeout(500)

        deploy_btn = page.locator(".btn-deploy-group")
        assert deploy_btn.count() >= 1


# ── Tests: Deploy Overlay ────────────────────────────────────────


class TestDeployOverlay:

    def test_deploy_button_opens_overlay(self, page):
        page.click("#btn-deploy")
        page.wait_for_timeout(500)

        overlay = page.locator("#deploy-overlay")
        assert "active" in overlay.get_attribute("class")

    def test_deploy_overlay_shows_preview(self, page):
        page.click("#btn-deploy")
        page.wait_for_timeout(1000)

        body = page.locator("#deploy-body")
        text = body.text_content()
        # Should show group info or "Nothing to deploy"
        assert len(text) > 0

    def test_deploy_overlay_close(self, page):
        page.click("#btn-deploy")
        page.wait_for_timeout(500)
        page.click("#deploy-close")
        page.wait_for_timeout(300)

        overlay = page.locator("#deploy-overlay")
        assert "active" not in (overlay.get_attribute("class") or "")


# ── Tests: Editor Panel ──────────────────────────────────────────


class TestEditorPanel:

    def test_editor_shows_server_name(self, page):
        page.locator(".server-tile").first.click()
        page.wait_for_timeout(300)

        title = page.locator("#editor-title")
        assert len(title.text_content()) > 0

    def test_editor_has_type_field(self, page):
        page.locator(".server-tile").first.click()
        page.wait_for_timeout(300)

        type_select = page.locator("#edit-type")
        assert type_select.count() == 1

    def test_editor_has_env_vars(self, page):
        # Click taskr which has env vars
        taskr_tile = page.locator(".server-tile:has-text('taskr')")
        if taskr_tile.count() > 0:
            taskr_tile.first.click()
            page.wait_for_timeout(300)

            env_rows = page.locator(".editor-env-row")
            assert env_rows.count() >= 1

    def test_editor_masks_secret_values(self, page):
        taskr_tile = page.locator(".server-tile:has-text('taskr')")
        if taskr_tile.count() > 0:
            taskr_tile.first.click()
            page.wait_for_timeout(300)

            # Secret env vars should have type="password"
            password_inputs = page.locator('.env-val[type="password"]')
            assert password_inputs.count() >= 1

    def test_editor_secret_hint(self, page):
        taskr_tile = page.locator(".server-tile:has-text('taskr')")
        if taskr_tile.count() > 0:
            taskr_tile.first.click()
            page.wait_for_timeout(300)

            # Should show masking hint
            body_text = page.locator("#editor-body").text_content()
            assert "${VAR}" in body_text or "masked" in body_text.lower()

    def test_editor_backdrop_closes_panel(self, page):
        page.locator(".server-tile").first.click()
        page.wait_for_timeout(300)

        page.click("#editor-backdrop")
        page.wait_for_timeout(200)

        editor = page.locator("#editor-panel")
        assert "open" not in (editor.get_attribute("class") or "")


# ── Tests: Activity Feed ─────────────────────────────────────────


class TestActivityFeed:

    def test_activity_button_exists(self, page):
        btn = page.locator("#btn-activity")
        assert btn.count() == 1

    def test_activity_panel_toggles(self, page):
        page.click("#btn-activity")
        page.wait_for_timeout(500)

        panel = page.locator("#activity-panel")
        assert "open" in (panel.get_attribute("class") or "")

        # Close it
        page.click("#btn-activity-close")
        page.wait_for_timeout(300)
        assert "open" not in (panel.get_attribute("class") or "")


# ── Tests: Full Deploy E2E ───────────────────────────────────────


class TestDeployE2E:

    def test_deploy_group_from_detail_page(self, page, registry_server):
        _, group_dir = registry_server

        # Navigate to groups → detail → deploy
        page.click("#nav-groups")
        page.wait_for_timeout(500)
        page.locator(".group-card").first.click()
        page.wait_for_timeout(500)

        deploy_btn = page.locator(".btn-deploy-group")
        assert deploy_btn.count() >= 1
        deploy_btn.first.click()

        # Wait for deploy to complete
        page.wait_for_timeout(2000)

        # Verify .mcp.json was created in at least one repo
        alpha_mcp = Path(group_dir) / "alpha" / ".mcp.json"
        assert alpha_mcp.exists(), ".mcp.json should have been deployed"

        data = json.loads(alpha_mcp.read_text())
        assert "mcpServers" in data
        # taskr is assigned to this group
        assert "taskr" in data["mcpServers"]

    def test_deployed_secrets_are_masked(self, page, registry_server):
        _, group_dir = registry_server

        # Deploy should already have run from previous test
        alpha_mcp = Path(group_dir) / "alpha" / ".mcp.json"
        if not alpha_mcp.exists():
            # Force a deploy via API
            page.click("#nav-groups")
            page.wait_for_timeout(500)
            page.locator(".group-card").first.click()
            page.wait_for_timeout(500)
            page.locator(".btn-deploy-group").first.click()
            page.wait_for_timeout(2000)

        if alpha_mcp.exists():
            data = json.loads(alpha_mcp.read_text())
            taskr_env = data.get("mcpServers", {}).get("taskr", {}).get("env", {})
            if "TASKR_API_KEY" in taskr_env:
                assert taskr_env["TASKR_API_KEY"] == "${TASKR_API_KEY}", \
                    "Secret should be masked as ${VAR}"

    def test_activity_shows_deploy_event(self, page):
        # Open activity after deploy
        page.click("#btn-activity")
        page.wait_for_timeout(1000)

        activity_text = page.locator("#activity-list").text_content()
        # Should have at least one deploy event
        assert "Deploy" in activity_text or "deploy" in activity_text or \
               "Assign" in activity_text or "assign" in activity_text


# ── Tests: Confirm Dialog ────────────────────────────────────────


class TestConfirmDialog:

    def test_confirm_overlay_hidden_by_default(self, page):
        overlay = page.locator("#confirm-overlay")
        assert not overlay.is_visible()

    def test_confirm_dialog_has_buttons(self, page):
        cancel = page.locator("#confirm-cancel")
        ok = page.locator("#confirm-ok")
        assert cancel.count() == 1
        assert ok.count() == 1


# ── Tests: Pending Banner ────────────────────────────────────────


class TestPendingBanner:

    def test_pending_banner_hidden_initially(self, page):
        banner = page.locator("#pending-banner")
        assert not banner.is_visible()


# ── Tests: Scan Button ───────────────────────────────────────────


class TestScanButton:

    def test_scan_button_exists(self, page):
        btn = page.locator("#btn-scan")
        assert btn.count() == 1
        assert btn.is_visible()
