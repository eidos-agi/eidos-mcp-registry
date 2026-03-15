"""
HTML shell served as a Python constant. Never cached from disk.
"""

REGISTRY_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Eidos MCP Registry</title>
<style>
:root {
  --bg: #0d1117;
  --bg-card: #161b22;
  --bg-hover: #1c2333;
  --bg-tree: #0d1117;
  --accent: #58a6ff;
  --accent-dim: #1f6feb33;
  --text: #c9d1d9;
  --text-dim: #8b949e;
  --green: #3fb950;
  --red: #f85149;
  --orange: #d29922;
  --border: #30363d;
  --radius: 6px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  height: 100vh;
  display: flex;
  overflow: hidden;
}

/* ── Header ────────────────────────────────────────────────── */
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
}
header h1 { font-size: 16px; font-weight: 600; }
header h1 span { color: var(--accent); }
.header-actions { display: flex; gap: 8px; }
.btn {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text);
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}
.btn:hover { background: var(--bg-hover); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-primary:hover { opacity: 0.9; }
.btn-danger { background: var(--red); color: #fff; border-color: var(--red); }

/* ── Nav Rail ─────────────────────────────────────────────── */
.nav-rail {
  width: 56px;
  min-width: 56px;
  background: var(--bg-card);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  gap: 4px;
  flex-shrink: 0;
}
.nav-rail-btn {
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  border-radius: var(--radius);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--text-dim);
  transition: background 0.15s, color 0.15s;
  font-size: 10px;
}
.nav-rail-btn:hover { background: var(--bg-hover); color: var(--text); }
.nav-rail-btn.active { background: var(--accent-dim); color: var(--accent); }
.nav-rail-icon { font-size: 18px; line-height: 1; }
.nav-rail-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }

/* ── Pending Banner ───────────────────────────────────────── */
.pending-banner {
  display: none;
  padding: 8px 16px;
  background: rgba(210, 153, 34, 0.1);
  border-bottom: 1px solid rgba(210, 153, 34, 0.3);
  color: var(--orange);
  font-size: 13px;
  align-items: center;
  gap: 12px;
  animation: slideDown 0.2s ease;
}
.pending-banner.active { display: flex; }
.pending-banner-text { flex: 1; }
.pending-banner .btn { font-size: 12px; }

/* ── Activity Panel ───────────────────────────────────────── */
.activity-panel {
  position: fixed;
  bottom: 0;
  left: 56px;
  right: 0;
  max-height: 300px;
  background: var(--bg-card);
  border-top: 1px solid var(--border);
  transform: translateY(100%);
  transition: transform 0.25s ease;
  z-index: 100;
  overflow-y: auto;
}
.activity-panel.open { transform: translateY(0); }
.activity-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--bg-card);
}
.activity-panel-header h4 { font-size: 13px; font-weight: 600; }
.activity-list { padding: 8px 0; }
.activity-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 16px;
  font-size: 12px;
  color: var(--text-dim);
}
.activity-item:hover { background: var(--bg-hover); }
.activity-icon { width: 20px; text-align: center; flex-shrink: 0; }
.activity-time { flex-shrink: 0; font-size: 11px; opacity: 0.6; }
.activity-text { flex: 1; }

/* ── Toast Container ──────────────────────────────────────── */
.toast-container {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 500;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
}
.toast {
  padding: 10px 16px;
  border-radius: var(--radius);
  font-size: 13px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.2s, transform 0.2s;
}
.toast.show { opacity: 1; transform: translateY(0); }
.toast-success { border-color: var(--green); }
.toast-error { border-color: var(--red); }
.toast-warning { border-color: var(--orange); }

/* ── Confirm Dialog ───────────────────────────────────────── */
.confirm-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 400;
  align-items: center;
  justify-content: center;
}
.confirm-overlay.active { display: flex; }
.confirm-dialog {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
  max-width: 420px;
  width: 90%;
}
.confirm-dialog h3 { font-size: 16px; margin-bottom: 8px; }
.confirm-dialog p { font-size: 13px; color: var(--text-dim); margin-bottom: 20px; }
.confirm-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }

