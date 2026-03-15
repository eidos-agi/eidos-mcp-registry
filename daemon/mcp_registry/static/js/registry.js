/**
 * MCP Registry — uhtml SPA
 *
 * Tree navigation, server cards, drag-and-drop assignment, SSE live updates.
 */

import { html, render } from './uhtml.js';

// ── State ────────────────────────────────────────────────────────

let state = {
  servers: {},
  groups: {},
  activeGroup: null,  // null = all, string = group key
  dragServer: null,
};

// ── API helpers ──────────────────────────────────────────────────

const api = {
  get: (path) => fetch(path).then(r => r.json()),
  post: (path, body) => fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json()),
};

// ── SSE ──────────────────────────────────────────────────────────

function connectSSE() {
  const es = new EventSource('/events');
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.servers) {
        // Full snapshot
        state.servers = data.servers;
        state.groups = data.groups;
      } else if (data.event) {
        // Incremental event — just reload
        loadData();
      }
      renderAll();
    } catch (err) {
      console.error('SSE parse error:', err);
    }
  };
  es.onerror = () => {
    console.warn('SSE disconnected, reconnecting in 3s...');
    setTimeout(connectSSE, 3000);
  };
}

// ── Data loading ─────────────────────────────────────────────────

async function loadData() {
  const [servers, groups] = await Promise.all([
    api.get('/servers'),
    api.get('/groups'),
  ]);
  state.servers = servers;
  state.groups = groups;
  renderAll();
}

// ── Rendering ────────────────────────────────────────────────────

function renderTree() {
  const tree = document.getElementById('tree');
  const groups = Object.entries(state.groups).sort((a, b) => {
    if (a[0] === '__universal__') return -1;
    if (b[0] === '__universal__') return 1;
    return a[1].label.localeCompare(b[1].label);
  });

  // Count unassigned
  const assigned = new Set();
  for (const g of Object.values(state.groups)) {
    for (const s of g.servers || []) assigned.add(s);
  }
  const unassignedCount = Object.keys(state.servers).length - assigned.size;

  render(tree, html`
    <div class=${`tree-item ${state.activeGroup === null ? 'active' : ''}`}
         onclick=${() => { state.activeGroup = null; renderAll(); }}>
      <span>All Servers</span>
      <span class="count">${Object.keys(state.servers).length}</span>
    </div>
    ${groups.map(([key, group]) => html`
      <div class=${`tree-item ${state.activeGroup === key ? 'active' : ''}`}
           onclick=${() => { state.activeGroup = key; renderAll(); }}
           ondragover=${(e) => onDragOver(e, key)}
           ondragleave=${(e) => onDragLeave(e)}
           ondrop=${(e) => onDrop(e, key)}
           data-group=${key}>
        <span>${group.label}</span>
        <span class="count">${(group.servers || []).length}</span>
      </div>
    `)}
    ${unassignedCount > 0 ? html`
      <div class=${`tree-item ${state.activeGroup === '__unassigned__' ? 'active' : ''}`}
           onclick=${() => { state.activeGroup = '__unassigned__'; renderAll(); }}>
        <span>Unassigned</span>
        <span class="count">${unassignedCount}</span>
      </div>
    ` : ''}
  `);
}

