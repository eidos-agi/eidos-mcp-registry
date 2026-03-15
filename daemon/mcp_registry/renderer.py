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
  --rail-width: 240px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  height: 100vh;
  display: flex;
  flex-direction: column;
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

/* ── Main layout ───────────────────────────────────────────── */
.main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Tree (left rail) ──────────────────────────────────────── */
.tree {
  width: var(--rail-width);
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
</style>
</head>
<body>

<header>
  <h1><span>EIDOS</span> MCP REGISTRY</h1>
  <div class="header-actions">
    <button class="btn" id="btn-scan">Scan</button>
    <button class="btn btn-primary" id="btn-deploy">Deploy</button>
  </div>
</header>

<div class="main">
  <nav class="tree" id="tree"></nav>
  <div class="tree-resize" id="tree-resize"></div>
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
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
    <section class="cards-area" id="cards-area">
      <h2 id="cards-title">All Servers</h2>
      <div class="cards-grid" id="cards-grid"></div>
    </section>
  </div>
</div>

<footer>
  <span id="stats">Loading...</span>
  <span id="deploy-status"></span>
</footer>

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