/* ── Global Section ───────────────────────────────────────── */
.global-section {
  background: rgba(88, 166, 255, 0.05);
  border: 1px solid rgba(88, 166, 255, 0.15);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 20px;
}
.global-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.global-icon { font-size: 20px; }
.global-title { font-size: 14px; font-weight: 600; color: var(--accent); }
.global-subtitle { font-size: 11px; color: var(--text-dim); }
.global-servers {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

/* ── Group Cards (Groups view) ────────────────────────────── */
.group-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.group-card:hover { border-color: var(--accent); }
.group-card-header { display: flex; align-items: center; gap: 10px; }
.group-card-icon { font-size: 18px; }
.group-card-name { font-size: 14px; font-weight: 600; flex: 1; }
.group-card-stats { font-size: 12px; color: var(--text-dim); margin-top: 4px; }
.group-card-path { font-size: 11px; color: var(--text-dim); font-family: monospace; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Server Tile (Servers view) ───────────────────────────── */
.server-tile {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  cursor: grab;
  transition: border-color 0.15s, transform 0.1s;
  position: relative;
}
.server-tile:hover { border-color: var(--accent); }
.server-tile.dragging { opacity: 0.4; transform: scale(0.95); }
.server-tile-name { font-size: 14px; font-weight: 600; }
.server-tile-meta { font-size: 11px; color: var(--text-dim); margin-top: 4px; display: flex; align-items: center; gap: 6px; }
.server-tile-badges { display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
.type-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--bg-hover);
  border: 1px solid var(--border);
  color: var(--text-dim);
}
.group-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--accent-dim);
  color: var(--accent);
}
.secret-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(210, 153, 34, 0.15);
  color: var(--orange);
}

/* ── Servers Layout (drop zones left, tiles right) ───────── */
.servers-layout {
  display: flex;
  gap: 0;
  min-height: 0;
  flex: 1;
}
.servers-drop-rail {
  width: 200px;
  min-width: 160px;
  max-width: 240px;
  flex-shrink: 0;
  padding: 0 12px 16px 0;
  border-right: 1px solid var(--border);
  margin-right: 16px;
  overflow-y: auto;
  position: sticky;
  top: 0;
  align-self: flex-start;
}
.servers-main {
  flex: 1;
  min-width: 0;
}

/* ── Drop Zone ────────────────────────────────────────────── */
.drop-zone {
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  color: var(--text-dim);
  font-size: 12px;
  transition: border-color 0.15s, background 0.15s;
  cursor: default;
}
.drop-zone.over {
  border-color: var(--accent);
  background: var(--accent-dim);
  color: var(--accent);
}

/* ── Gitignore Banner ─────────────────────────────────────── */
.gitignore-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(210, 153, 34, 0.08);
  border: 1px solid rgba(210, 153, 34, 0.2);
  border-radius: var(--radius);
  font-size: 12px;
  color: var(--orange);
  margin-bottom: 12px;
}
.gitignore-banner .btn { font-size: 11px; padding: 3px 10px; }

/* ── Accordion (group detail) ─────────────────────────────── */
.accordion-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 8px;
  overflow: hidden;
}
.accordion-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.1s;
}
.accordion-header:hover { background: var(--bg-hover); }
.accordion-name { font-weight: 500; font-size: 13px; flex: 1; }
.accordion-chevron {
  font-size: 10px;
  color: var(--text-dim);
  transition: transform 0.15s;
}
.accordion-chevron.open { transform: rotate(90deg); }
.accordion-body {
  display: none;
  padding: 12px 14px;
  border-top: 1px solid var(--border);
}
.accordion-body.open { display: block; }
.accordion-section { margin-bottom: 10px; }
.accordion-section-title { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }

/* ── Deploy History ───────────────────────────────────────── */
.deploy-history-list { margin-top: 16px; }
.deploy-history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--bg);
  border-radius: var(--radius);
  margin-bottom: 6px;
  font-size: 12px;
}
.deploy-history-item:hover { background: var(--bg-hover); }
.deploy-history-time { color: var(--text-dim); flex-shrink: 0; }
.deploy-history-info { flex: 1; }
.btn-rollback {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: none;
  color: var(--text-dim);
  cursor: pointer;
}
.btn-rollback:hover { color: var(--orange); border-color: var(--orange); }

