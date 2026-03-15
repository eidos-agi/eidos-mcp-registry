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
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-primary:hover { opacity: 0.9; }

/* ── Main layout ───────────────────────────────────────────── */
.main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Tree (left rail) ──────────────────────────────────────── */
.tree {
  width: var(--rail-width);
  min-width: var(--rail-width);
  border-right: 1px solid var(--border);
  background: var(--bg-tree);
  overflow-y: auto;
  padding: 8px 0;
}
.tree-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background 0.1s;
}
.tree-item:hover { background: var(--bg-hover); }
.tree-item.active { background: var(--accent-dim); border-left: 2px solid var(--accent); }
.tree-item .count {
  background: var(--border);
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 11px;
  color: var(--text-dim);
}
.tree-item.drop-target { background: var(--accent-dim); outline: 2px dashed var(--accent); }

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

/* ── Deploy Modal ──────────────────────────────────────────── */
.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 100;
  justify-content: center;
  align-items: center;
}
.modal-overlay.active { display: flex; }
.modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}
.modal h3 { margin-bottom: 12px; }
.modal pre {
  background: var(--bg);
  padding: 12px;
  border-radius: var(--radius);
  font-size: 12px;
  overflow-x: auto;
  margin: 8px 0;
}
.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
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
  <section class="cards-area" id="cards-area">
    <h2 id="cards-title">All Servers</h2>
    <div class="cards-grid" id="cards-grid"></div>
  </section>
</div>

<footer>
  <span id="stats">Loading...</span>
  <span id="deploy-status"></span>
</footer>

<div class="modal-overlay" id="deploy-modal">
  <div class="modal">
    <h3>Deploy Preview</h3>
    <pre id="deploy-preview-content"></pre>
    <div class="modal-actions">
      <button class="btn" id="deploy-cancel">Cancel</button>
      <button class="btn btn-primary" id="deploy-confirm">Deploy Now</button>
    </div>
  </div>
</div>

<script type="module" src="/static/js/registry.js"></script>
</body>
</html>
"""
