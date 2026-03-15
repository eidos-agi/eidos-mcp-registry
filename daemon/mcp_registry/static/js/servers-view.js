/**
 * Servers view — server tiles, global section, drop zones, scan banner.
 */

import { state, api, loadData, renderPendingBanner } from './registry.js';

// ── Server tile ─────────────────────────────────────────────────

function createServerTile(name, isGlobal = false) {
  const srv = state.servers[name] || {};
  const health = srv.health || 'unknown';

  const tile = document.createElement('div');
  tile.className = 'server-tile';
  tile.draggable = true;
  tile.dataset.server = name;

  // Drag handlers
  tile.addEventListener('dragstart', (e) => {
    state.dragServer = name;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', name);
    tile.classList.add('dragging');
  });
  tile.addEventListener('dragend', () => {
    state.dragServer = null;
    tile.classList.remove('dragging');
    document.querySelectorAll('.drop-zone.over').forEach(el => el.classList.remove('over'));
  });

  // Click to edit
  tile.addEventListener('click', () => {
    import('./editor.js').then(m => m.openEditor(name));
  });

  // Name
  const nameEl = document.createElement('div');
  nameEl.className = 'server-tile-name';
  const dot = document.createElement('span');
  dot.className = `health-dot health-${health.replace(/\s+/g, '-')}`;
  nameEl.append(dot, document.createTextNode(' ' + name));
  tile.appendChild(nameEl);

  // Meta
  const meta = document.createElement('div');
  meta.className = 'server-tile-meta';
  meta.textContent = `${srv.type || 'stdio'} \u00B7 ${srv.source_scope || 'user'}`;
  tile.appendChild(meta);

  // Badges
  const badges = document.createElement('div');
  badges.className = 'server-tile-badges';

  // Type badge
  const typeBadge = document.createElement('span');
  typeBadge.className = 'type-badge';
  typeBadge.textContent = srv.type || 'stdio';
  badges.appendChild(typeBadge);

  // Group badges — which groups is this server assigned to?
  for (const [gk, g] of Object.entries(state.groups)) {
    if (gk === '__universal__') continue;
    if ((g.servers || []).includes(name)) {
      const gb = document.createElement('span');
      gb.className = 'group-badge';
      gb.textContent = g.label || gk;
      badges.appendChild(gb);
    }
  }

  // Secret badge if has secrets
  if (srv.env) {
    const secretKeys = Object.keys(srv.env).filter(k =>
      ['token', 'key', 'secret', 'password', 'credential', 'auth'].some(p => k.toLowerCase().includes(p))
    );
    if (secretKeys.length > 0) {
      const sb = document.createElement('span');
      sb.className = 'secret-badge';
      sb.textContent = '\uD83D\uDD12 secrets';
      badges.appendChild(sb);
    }
  }

  tile.appendChild(badges);
  return tile;
}

// ── Global section ──────────────────────────────────────────────

function renderGlobalSection(container) {
  const universalServers = (state.groups.__universal__?.servers || []).sort();
  if (universalServers.length === 0) return;

  const section = document.createElement('div');
  section.className = 'global-section';

  // Header
  const header = document.createElement('div');
  header.className = 'global-header';

  const icon = document.createElement('span');
  icon.className = 'global-icon';
  icon.textContent = '\uD83C\uDF10';

  const titleCol = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'global-title';
  title.textContent = 'Global';
  const subtitle = document.createElement('div');
  subtitle.className = 'global-subtitle';
  subtitle.textContent = 'Applies everywhere \u2014 these servers are available in all workspace groups';
  titleCol.append(title, subtitle);
  header.append(icon, titleCol);
  section.appendChild(header);

  // Server tiles in the global section
  const grid = document.createElement('div');
  grid.className = 'global-servers';
  for (const name of universalServers) {
    grid.appendChild(createServerTile(name, true));
  }
  section.appendChild(grid);
  container.appendChild(section);
}

// ── Drop zones ──────────────────────────────────────────────────

function renderDropZones(container) {
  const groups = Object.entries(state.groups)
    .filter(([k]) => k !== '__universal__')
    .sort((a, b) => (a[1].label || a[0]).localeCompare(b[1].label || b[0]));

  if (groups.length === 0) return;

  const section = document.createElement('div');
  section.style.marginTop = '24px';

  const title = document.createElement('h2');
  title.style.cssText = 'font-size:14px;color:var(--text-dim);margin-bottom:12px;font-weight:500';
  title.textContent = 'Drop to Assign';
  section.appendChild(title);

  for (const [key, group] of groups) {
    const zone = document.createElement('div');
    zone.className = 'drop-zone';
    zone.dataset.group = key;

    const serverCount = (group.servers || []).length;
    zone.textContent = `${group.label || key} (${serverCount} servers)`;

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zone.classList.add('over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('over');
      const serverName = state.dragServer || e.dataTransfer.getData('text/plain');
      if (!serverName) return;
      showConfirmDialog(serverName, key, group);
    });

    section.appendChild(zone);
  }
  container.appendChild(section);
}