/* ── Tree (kept for backward compat — nav.js still renders) ── */
.tree {
  width: 240px;
  min-width: 160px;
  max-width: 500px;
  border-right: 1px solid var(--border);
  background: var(--bg-tree);
  overflow-y: auto;
  padding: 8px 0;
  flex-shrink: 0;
}
.tree-resize {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
  transition: background 0.15s;
  position: relative;
  z-index: 10;
  margin-left: -3px;
}
.tree-resize:hover,
.tree-resize.dragging {
  background: var(--accent);
}
/* Tree structure */
.tree-root { }
.tree-node { }
.tree-item {
  padding: 5px 10px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: background 0.1s;
  user-select: none;
}
.tree-item:hover { background: var(--bg-hover); }
.tree-item.active { background: var(--accent-dim); border-left: 2px solid var(--accent); }

/* User root node */
.tree-user { font-weight: 600; }
.tree-icon-user { font-size: 14px; flex-shrink: 0; }
.tree-label-root { color: var(--accent); }

/* Folder icons */
.tree-icon-folder { font-size: 13px; flex-shrink: 0; }

.tree-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tree-item .count {
  background: var(--border);
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 11px;
  color: var(--text-dim);
  flex-shrink: 0;
}
.tree-item .count.warn { background: var(--orange); color: #000; }
.tree-item.drop-target { background: var(--accent-dim); outline: 2px dashed var(--accent); }

/* Arrow toggle */
.tree-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 9px;
  color: var(--text-dim);
  transition: transform 0.15s;
  flex-shrink: 0;
  border-radius: 3px;
}
.tree-arrow:hover { background: var(--border); color: var(--text); }
.tree-arrow.open { transform: rotate(90deg); }
.tree-arrow.empty { visibility: hidden; }

/* Children — indented with guide line */
.tree-children {
  border-left: 1px solid var(--border);
}
.tree-children.depth-0 { margin-left: 16px; padding-left: 8px; }
.tree-children.depth-1 { margin-left: 14px; padding-left: 8px; }

/* Server leaves */
.tree-leaf {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  font-size: 12px;
  color: var(--text-dim);
  cursor: grab;
  border-radius: var(--radius);
  transition: background 0.1s;
}
.tree-leaf:hover { background: var(--bg-hover); color: var(--text); }
.tree-leaf .health-dot { flex-shrink: 0; }
.tree-leaf-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Inherited servers (flow down from user scope) */
.tree-leaf.inherited {
  cursor: default;
  opacity: 0.45;
}
.tree-leaf.inherited:hover {
  background: transparent;
  color: var(--text-dim);
}
.tree-leaf.inherited .tree-leaf-name {
  font-style: italic;
}
.inherited-badge {
  font-size: 9px;
  color: var(--accent);
  margin-left: auto;
  flex-shrink: 0;
}
.inherited-divider {
  padding: 3px 8px 1px;
  font-size: 10px;
  color: var(--text-dim);
  opacity: 0.5;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-top: 1px solid var(--border);
  margin-top: 2px;
}
.tree-empty {
  padding: 3px 8px;
  font-size: 11px;
  color: var(--text-dim);
  opacity: 0.4;
  font-style: italic;
}

.unassigned-label { color: var(--orange); }

/* ── Cards area ────────────────────────────────────────────── */
.cards-area {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.cards-area h2 {
  font-size: 14px;
  color: var(--text-dim);
  margin-bottom: 12px;
  font-weight: 500;
}
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

/* ── Server card ───────────────────────────────────────────── */
.server-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  cursor: grab;
  transition: border-color 0.15s, transform 0.1s;
  position: relative;
}
.server-card:hover { border-color: var(--accent); }
.server-card.dragging { opacity: 0.4; transform: scale(0.95); }
.server-card .name { font-size: 14px; font-weight: 600; }
.server-card .meta {
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 4px;
}
.server-card .health-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 4px;
  vertical-align: middle;
}
.health-connected { background: var(--green); }
.health-failed { background: var(--red); }
.health-unknown { background: var(--text-dim); }
.health-needs-auth { background: var(--orange); }
.health-needs-authentication { background: var(--orange); }

