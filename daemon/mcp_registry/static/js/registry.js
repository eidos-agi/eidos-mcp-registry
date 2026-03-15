/**
 * MCP Registry — uhtml SPA (entry point)
 *
 * State, API helpers, data loading, SSE connection, init.
 * Module views are imported and wired together here.
 */

import { renderServersView, handleScanProgress } from './servers-view.js';
import { renderGroupsView, handleDeployProgress } from './groups-view.js';
import { initNav } from './nav.js';
import './editor.js';    // side-effects: registers event listeners
import './toast.js';     // side-effects: none yet (placeholder)
import { initActivity } from './activity.js';

// ── State ────────────────────────────────────────────────────────

export let state = {
  servers: {},
  groups: {},
  activeGroup: null,
  activeTab: 'servers',
  dragServer: null,
  scanning: false,
  deploying: false,
  pendingGroups: new Set(),
};

// ── API helpers ──────────────────────────────────────────────────

export const api = {
  get: (path) => fetch(path).then(r => r.json()),
  post: (path, body) => fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json()),
  put: (path, body) => fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json()),
};

// ── SSE ──────────────────────────────────────────────────────────

let _eventSource = null;
let _sseRetryCount = 0;

function connectSSE() {
  if (_eventSource) {
    _eventSource.close();
    _eventSource = null;
  }

  const es = new EventSource('/events');
  _eventSource = es;

  es.onopen = () => {
    console.log('[MCP Registry] SSE connected');
    _sseRetryCount = 0;
  };

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);

      if (data.servers && data.groups) {
        // Initial snapshot — ignore if we already have data (loadData already ran)
        if (Object.keys(state.servers).length === 0) {
          state.servers = data.servers;
          state.groups = data.groups;
          renderAll();
        }
      } else if (data.event === 'scan_progress') {
        handleScanProgress(data);
      } else if (data.event === 'deploy_progress') {
        handleDeployProgress(data);
      }
    } catch (err) {
      console.error('SSE parse error:', err);
    }
  };

  es.onerror = () => {
    es.close();
    if (_eventSource === es) _eventSource = null;
    _sseRetryCount++;
    // Back off: 3s, 6s, 12s, max 30s
    const delay = Math.min(3000 * Math.pow(2, _sseRetryCount - 1), 30000);
    console.log(`[MCP Registry] SSE error, retry #${_sseRetryCount} in ${delay}ms`);
    setTimeout(connectSSE, delay);
  };
}

// ── Data loading ─────────────────────────────────────────────────

export async function loadData() {
  const [servers, groups] = await Promise.all([
    api.get('/servers'),
    api.get('/groups'),
  ]);
  state.servers = servers;
  state.groups = groups;
  renderAll();
}

// ── Tab switching ────────────────────────────────────────────────

export function switchTab(tab) {
  state.activeTab = tab;

  // Show/hide the 3 view divs
  const views = ['servers', 'groups', 'store'];
  for (const v of views) {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = v === tab ? '' : 'none';
  }

  // Update nav-rail button active states
  document.querySelectorAll('.nav-rail-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  renderAll();
}

// ── Pending banner ───────────────────────────────────────────────

export function renderPendingBanner() {
  const banner = document.getElementById('pending-banner');
  const text = document.getElementById('pending-text');
  if (!banner || !text) return;

  const count = state.pendingGroups.size;
  if (count === 0) {
    banner.classList.remove('active');
  } else {
    banner.classList.add('active');
    text.textContent = `${count} group${count > 1 ? 's' : ''} ${count > 1 ? 'have' : 'has'} pending changes`;
  }
}

// ── Render orchestration ─────────────────────────────────────────

function renderFooter() {
  document.getElementById('stats').textContent =
    `${Object.keys(state.servers).length} servers | ${Object.keys(state.groups).length} groups`;
}

function renderStoreView() {
  const container = document.getElementById('view-store');
  if (!container) return;
  container.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'padding:60px 40px;text-align:center;max-width:500px;margin:0 auto';

  const icon = document.createElement('div');
  icon.style.cssText = 'font-size:48px;margin-bottom:16px';
  icon.textContent = '\u25C9'; // ◉

  const title = document.createElement('h2');
  title.style.cssText = 'font-size:20px;font-weight:600;margin-bottom:8px;color:var(--text)';
  title.textContent = 'MCP Store';

  const desc = document.createElement('p');
  desc.style.cssText = 'font-size:14px;color:var(--text-dim);line-height:1.6';
  desc.textContent = 'Browse and install MCP servers from a curated catalog. Discover tools for code review, documentation, testing, deployment, and more.';

  const badge = document.createElement('div');
  badge.style.cssText = 'margin-top:24px;display:inline-block;padding:6px 16px;border-radius:20px;background:var(--accent-dim);color:var(--accent);font-size:13px;font-weight:500';
  badge.textContent = 'Coming Soon';

  wrapper.append(icon, title, desc, badge);
  container.appendChild(wrapper);
}

export function renderAll() {
  renderFooter();
  renderPendingBanner();
  if (state.activeTab === 'servers') renderServersView();
  else if (state.activeTab === 'groups') renderGroupsView();
  else if (state.activeTab === 'store') renderStoreView();
}

// ── Init ─────────────────────────────────────────────────────────

// Wire nav-rail button clicks
document.querySelectorAll('.nav-rail-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Wire "Deploy All" button
document.getElementById('btn-deploy-all')?.addEventListener('click', async () => {
  if (state.pendingGroups.size === 0) return;
  const groups = [...state.pendingGroups];
  const result = await api.post('/deploy', { groups });
  state.pendingGroups.clear();
  renderPendingBanner();
  import('./toast.js').then(m => m.showToast(`Deployed ${result.written?.length || 0} files`, 'success'));
});

// Init nav keyboard shortcuts
initNav();

console.log('[MCP Registry] JS module loaded, calling loadData...');
loadData().then(() => {
  console.log('[MCP Registry] loadData complete, connecting SSE...');
  initActivity();
  connectSSE();
}).catch(err => {
  console.error('[MCP Registry] loadData failed:', err);
});