function renderCards() {
  const title = document.getElementById('cards-title');
  const grid = document.getElementById('cards-grid');

  let filtered;
  if (state.activeGroup === null) {
    title.textContent = 'All Servers';
    filtered = Object.keys(state.servers);
  } else if (state.activeGroup === '__unassigned__') {
    title.textContent = 'Unassigned';
    const assigned = new Set();
    for (const g of Object.values(state.groups)) {
      for (const s of g.servers || []) assigned.add(s);
    }
    filtered = Object.keys(state.servers).filter(s => !assigned.has(s));
  } else {
    const group = state.groups[state.activeGroup];
    title.textContent = group ? group.label : state.activeGroup;
    filtered = group ? (group.servers || []) : [];
  }

  filtered.sort();

  render(grid, html`
    ${filtered.map(name => {
      const srv = state.servers[name] || {};
      const health = srv.health || 'unknown';
      const healthClass = `health-${health.replace(/\s+/g, '-')}`;
      return html`
        <div class="server-card"
             draggable="true"
             ondragstart=${(e) => onDragStart(e, name)}
             ondragend=${(e) => onDragEnd(e)}>
          <div class="name">
            <span class=${`health-dot ${healthClass}`}></span>
            ${name}
          </div>
          <div class="meta">
            ${srv.type || 'stdio'} · ${srv.source_scope || 'user'}
          </div>
        </div>
      `;
    })}
    ${filtered.length === 0 ? html`
      <div style="color: var(--text-dim); padding: 20px;">
        No servers in this group. Drag servers here to assign them.
      </div>
    ` : ''}
  `);
}

function renderFooter() {
  const stats = document.getElementById('stats');
  const serverCount = Object.keys(state.servers).length;
  const groupCount = Object.keys(state.groups).length;
  stats.textContent = `${serverCount} servers | ${groupCount} groups`;
}

function renderAll() {
  renderTree();
  renderCards();
  renderFooter();
}

// ── Drag and Drop ────────────────────────────────────────────────

function onDragStart(e, serverName) {
  state.dragServer = serverName;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', serverName);
  e.target.classList.add('dragging');
}

function onDragEnd(e) {
  state.dragServer = null;
  e.target.classList.remove('dragging');
  // Remove all drop targets
  document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
}

function onDragOver(e, groupKey) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drop-target');
}

function onDragLeave(e) {
  e.currentTarget.classList.remove('drop-target');
}

async function onDrop(e, groupKey) {
  e.preventDefault();
  e.currentTarget.classList.remove('drop-target');
  const serverName = state.dragServer || e.dataTransfer.getData('text/plain');
  if (!serverName || groupKey === '__unassigned__') return;

  await api.post('/assign', { server: serverName, group: groupKey });
  await loadData();
}

// ── Scan ─────────────────────────────────────────────────────────

document.getElementById('btn-scan').addEventListener('click', async () => {
  const btn = document.getElementById('btn-scan');
  btn.textContent = 'Scanning...';
  btn.disabled = true;
  try {
    const result = await api.post('/scan');
    document.getElementById('deploy-status').textContent =
      `Scan: ${result.servers_found} servers found`;
    await loadData();
  } finally {
    btn.textContent = 'Scan';
    btn.disabled = false;
  }
});

// ── Deploy ───────────────────────────────────────────────────────

const deployModal = document.getElementById('deploy-modal');
const deployPreview = document.getElementById('deploy-preview-content');

document.getElementById('btn-deploy').addEventListener('click', async () => {
  const result = await api.post('/deploy/preview');
  if (result.changes === 0) {
    deployPreview.textContent = 'No changes to deploy. Assign servers to groups first.';
  } else {
    let text = `${result.changes} file(s) will be written:\n\n`;
    for (const [path, info] of Object.entries(result.files)) {
      text += `[${info.action}] ${path}\n  servers: ${info.servers.join(', ')}\n\n`;
    }
    deployPreview.textContent = text;
  }
  deployModal.classList.add('active');
});

document.getElementById('deploy-cancel').addEventListener('click', () => {
  deployModal.classList.remove('active');
});

document.getElementById('deploy-confirm').addEventListener('click', async () => {
  deployModal.classList.remove('active');
  document.getElementById('deploy-status').textContent = 'Deploying...';
  const result = await api.post('/deploy');
  document.getElementById('deploy-status').textContent =
    `Deployed: ${result.written?.length || 0} files written`;
  await loadData();
});

// Close modal on overlay click
deployModal.addEventListener('click', (e) => {
  if (e.target === deployModal) deployModal.classList.remove('active');
});

// ── Init ─────────────────────────────────────────────────────────

loadData().then(() => {
  connectSSE();
});