/* ── Group Config Page ────────────────────────────────────── */
.group-config {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 700px;
}
.gc-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.gc-path {
  font-size: 12px;
  color: var(--text-dim);
  font-family: monospace;
}
.gc-missing {
  font-size: 11px;
  color: var(--red);
  background: rgba(248,81,73,0.1);
  padding: 2px 8px;
  border-radius: 10px;
}
.gc-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}
.gc-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}
.gc-section-hint {
  font-size: 11px;
  color: var(--text-dim);
  margin-bottom: 12px;
}
.gc-server-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.gc-available {
  max-height: 200px;
  overflow-y: auto;
}
.gc-server-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  background: var(--bg);
  font-size: 13px;
}
.gc-server-row.inherited {
  opacity: 0.7;
}
.gc-server-row:hover {
  background: var(--bg-hover);
}
.gc-server-name {
  font-weight: 500;
  flex: 1;
}
.gc-server-type {
  font-size: 11px;
  color: var(--text-dim);
}
.gc-badge-inherited {
  font-size: 10px;
  color: var(--accent);
  background: var(--accent-dim);
  padding: 1px 6px;
  border-radius: 8px;
}
.gc-badge-other {
  font-size: 10px;
  color: var(--orange);
  background: rgba(210,153,34,0.15);
  padding: 1px 6px;
  border-radius: 8px;
}
.gc-btn-config {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-dim);
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  font-size: 12px;
}
.gc-btn-config:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.gc-empty {
  font-size: 12px;
  color: var(--text-dim);
  padding: 8px;
  font-style: italic;
}

/* Toggle switch */
.gc-toggle {
  position: relative;
  display: inline-block;
  width: 32px;
  height: 18px;
  flex-shrink: 0;
}
.gc-toggle input { opacity: 0; width: 0; height: 0; }
.gc-toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--border);
  border-radius: 18px;
  transition: background 0.2s;
}
.gc-toggle-slider::before {
  content: "";
  position: absolute;
  height: 14px;
  width: 14px;
  left: 2px;
  bottom: 2px;
  background: var(--text-dim);
  border-radius: 50%;
  transition: transform 0.2s, background 0.2s;
}
.gc-toggle input:checked + .gc-toggle-slider {
  background: var(--green);
}
.gc-toggle input:checked + .gc-toggle-slider::before {
  transform: translateX(14px);
  background: white;
}

/* Effective tags */
.gc-effective {
  background: rgba(88,166,255,0.05);
  border-color: rgba(88,166,255,0.2);
}
.gc-effective-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.gc-tag {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 12px;
  font-weight: 500;
}
.gc-tag-inherited {
  background: var(--accent-dim);
  color: var(--accent);
}
.gc-tag-assigned {
  background: rgba(63,185,80,0.15);
  color: var(--green);
}

/* Deploy button */
.gc-deploy {
  display: flex;
  justify-content: flex-end;
}
.btn-deploy-group {
  background: var(--green);
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.btn-deploy-group:hover {
  filter: brightness(1.1);
}
.btn-deploy-group:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-deploy-group.deployed {
  background: var(--accent);
}
.btn-deploy-group.pending {
  background: var(--orange);
  color: #000;
}

/* ── Footer ────────────────────────────────────────────────── */
footer {
  padding: 8px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg-card);
  font-size: 12px;
  color: var(--text-dim);
  display: flex;
  justify-content: space-between;
}

/* ── Full-page overlay ─────────────────────────────────────── */
.overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: var(--bg);
  z-index: 200;
  flex-direction: column;
  overflow: hidden;
}
.overlay.active { display: flex; }
.overlay-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
}
.overlay-header h2 { font-size: 18px; font-weight: 600; }
.overlay-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
.overlay-footer {
  padding: 12px 24px;
  border-top: 1px solid var(--border);
  background: var(--bg-card);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ── Scan banner (non-blocking) ─────────────────────────────── */
.scan-banner {
  display: none;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  animation: slideDown 0.2s ease;
}
@keyframes slideDown { from { transform: translateY(-100%); opacity:0; } to { transform: translateY(0); opacity:1; } }
.scan-banner.active { display: block; }
.scan-banner.done { border-bottom-color: var(--green); }
.scan-banner-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
}
.scan-banner-icon { flex-shrink: 0; width: 20px; }
.scan-banner-text { flex: 1; font-size: 13px; }
.scan-banner-toggle {
  font-size: 11px;
  padding: 2px 10px;
}
.scan-banner-detail {
  display: none;
  padding: 0 16px 12px;
  max-height: 400px;
  overflow-y: auto;
}
.scan-banner-detail.expanded { display: block; }