// ── Confirmation dialog ─────────────────────────────────────────

function showConfirmDialog(serverName, groupKey, group) {
  const overlay = document.getElementById('confirm-overlay');
  const titleEl = document.getElementById('confirm-title');
  const textEl = document.getElementById('confirm-text');
  const okBtn = document.getElementById('confirm-ok');
  const cancelBtn = document.getElementById('confirm-cancel');

  titleEl.textContent = `Assign ${serverName}?`;
  textEl.textContent = `Add ${serverName} to ${group.label || groupKey}. This will deploy to all repos in this group.`;

  overlay.classList.add('active');

  const doConfirm = async () => {
    overlay.classList.remove('active');
    cleanup();
    await api.post('/assign', { server: serverName, group: groupKey });
    state.pendingGroups.add(groupKey);
    renderPendingBanner();
    import('./toast.js').then(m => m.showToast(`Assigned ${serverName}. Deploy pending.`, 'success'));
    await loadData();
  };

  const doCancel = () => {
    overlay.classList.remove('active');
    cleanup();
  };

  function cleanup() {
    okBtn.removeEventListener('click', doConfirm);
    cancelBtn.removeEventListener('click', doCancel);
  }

  okBtn.addEventListener('click', doConfirm);
  cancelBtn.addEventListener('click', doCancel);
}

// ── Main render ─────────────────────────────────────────────────

export function renderServersView() {
  const container = document.getElementById('view-servers');
  container.textContent = '';

  // Also update the old elements for backward compat
  const cardsTitle = document.getElementById('cards-title');
  if (cardsTitle) cardsTitle.textContent = 'Servers';

  // Global section
  renderGlobalSection(container);

  // All non-universal servers
  const universalSet = new Set(state.groups.__universal__?.servers || []);
  const allServers = Object.keys(state.servers).filter(s => !universalSet.has(s)).sort();

  if (allServers.length > 0) {
    const title = document.createElement('h2');
    title.style.cssText = 'font-size:14px;color:var(--text-dim);margin-bottom:12px;font-weight:500';
    title.textContent = `All Servers (${allServers.length})`;
    container.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'cards-grid';
    for (const name of allServers) {
      grid.appendChild(createServerTile(name));
    }
    container.appendChild(grid);
  }

  // Drop zones
  renderDropZones(container);
}

// ── Scan Banner (Non-blocking, parallel lanes) ──────────────────

const scanBanner = document.getElementById('scan-banner');
const scanLog = document.getElementById('scan-log');
const scanBannerText = document.getElementById('scan-banner-text');
const scanBannerDetail = document.getElementById('scan-banner-detail');
const scanToggle = document.getElementById('scan-toggle');
const lanes = {};

function startScan() {
  scanLog.textContent = '';
  scanBannerText.textContent = 'Scanning 3 sources in parallel...';
  scanBanner.classList.add('active');
  scanBanner.classList.remove('done');
  state.scanning = true;

  // Reset lanes
  for (const k of Object.keys(lanes)) delete lanes[k];

  // Create lanes container
  const lanesContainer = document.createElement('div');
  lanesContainer.className = 'scan-lanes';
  lanesContainer.id = 'scan-lanes';
  scanLog.appendChild(lanesContainer);

  // Merge section
  const mergeSection = document.createElement('div');
  mergeSection.id = 'scan-merge';
  mergeSection.style.display = 'none';
  scanLog.appendChild(mergeSection);
}

function createLaneEl(lane, label, detail) {
  const el = document.createElement('div');
  el.className = 'scan-lane';
  el.id = `scan-lane-${lane}`;

  const hdr = document.createElement('div');
  hdr.className = 'scan-lane-header';

  const icon = document.createElement('span');
  icon.className = 'scan-lane-icon';
  const spinner = document.createElement('span');
  spinner.className = 'scan-spinner';
  icon.appendChild(spinner);

  const name = document.createElement('span');
  name.className = 'scan-lane-name';
  name.textContent = label;

  const status = document.createElement('span');
  status.className = 'scan-lane-status';
  status.textContent = detail;

  hdr.append(icon, name, status);
  el.appendChild(hdr);

  const results = document.createElement('div');
  results.className = 'scan-lane-results';
  el.appendChild(results);

  lanes[lane] = { el, icon, status, results, done: false };
  return el;
}