/* ── Scan log shared ───────────────────────────────────────── */
.scan-log {
  font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
  font-size: 13px;
  line-height: 1.7;
}
.scan-line {
  padding: 4px 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  animation: fadeIn 0.2s ease-in;
}
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; } }
.scan-icon { flex-shrink: 0; width: 20px; text-align: center; }
.scan-phase { color: var(--accent); font-weight: 600; }
.scan-detail { color: var(--text); }
.scan-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.scan-summary {
  margin-top: 12px;
  padding: 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 13px;
}
.scan-summary strong { color: var(--accent); }

/* ── Parallel scan lanes ───────────────────────────────────── */
.scan-lanes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 16px 0;
}
.scan-lane {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 16px;
  animation: fadeIn 0.25s ease-in;
  transition: border-color 0.3s;
}
.scan-lane-done { border-color: var(--green); }
.scan-lane-error { border-color: var(--red); }
.scan-lane-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.scan-lane-icon {
  flex-shrink: 0;
  width: 20px;
  text-align: center;
  font-size: 14px;
}
.scan-lane-name {
  font-weight: 600;
  color: var(--accent);
  min-width: 120px;
}
.scan-lane-status {
  color: var(--text-dim);
  font-size: 12px;
}
.scan-lane-done .scan-lane-status { color: var(--text); }
.scan-lane-results {
  margin-top: 0;
  transition: margin-top 0.2s;
}
.scan-lane-done .scan-lane-results { margin-top: 8px; }
.scan-server-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.scan-server-tag {
  background: var(--bg-hover);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--text-dim);
  animation: fadeIn 0.15s ease-in;
}

/* ── Deploy page ───────────────────────────────────────────── */

/* Group cards */
.deploy-group-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 12px;
  transition: border-color 0.2s;
}
.deploy-group-card.done {
  border-color: var(--green);
  opacity: 0.7;
}
.deploy-group-card.deploying {
  border-color: var(--accent);
}
.deploy-group-card.error {
  border-color: var(--red);
}
.deploy-group-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.deploy-group-header input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
  flex-shrink: 0;
}
.deploy-group-name {
  font-size: 15px;
  font-weight: 600;
  flex: 1;
}
.deploy-status-badge {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 10px;
  font-weight: 500;
  flex-shrink: 0;
}
.status-pending { background: var(--orange); color: #000; }
.status-deploying { background: var(--accent); color: #fff; }
.status-done { background: var(--green); color: #000; }
.status-error { background: var(--red); color: #fff; }

.deploy-group-summary {
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 6px;
}

/* Expandable repo list */
.deploy-expand-btn {
  padding: 3px 10px;
}
.deploy-repo-list {
  margin-top: 8px;
  border-top: 1px solid var(--border);
  padding-top: 8px;
  max-height: 300px;
  overflow-y: auto;
}
.deploy-repo-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 8px;
  font-size: 12px;
  color: var(--text-dim);
  border-radius: 3px;
}
.deploy-repo-row:hover { background: var(--bg-hover); }
.action-badge {
  display: inline-block;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  text-transform: uppercase;
  font-weight: 600;
  flex-shrink: 0;
}
.action-create { background: var(--green); color: #000; }
.action-update { background: var(--orange); color: #000; }

.deploy-warning {
  margin-top: 8px;
  padding: 6px 10px;
  font-size: 11px;
  color: var(--orange);
  background: rgba(210, 153, 34, 0.1);
  border: 1px solid rgba(210, 153, 34, 0.3);
  border-radius: var(--radius);
}

/* ── Config Diff Viewer ─────────────────────────────────────── */
.diff-container {
  font-family: "SF Mono", Monaco, monospace;
  font-size: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow-x: auto;
  margin: 8px 0;
}
.diff-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-dim);
  cursor: pointer;
}
.diff-header:hover { background: var(--bg-hover); }
.diff-body { display: none; padding: 0; }
.diff-body.open { display: block; }
.diff-line {
  padding: 1px 12px;
  white-space: pre;
  line-height: 1.6;
}
.diff-add { background: rgba(63,185,80,0.15); color: var(--green); }
.diff-remove { background: rgba(248,81,73,0.15); color: var(--red); }
.diff-unchanged { color: var(--text-dim); }
.diff-new-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--green);
  color: #000;
}
.deploy-servers {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.deploy-servers .srv-tag {
  background: var(--bg-hover);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 11px;
  color: var(--text-dim);
}
.deploy-stats {
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 16px;
  display: flex;
  gap: 24px;
  font-size: 14px;
}
.deploy-stats .stat-value { font-size: 24px; font-weight: 700; color: var(--accent); }
.deploy-stats .stat-label { font-size: 12px; color: var(--text-dim); }
.deploy-progress {
  margin-top: 16px;
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--green);
  border-radius: var(--radius);
  font-size: 13px;
}
.deploy-progress .progress-bar {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  margin-top: 8px;
  overflow: hidden;
}
.deploy-progress .progress-fill {
  height: 100%;
  background: var(--green);
  transition: width 0.3s ease;
}

/* ── Editor panel (slide-out) ──────────────────────────────── */
.editor-panel {
  position: fixed;
  top: 0;
  right: -480px;
  width: 480px;
  height: 100vh;
  background: var(--bg-card);
  border-left: 1px solid var(--border);
  z-index: 300;
  display: flex;
  flex-direction: column;
  transition: right 0.25s ease;
  box-shadow: -4px 0 24px rgba(0,0,0,0.4);
}
.editor-panel.open { right: 0; }
.editor-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.editor-panel-header h3 { font-size: 16px; font-weight: 600; }
.editor-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.editor-panel-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.editor-field {
  margin-bottom: 16px;
}
.editor-field label {
  display: block;
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 4px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.editor-field input,
.editor-field textarea,
.editor-field select {
  width: 100%;
  padding: 8px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}
.editor-field input:focus,
.editor-field textarea:focus,
.editor-field select:focus {
  border-color: var(--accent);
}
.editor-field textarea {
  min-height: 80px;
  resize: vertical;
}
.editor-field select {
  cursor: pointer;
}
.editor-health {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 16px;
  font-size: 13px;
}
.editor-env-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
  align-items: center;
}
.editor-env-row input {
  flex: 1;
}
.editor-env-row .env-key { flex: 0.4; }
.editor-env-row .env-val { flex: 0.6; }
.editor-env-row .btn-icon {
  width: 28px;
  height: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 16px;
}
.editor-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.3);
  z-index: 250;
}
.editor-backdrop.open { display: block; }
.editor-saved {
  color: var(--green);
  font-size: 13px;
  animation: fadeIn 0.2s ease-in;
}

/* ── Content Pages (Why MCP, Why Eidos) ──────────────────── */
.content-page {
  max-width: 800px;
  padding: 0 20px 40px;
}
.content-page h2 {
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
  margin: 32px 0 8px;
  line-height: 1.3;
}
.content-page h2:first-child { margin-top: 0; }
.content-page h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--accent);
  margin: 24px 0 8px;
}
.content-page p {
  font-size: 14px;
  color: var(--text-dim);
  line-height: 1.7;
  margin-bottom: 12px;
}
.content-page strong { color: var(--text); }
.content-hero {
  padding: 32px 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: 24px;
}
.content-hero h1 {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 12px;
}
.content-hero h1 span { color: var(--accent); }
.content-hero p {
  font-size: 16px;
  color: var(--text-dim);
  max-width: 600px;
}

/* Comparison grid */
.compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 16px 0;
}
.compare-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}
.compare-card.bad { border-color: var(--red); }
.compare-card.good { border-color: var(--green); }
.compare-card h4 {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}
.compare-card.bad h4 { color: var(--red); }
.compare-card.good h4 { color: var(--green); }
.compare-card ul {
  list-style: none;
  padding: 0;
  font-size: 13px;
  color: var(--text-dim);
}
.compare-card li {
  padding: 3px 0;
}
.compare-card.bad li::before { content: "\\2717 "; color: var(--red); }
.compare-card.good li::before { content: "\\2713 "; color: var(--green); }