function completeLane(lane, detail, tags) {
  const l = lanes[lane];
  if (!l) return;

  l.done = true;
  l.icon.textContent = '\u2713';
  l.icon.style.color = 'var(--green)';
  l.el.classList.add('scan-lane-done');
  l.status.textContent = detail;

  if (tags?.length) {
    const container = document.createElement('div');
    container.className = 'scan-server-list';
    for (const s of tags) {
      const tag = document.createElement('span');
      tag.className = 'scan-server-tag';
      tag.textContent = s;
      container.appendChild(tag);
    }
    l.results.appendChild(container);
  }

  // Update banner text with completed count
  const doneCount = Object.values(lanes).filter(x => x.done).length;
  const total = Object.keys(lanes).length;
  scanBannerText.textContent = `Scanning... ${doneCount}/${total} sources complete`;
}

export function handleScanProgress(data) {
  if (!state.scanning) return;
  const lanesContainer = document.getElementById('scan-lanes');

  switch (data.step) {
    case 'parallel_start':
      break;

    case 'lane_start': {
      const el = createLaneEl(data.lane, data.label, data.detail);
      if (lanesContainer) lanesContainer.appendChild(el);
      break;
    }

    case 'lane_done': {
      let tags = data.servers || [];
      if (data.lane === 'groups' && data.groups) {
        tags = data.groups.map(g => `${g.label} (${g.repos})`);
      }
      completeLane(data.lane, data.detail, tags);
      break;
    }

    case 'lane_error': {
      const l = lanes[data.lane];
      if (l) {
        l.done = true;
        l.el.classList.add('scan-lane-error');
        l.icon.textContent = '\u2717';
        l.icon.style.color = 'var(--red)';
        l.status.textContent = `Error: ${data.detail}`;
      }
      break;
    }

    case 'merge_start': {
      const merge = document.getElementById('scan-merge');
      if (merge) {
        merge.style.display = '';
        merge.textContent = '';
        const line = document.createElement('div');
        line.className = 'scan-line';
        const icon = document.createElement('span');
        icon.className = 'scan-icon';
        const spinner = document.createElement('span');
        spinner.className = 'scan-spinner';
        icon.appendChild(spinner);
        const txt = document.createElement('span');
        const phase = document.createElement('span');
        phase.className = 'scan-phase';
        phase.textContent = 'Merge';
        const det = document.createElement('span');
        det.className = 'scan-detail';
        det.textContent = ` ${data.detail}`;
        txt.append(phase, det);
        line.append(icon, txt);
        merge.appendChild(line);
      }
      scanBannerText.textContent = 'Merging results...';
      break;
    }

    case 'merge_done': {
      const merge = document.getElementById('scan-merge');
      if (merge) {
        const line = merge.querySelector('.scan-line');
        if (line) {
          const icon = line.querySelector('.scan-icon');
          icon.textContent = '\u2713';
          icon.style.color = 'var(--green)';
          line.querySelector('.scan-detail').textContent = ` ${data.detail}`;
        }

        const summary = document.createElement('div');
        summary.className = 'scan-summary';
        const t1 = document.createTextNode('Scan complete: ');
        const s1 = document.createElement('strong');
        s1.textContent = `${data.servers_found} servers`;
        const t2 = document.createTextNode(', ');
        const s2 = document.createElement('strong');
        s2.textContent = `${data.groups_found} groups`;
        const t3 = document.createTextNode(' discovered.');
        summary.append(t1, s1, t2, s2, t3);
        merge.appendChild(summary);
      }

      // Update banner to done state
      scanBannerText.textContent = `Scan complete: ${data.servers_found} servers, ${data.groups_found} groups`;
      scanBanner.classList.add('done');
      const bannerIcon = scanBanner.querySelector('.scan-banner-icon');
      bannerIcon.textContent = '\u2713';
      bannerIcon.style.color = 'var(--green)';

      state.scanning = false;
      loadData();

      // Auto-hide after 5s
      setTimeout(() => {
        if (!scanBannerDetail.classList.contains('expanded')) {
          scanBanner.classList.remove('active');
        }
      }, 5000);
      break;
    }
  }

  // Auto-scroll detail if expanded
  if (scanBannerDetail.classList.contains('expanded')) {
    scanBannerDetail.scrollTop = scanBannerDetail.scrollHeight;
  }
}

// ── Scan event listeners ─────────────────────────────────────────

scanToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  scanBannerDetail.classList.toggle('expanded');
  scanToggle.textContent = scanBannerDetail.classList.contains('expanded') ? 'Hide' : 'Details';
});

document.getElementById('scan-banner-bar').addEventListener('click', () => {
  scanBannerDetail.classList.toggle('expanded');
  scanToggle.textContent = scanBannerDetail.classList.contains('expanded') ? 'Hide' : 'Details';
});

document.getElementById('btn-scan').addEventListener('click', () => {
  startScan();
  api.post('/scan');
});