/* Metric cards */
.metrics-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin: 16px 0;
}
.metric-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  text-align: center;
}
.metric-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--accent);
}
.metric-value.bad { color: var(--red); }
.metric-value.good { color: var(--green); }
.metric-label {
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 4px;
}

/* Bar chart */
.bar-chart {
  margin: 16px 0;
}
.bar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.bar-label {
  width: 140px;
  font-size: 12px;
  color: var(--text-dim);
  text-align: right;
  flex-shrink: 0;
}
.bar-track {
  flex: 1;
  height: 24px;
  background: var(--bg);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}
.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.8s ease;
  display: flex;
  align-items: center;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}
.bar-fill.red { background: var(--red); }
.bar-fill.green { background: var(--green); }
.bar-fill.orange { background: var(--orange); color: #000; }
.bar-fill.accent { background: var(--accent); }

/* Scenario cards */
.scenario {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  margin: 12px 0;
}
.scenario-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.scenario-icon { font-size: 20px; }
.scenario-title { font-size: 14px; font-weight: 600; color: var(--text); }
.scenario p { font-size: 13px; color: var(--text-dim); line-height: 1.6; margin: 0; }
.scenario .highlight { color: var(--red); font-weight: 500; }

/* Feature list */
.feature-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 16px 0;
}
.feature-item {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
}
.feature-item-icon { font-size: 18px; margin-bottom: 6px; }
.feature-item-title { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
.feature-item-desc { font-size: 12px; color: var(--text-dim); line-height: 1.5; }

/* Pull quote */
.pull-quote {
  border-left: 3px solid var(--accent);
  padding: 12px 20px;
  margin: 20px 0;
  font-size: 15px;
  font-style: italic;
  color: var(--text);
  background: var(--bg-card);
  border-radius: 0 var(--radius) var(--radius) 0;
}
</style>
</head>
<body>

<nav class="nav-rail" id="nav-rail">
  <button class="nav-rail-btn active" data-tab="servers" id="nav-servers">
    <span class="nav-rail-icon">&#x229E;</span>
    <span class="nav-rail-label">Servers</span>
  </button>
  <button class="nav-rail-btn" data-tab="groups" id="nav-groups">
    <span class="nav-rail-icon">&#x25A4;</span>
    <span class="nav-rail-label">Groups</span>
  </button>
  <button class="nav-rail-btn" data-tab="store" id="nav-store">
    <span class="nav-rail-icon">&#x25C9;</span>
    <span class="nav-rail-label">Store</span>
  </button>
  <button class="nav-rail-btn" data-tab="why-mcp" id="nav-why-mcp">
    <span class="nav-rail-icon">&#x2139;</span>
    <span class="nav-rail-label">Why MCP</span>
  </button>
  <button class="nav-rail-btn" data-tab="why-eidos" id="nav-why-eidos">
    <span class="nav-rail-icon">&#x2B50;</span>
    <span class="nav-rail-label">Why Eidos</span>
  </button>
  <button class="nav-rail-btn" data-tab="rebuttal" id="nav-rebuttal">
    <span class="nav-rail-icon">&#x2694;</span>
    <span class="nav-rail-label">Rebuttal</span>
  </button>
  <button class="nav-rail-btn" data-tab="cli-vs-mcp" id="nav-cli-vs-mcp">
    <span class="nav-rail-icon">&#x2696;</span>
    <span class="nav-rail-label">CLI vs MCP</span>
  </button>
  <button class="nav-rail-btn" data-tab="token-savings" id="nav-token-savings">
    <span class="nav-rail-icon">&#x26A1;</span>
    <span class="nav-rail-label">Tokens</span>
  </button>
</nav>

<div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
  <!-- Pending banner -->
  <div class="pending-banner" id="pending-banner">
    <span class="pending-banner-text" id="pending-text">0 groups have pending changes</span>
    <button class="btn btn-primary" id="btn-deploy-all" style="font-size:12px;padding:4px 12px">Deploy All</button>
  </div>

  <!-- Header -->
  <header>
    <h1 id="view-title"><span>EIDOS</span> MCP REGISTRY</h1>
    <div class="header-actions">
      <button class="btn" id="btn-scan">Scan</button>
      <button class="btn btn-primary" id="btn-deploy">Deploy</button>
    </div>
  </header>

  <!-- Scan banner (inline, non-blocking) -->
  <div class="scan-banner" id="scan-banner">
    <div class="scan-banner-bar" id="scan-banner-bar">
      <span class="scan-banner-icon"><span class="scan-spinner"></span></span>
      <span class="scan-banner-text" id="scan-banner-text">Scanning...</span>
      <button class="btn scan-banner-toggle" id="scan-toggle">Details</button>
    </div>
    <div class="scan-banner-detail" id="scan-banner-detail">
      <div class="scan-log" id="scan-log"></div>
    </div>
  </div>

  <!-- Content area (switches by tab) -->
  <section class="cards-area" id="cards-area">
    <!-- Servers view (default) -->
    <div id="view-servers">
      <h2 id="cards-title">All Servers</h2>
      <div class="cards-grid" id="cards-grid"></div>
    </div>
    <!-- Groups view -->
    <div id="view-groups" style="display:none"></div>
    <!-- Store view -->
    <div id="view-store" style="display:none"></div>
    <!-- Why MCP view -->
    <div id="view-why-mcp" style="display:none"></div>
    <!-- Why Eidos view -->
    <div id="view-why-eidos" style="display:none"></div>
    <!-- Rebuttal view -->
    <div id="view-rebuttal" style="display:none"></div>
    <!-- CLI vs MCP view -->
    <div id="view-cli-vs-mcp" style="display:none"></div>
    <!-- Token Savings view -->
    <div id="view-token-savings" style="display:none"></div>
  </section>

  <!-- Hidden tree element for backward compat (nav.js renderTree) -->
  <div id="tree" style="display:none"></div>

  <!-- Footer with activity toggle -->
  <footer>
    <span id="stats">Loading...</span>
    <span style="display:flex;gap:12px;align-items:center">
      <span id="deploy-status"></span>
      <button class="btn" id="btn-activity" style="font-size:11px;padding:3px 10px">Activity</button>
    </span>
  </footer>
</div>

<!-- Activity panel (bottom drawer) -->
<div class="activity-panel" id="activity-panel">
  <div class="activity-panel-header">
    <h4>Activity</h4>
    <button class="btn" id="btn-activity-close" style="font-size:11px;padding:2px 8px">Close</button>
  </div>
  <div class="activity-list" id="activity-list"></div>
</div>

<!-- Toast container -->
<div class="toast-container" id="toast-container"></div>

<!-- Confirm dialog -->
<div class="confirm-overlay" id="confirm-overlay">
  <div class="confirm-dialog" id="confirm-dialog">
    <h3 id="confirm-title">Confirm Assignment</h3>
    <p id="confirm-text">Are you sure?</p>
    <div class="confirm-dialog-actions">
      <button class="btn" id="confirm-cancel">Cancel</button>
      <button class="btn btn-primary" id="confirm-ok">Confirm</button>
    </div>
  </div>
</div>

<!-- Deploy overlay -->
<div class="overlay" id="deploy-overlay">
  <div class="overlay-header">
    <h2>Deploy Preview</h2>
    <button class="btn" id="deploy-close">Close</button>
  </div>
  <div class="overlay-body" id="deploy-body"></div>
  <div class="overlay-footer">
    <button class="btn" id="deploy-back">Cancel</button>
    <button class="btn btn-primary" id="deploy-go">Deploy Now</button>
  </div>
</div>

<!-- Editor backdrop + panel -->
<div class="editor-backdrop" id="editor-backdrop"></div>
<div class="editor-panel" id="editor-panel">
  <div class="editor-panel-header">
    <h3 id="editor-title">Server Config</h3>
    <button class="btn" id="editor-close">Close</button>
  </div>
  <div class="editor-panel-body" id="editor-body"></div>
  <div class="editor-panel-footer">
    <span id="editor-status"></span>
    <div style="display:flex;gap:8px">
      <button class="btn" id="editor-cancel">Cancel</button>
      <button class="btn btn-primary" id="editor-save">Save</button>
    </div>
  </div>
</div>

<script type="module" src="/static/js/registry.js"></script>
</body>
</html>
"""
