/**
 * MCP Registry — uhtml SPA
 *
 * Tree navigation, server cards, drag-and-drop assignment,
 * live scan page, deploy preview page, SSE live updates.
 *
 * Note: innerHTML usage below operates on trusted data from our own local API
 * (server names and filesystem paths). No external/user-supplied HTML is rendered.
 */

import { html, render } from './uhtml.js';

// ── State ────────────────────────────────────────────────────────

let state = {
  servers: {},
  groups: {},
  activeGroup: null,
  dragServer: null,
  scanning: false,
  deploying: false,
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

async function loadData() {
  const [servers, groups] = await Promise.all([
    api.get('/servers'),
    api.get('/groups'),
  ]);
  state.servers = servers;
  state.groups = groups;
  renderAll();
}

// ── Tree rendering ───────────────────────────────────────────────

let expandedNodes = new Set(['__root__']);

function toggleExpand(key, e) {
  e.stopPropagation();
  if (expandedNodes.has(key)) expandedNodes.delete(key);
  else expandedNodes.add(key);
  renderTree();
}

function serverLeaf(name, inherited) {
  const srv = state.servers[name];
  if (!srv) return '';
  const health = srv.health || 'unknown';
  return html`
    <div class=${`tree-leaf${inherited ? ' inherited' : ''}`}
         draggable=${!inherited}
         ondragstart=${!inherited ? (e) => onDragStart(e, name) : null}
         ondragend=${!inherited ? (e) => onDragEnd(e) : null}
         title=${inherited ? 'Inherited from user scope' : name}>
      <span class=${`health-dot health-${health.replace(/\s+/g, '-')}`}></span>
      <span class="tree-leaf-name">${name}</span>
      ${inherited ? html`<span class="inherited-badge">↑</span>` : ''}
    </div>
  `;
}

function renderTree() {
  const tree = document.getElementById('tree');

  // User-scoped servers = everything actually installed at user scope
  const userServers = Object.entries(state.servers)
    .filter(([, srv]) => (srv.source_scope || 'user') === 'user')
    .map(([name]) => name)
    .sort();

  // Workspace groups (everything except __universal__)
  const groups = Object.entries(state.groups)
    .filter(([k]) => k !== '__universal__')
    .sort((a, b) => a[1].label.localeCompare(b[1].label));

  // Unassigned = not in any group at all
  const assigned = new Set();
  for (const g of Object.values(state.groups)) {
    for (const s of g.servers || []) assigned.add(s);
  }
  const unassigned = Object.keys(state.servers).filter(s => !assigned.has(s));

  const rootExpanded = expandedNodes.has('__root__');

  render(tree, html`
    <!-- User root node -->
    <div class="tree-node tree-root">
      <div class=${`tree-item tree-user ${state.activeGroup === '__universal__' ? 'active' : ''}`}
           onclick=${() => { state.activeGroup = '__universal__'; renderAll(); }}
           ondragover=${(e) => onDragOver(e, '__universal__')}
           ondragleave=${(e) => onDragLeave(e)}
           ondrop=${(e) => onDrop(e, '__universal__')}>
        <span class=${`tree-arrow ${rootExpanded ? 'open' : ''}`}
              onclick=${(e) => toggleExpand('__root__', e)}>▶</span>
        <span class="tree-icon-user">⊕</span>
        <span class="tree-label tree-label-root">dshanklinbv</span>
        <span class="count">${Object.keys(state.servers).length}</span>
      </div>

      ${rootExpanded ? html`
        <div class="tree-children depth-0">
          <!-- User-scoped servers (at the top, direct children of user) -->
          ${userServers.map(name => serverLeaf(name, false))}

          <!-- Workspace groups -->
          ${groups.map(([key, group]) => {
            const expanded = expandedNodes.has(key);
            const ownServers = (group.servers || []).slice().sort();
            const inheritedServers = userServers.filter(s => !ownServers.includes(s));

            return html`
              <div class="tree-node" data-group=${key}>
                <div class=${`tree-item tree-group ${state.activeGroup === key ? 'active' : ''}`}
                     onclick=${() => { state.activeGroup = key; renderAll(); }}
                     ondragover=${(e) => onDragOver(e, key)}
                     ondragleave=${(e) => onDragLeave(e)}
                     ondrop=${(e) => onDrop(e, key)}>
                  <span class=${`tree-arrow ${expanded ? 'open' : ''} ${ownServers.length === 0 && inheritedServers.length === 0 ? 'empty' : ''}`}
                        onclick=${(e) => toggleExpand(key, e)}>▶</span>
                  <span class="tree-icon-folder">${group._missing ? '💀' : expanded ? '📂' : '📁'}</span>
                  <span class="tree-label">${group.label}</span>
                  <span class="count">${ownServers.length}</span>
                </div>
                ${expanded ? html`
                  <div class="tree-children depth-1">
                    ${ownServers.map(name => serverLeaf(name, false))}
                    ${inheritedServers.length > 0 ? html`
                      <div class="inherited-divider"><span>inherited</span></div>
                      ${inheritedServers.map(name => serverLeaf(name, true))}
                    ` : ''}
                    ${ownServers.length === 0 && inheritedServers.length === 0 ? html`
                      <div class="tree-empty">Drop servers here</div>
                    ` : ''}
                  </div>
                ` : ''}
              </div>
            `;
          })}

          <!-- Unassigned -->
          ${unassigned.length > 0 ? html`
            <div class="tree-node">
              <div class=${`tree-item tree-group ${state.activeGroup === '__unassigned__' ? 'active' : ''}`}
                   onclick=${() => { state.activeGroup = '__unassigned__'; renderAll(); }}>
                <span class=${`tree-arrow ${expandedNodes.has('__unassigned__') ? 'open' : ''}`}
                      onclick=${(e) => toggleExpand('__unassigned__', e)}>▶</span>
                <span class="tree-icon-folder">⚠</span>
                <span class="tree-label unassigned-label">Unassigned</span>
                <span class="count warn">${unassigned.length}</span>
              </div>
              ${expandedNodes.has('__unassigned__') ? html`
                <div class="tree-children depth-1">
                  ${unassigned.sort().map(name => serverLeaf(name, false))}
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `);
}

// ── Cards rendering ──────────────────────────────────────────────

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
  document.getElementById('stats').textContent =
    `${Object.keys(state.servers).length} servers | ${Object.keys(state.groups).length} groups`;
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
  document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
}

function onDragOver(e) {
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

function handleScanProgress(data) {
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

// Toggle detail expansion
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

// ── Deploy Page ──────────────────────────────────────────────────

const deployOverlay = document.getElementById('deploy-overlay');
const deployBody = document.getElementById('deploy-body');
let deployPreviewData = null;
let deployChecked = new Set();
let deployGroupState = {};  // groupKey → 'pending' | 'deploying' | 'done' | 'error'

async function openDeployPage() {
  deployOverlay.classList.add('active');
  deployBody.textContent = '';
  deployChecked.clear();
  deployGroupState = {};

  const loading = document.createElement('div');
  loading.style.cssText = 'padding:40px;text-align:center;color:var(--text-dim)';
  loading.textContent = 'Computing changes...';
  deployBody.appendChild(loading);

  deployPreviewData = await api.post('/deploy/preview');
  renderDeployGroups();
}

function renderDeployGroups() {
  deployBody.textContent = '';
  const goBtn = document.getElementById('deploy-go');

  if (!deployPreviewData || deployPreviewData.changes === 0) {
    goBtn.style.display = 'none';
    deployBody.innerHTML = `
      <div style="padding:40px;text-align:center;color:var(--text-dim)">
        <div style="font-size:48px;margin-bottom:16px">\u2705</div>
        <h3 style="color:var(--text);margin-bottom:8px">Nothing to deploy</h3>
        <p>Assign servers to groups first, then deploy to propagate .mcp.json files.</p>
      </div>`;
    return;
  }

  // Group changes by registry group key
  const byGroup = {};
  for (const [path, info] of Object.entries(deployPreviewData.files)) {
    const gk = info.group || 'unknown';
    if (!byGroup[gk]) byGroup[gk] = { repos: [], creates: 0, updates: 0, servers: new Set(), notIgnored: 0, allOverwrites: new Set() };
    const parts = path.split('/');
    const repoName = parts[parts.length - 2];
    byGroup[gk].repos.push({ path, repoName, ...info });
    if (info.action === 'create') byGroup[gk].creates++;
    else byGroup[gk].updates++;
    if (!info.gitignored) byGroup[gk].notIgnored++;
    for (const s of info.servers) byGroup[gk].servers.add(s);
    for (const s of (info.overwrites || [])) byGroup[gk].allOverwrites.add(s);
  }

  // Render each group as a selectable card
  for (const [groupKey, data] of Object.entries(byGroup).sort((a, b) => a[0].localeCompare(b[0]))) {
    const groupLabel = state.groups[groupKey]?.label || groupKey;
    const gState = deployGroupState[groupKey] || 'pending';
    const checked = deployChecked.has(groupKey);

    const card = document.createElement('div');
    card.className = `deploy-group-card ${gState}`;

    // Header row: checkbox + name + status badge
    const header = document.createElement('div');
    header.className = 'deploy-group-header';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.disabled = gState === 'deploying' || gState === 'done';
    cb.addEventListener('change', () => {
      if (cb.checked) deployChecked.add(groupKey);
      else deployChecked.delete(groupKey);
      updateDeployButton();
    });

    const label = document.createElement('span');
    label.className = 'deploy-group-name';
    label.textContent = groupLabel;

    const badge = document.createElement('span');
    badge.className = `deploy-status-badge status-${gState}`;
    badge.textContent = gState === 'pending' ? 'Pending'
      : gState === 'deploying' ? 'Deploying...'
      : gState === 'done' ? 'Up-to-Date'
      : 'Error';

    header.append(cb, label, badge);
    card.appendChild(header);

    // Summary line
    const summary = document.createElement('div');
    summary.className = 'deploy-group-summary';
    const actionParts = [];
    if (data.creates > 0) actionParts.push(`${data.creates} create`);
    if (data.updates > 0) actionParts.push(`${data.updates} update`);
    summary.textContent = `${data.repos.length} repos \u00B7 ${actionParts.join(', ')} \u00B7 ${data.servers.size} servers`;
    card.appendChild(summary);

    // Server tags
    const srvRow = document.createElement('div');
    srvRow.className = 'deploy-servers';
    for (const s of [...data.servers].sort()) {
      const tag = document.createElement('span');
      tag.className = 'srv-tag';
      tag.textContent = s;
      srvRow.appendChild(tag);
    }
    card.appendChild(srvRow);

    // Expandable repo list
    const toggle = document.createElement('button');
    toggle.className = 'btn deploy-expand-btn';
    toggle.textContent = 'Show repos';
    toggle.style.marginTop = '8px';
    toggle.style.fontSize = '11px';

    const repoList = document.createElement('div');
    repoList.className = 'deploy-repo-list';
    repoList.style.display = 'none';

    for (const repo of data.repos.sort((a, b) => a.repoName.localeCompare(b.repoName))) {
      const row = document.createElement('div');
      row.className = 'deploy-repo-row';
      const rn = document.createElement('span');
      rn.textContent = repo.repoName;
      const ab = document.createElement('span');
      ab.className = `action-badge ${repo.action === 'create' ? 'action-create' : 'action-update'}`;
      ab.textContent = repo.action;
      row.append(rn, ab);
      repoList.appendChild(row);
    }

    toggle.addEventListener('click', () => {
      const showing = repoList.style.display !== 'none';
      repoList.style.display = showing ? 'none' : '';
      toggle.textContent = showing ? 'Show repos' : 'Hide repos';
    });

    // Absolute path warning — .mcp.json will contain machine-specific paths
    const hasAbsPaths = [...data.servers].some(name => {
      const srv = state.servers[name];
      return srv && (
        (srv.command && srv.command.startsWith('/')) ||
        (srv.args && srv.args.some(a => typeof a === 'string' && a.startsWith('/')))
      );
    });
    if (hasAbsPaths && gState === 'pending') {
      const warn = document.createElement('div');
      warn.className = 'deploy-warning';
      warn.textContent = '\u26A0 Contains absolute paths \u2014 .mcp.json will be machine-specific. Add to .gitignore if sharing this repo.';
      card.appendChild(warn);
    }

    // Overwrite warning — servers in existing .mcp.json that we'd remove
    if (data.allOverwrites.size > 0 && gState === 'pending') {
      const warn = document.createElement('div');
      warn.className = 'deploy-warning';
      warn.textContent = `\u26A0 Will remove existing servers from .mcp.json: ${[...data.allOverwrites].join(', ')}`;
      card.appendChild(warn);
    }

    // Gitignore warning
    if (data.notIgnored > 0 && gState === 'pending') {
      const warn = document.createElement('div');
      warn.className = 'deploy-warning';
      warn.textContent = `\u26A0 ${data.notIgnored} repo${data.notIgnored > 1 ? 's' : ''} don\u2019t have .mcp.json in .gitignore \u2014 deploy will create dirty working trees.`;
      card.appendChild(warn);
    }

    card.append(toggle, repoList);
    deployBody.appendChild(card);
  }

  updateDeployButton();
}

function updateDeployButton() {
  const goBtn = document.getElementById('deploy-go');
  const n = deployChecked.size;
  if (n === 0) {
    goBtn.textContent = 'Select groups to deploy';
    goBtn.disabled = true;
    goBtn.style.display = '';
  } else {
    goBtn.textContent = `Deploy ${n} group${n > 1 ? 's' : ''}`;
    goBtn.disabled = false;
    goBtn.style.display = '';
  }
}

function handleDeployProgress(data) {
  if (!state.deploying) return;
  let prog = deployBody.querySelector('.deploy-progress');
  if (!prog) {
    prog = document.createElement('div');
    prog.className = 'deploy-progress';

    const txt = document.createElement('div');
    txt.className = 'progress-text';
    txt.textContent = 'Deploying...';

    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = '0%';
    bar.appendChild(fill);

    prog.append(txt, bar);
    deployBody.prepend(prog);
  }

  const txt = prog.querySelector('.progress-text');
  const fill = prog.querySelector('.progress-fill');

  if (data.step === 'write') {
    const pct = Math.round((data.progress / data.total) * 100);
    txt.textContent = `Writing ${data.progress}/${data.total}: ${data.path.split('/').pop()}`;
    fill.style.width = pct + '%';
  } else if (data.step === 'remove_user') {
    txt.textContent = `Removed from user scope: ${data.server}`;
  }
}

document.getElementById('btn-deploy').addEventListener('click', () => {
  openDeployPage();
});

document.getElementById('deploy-close').addEventListener('click', () => {
  deployOverlay.classList.remove('active');
  state.deploying = false;
});

document.getElementById('deploy-back').addEventListener('click', () => {
  deployOverlay.classList.remove('active');
  state.deploying = false;
});

document.getElementById('deploy-go').addEventListener('click', async () => {
  if (deployChecked.size === 0) return;
  const selectedGroups = [...deployChecked];

  state.deploying = true;
  const btn = document.getElementById('deploy-go');
  btn.disabled = true;
  btn.textContent = 'Deploying...';

  // Mark selected groups as deploying
  for (const gk of selectedGroups) deployGroupState[gk] = 'deploying';
  renderDeployGroups();

  const result = await api.post('/deploy', { groups: selectedGroups });

  state.deploying = false;

  // Mark groups as done or error
  const errorPaths = new Set((result.errors || []).map(e => e.path));
  for (const gk of selectedGroups) {
    // Check if any errors belong to this group
    const groupHasErrors = Object.entries(deployPreviewData.files)
      .some(([p, info]) => info.group === gk && errorPaths.has(p));
    deployGroupState[gk] = groupHasErrors ? 'error' : 'done';
  }
  deployChecked.clear();

  // Re-render with updated states
  renderDeployGroups();

  document.getElementById('deploy-status').textContent =
    `Deployed: ${result.written?.length || 0} files` +
    (result.errors?.length ? ` (${result.errors.length} errors)` : '');
});

// ── Editor Panel ─────────────────────────────────────────────────

const editorPanel = document.getElementById('editor-panel');
const editorBackdrop = document.getElementById('editor-backdrop');
const editorBody = document.getElementById('editor-body');
const editorTitle = document.getElementById('editor-title');
const editorStatus = document.getElementById('editor-status');
let editingServer = null;

function openEditor(serverName) {
  const srv = state.servers[serverName];
  if (!srv) return;

  editingServer = serverName;
  editorTitle.textContent = serverName;
  editorStatus.textContent = '';
  editorBody.textContent = '';

  // Health badge
  const healthEl = document.createElement('div');
  healthEl.className = 'editor-health';
  const dot = document.createElement('span');
  const health = srv.health || 'unknown';
  dot.className = `health-dot health-${health.replace(/\s+/g, '-')}`;
  const htxt = document.createElement('span');
  htxt.textContent = health;
  healthEl.append(dot, htxt);
  editorBody.appendChild(healthEl);

  // Type field
  addSelectField('type', 'Type', ['stdio', 'sse', 'streamable-http', 'http'], srv.type || 'stdio');

  // Command field
  addTextField('command', 'Command', srv.command || '');

  // Args field (as JSON array)
  const argsVal = Array.isArray(srv.args) ? JSON.stringify(srv.args) : (srv.args || '[]');
  addTextAreaField('args', 'Args (JSON array)', argsVal);

  // Source scope
  addSelectField('source_scope', 'Source Scope', ['user', 'project', 'local'], srv.source_scope || 'user');

  // Env vars
  addEnvEditor('env', srv.env || {});

  editorPanel.classList.add('open');
  editorBackdrop.classList.add('open');
}

function closeEditor() {
  editorPanel.classList.remove('open');
  editorBackdrop.classList.remove('open');
  editingServer = null;
}

function addTextField(id, label, value) {
  const field = document.createElement('div');
  field.className = 'editor-field';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  lbl.setAttribute('for', `edit-${id}`);
  const input = document.createElement('input');
  input.type = 'text';
  input.id = `edit-${id}`;
  input.value = value;
  field.append(lbl, input);
  editorBody.appendChild(field);
}

function addTextAreaField(id, label, value) {
  const field = document.createElement('div');
  field.className = 'editor-field';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  lbl.setAttribute('for', `edit-${id}`);
  const ta = document.createElement('textarea');
  ta.id = `edit-${id}`;
  ta.value = value;
  field.append(lbl, ta);
  editorBody.appendChild(field);
}

function addSelectField(id, label, options, selected) {
  const field = document.createElement('div');
  field.className = 'editor-field';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  lbl.setAttribute('for', `edit-${id}`);
  const sel = document.createElement('select');
  sel.id = `edit-${id}`;
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    if (opt === selected) o.selected = true;
    sel.appendChild(o);
  }
  field.append(lbl, sel);
  editorBody.appendChild(field);
}

function addEnvEditor(id, envObj) {
  const field = document.createElement('div');
  field.className = 'editor-field';
  const lbl = document.createElement('label');
  lbl.textContent = 'Environment Variables';
  field.appendChild(lbl);

  const container = document.createElement('div');
  container.id = 'env-rows';

  const entries = Object.entries(envObj);
  if (entries.length === 0) {
    addEnvRow(container, '', '');
  } else {
    for (const [k, v] of entries) {
      addEnvRow(container, k, v);
    }
  }

  field.appendChild(container);

  // Add button
  const addBtn = document.createElement('button');
  addBtn.className = 'btn';
  addBtn.textContent = '+ Add Variable';
  addBtn.style.marginTop = '6px';
  addBtn.style.fontSize = '12px';
  addBtn.addEventListener('click', () => addEnvRow(container, '', ''));
  field.appendChild(addBtn);

  editorBody.appendChild(field);
}

function addEnvRow(container, key, value) {
  const row = document.createElement('div');
  row.className = 'editor-env-row';

  const keyInput = document.createElement('input');
  keyInput.className = 'env-key';
  keyInput.placeholder = 'KEY';
  keyInput.value = key;

  const valInput = document.createElement('input');
  valInput.className = 'env-val';
  valInput.placeholder = 'value';
  valInput.value = value;
  // Mask secret-looking values
  if (value && (key.toLowerCase().includes('token') || key.toLowerCase().includes('key') ||
      key.toLowerCase().includes('secret') || key.toLowerCase().includes('password'))) {
    valInput.type = 'password';
    valInput.addEventListener('focus', () => { valInput.type = 'text'; });
    valInput.addEventListener('blur', () => { valInput.type = 'password'; });
  }

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn btn-icon';
  removeBtn.textContent = '\u00D7';
  removeBtn.addEventListener('click', () => row.remove());

  row.append(keyInput, valInput, removeBtn);
  container.appendChild(row);
}

function collectEditorData() {
  const data = {};
  data.type = document.getElementById('edit-type')?.value;
  data.command = document.getElementById('edit-command')?.value;
  data.source_scope = document.getElementById('edit-source_scope')?.value;

  // Parse args
  const argsRaw = document.getElementById('edit-args')?.value || '[]';
  try {
    data.args = JSON.parse(argsRaw);
  } catch {
    data.args = argsRaw.split(/\s+/).filter(Boolean);
  }

  // Collect env vars
  const env = {};
  const rows = document.querySelectorAll('#env-rows .editor-env-row');
  for (const row of rows) {
    const k = row.querySelector('.env-key')?.value?.trim();
    const v = row.querySelector('.env-val')?.value;
    if (k) env[k] = v || '';
  }
  data.env = env;

  return data;
}

document.getElementById('editor-save').addEventListener('click', async () => {
  if (!editingServer) return;
  const data = collectEditorData();
  const btn = document.getElementById('editor-save');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    await fetch(`/servers/${encodeURIComponent(editingServer)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    editorStatus.textContent = '';
    const saved = document.createElement('span');
    saved.className = 'editor-saved';
    saved.textContent = '\u2713 Saved';
    editorStatus.appendChild(saved);
    await loadData();
  } catch (err) {
    editorStatus.textContent = 'Error: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
});

document.getElementById('editor-close').addEventListener('click', closeEditor);
document.getElementById('editor-cancel').addEventListener('click', closeEditor);
editorBackdrop.addEventListener('click', closeEditor);

// ── Wire cards to open editor on click ───────────────────────────

// We need to intercept card clicks but not interfere with drag.
// Use mousedown/mouseup tracking: if no drag happened, it's a click.
let cardMouseDownTime = 0;
document.addEventListener('mousedown', (e) => {
  const card = e.target.closest('.server-card');
  if (card) cardMouseDownTime = Date.now();
});
document.addEventListener('mouseup', (e) => {
  const card = e.target.closest('.server-card');
  if (card && Date.now() - cardMouseDownTime < 200) {
    const name = card.querySelector('.name')?.textContent?.trim();
    if (name) openEditor(name);
  }
});

// ── Tree resize handle ───────────────────────────────────────────

const treeEl = document.getElementById('tree');
const resizeHandle = document.getElementById('tree-resize');

resizeHandle.addEventListener('mousedown', (e) => {
  e.preventDefault();
  resizeHandle.classList.add('dragging');
  const startX = e.clientX;
  const startW = treeEl.offsetWidth;

  function onMove(ev) {
    const w = Math.max(160, Math.min(500, startW + ev.clientX - startX));
    treeEl.style.width = w + 'px';
  }
  function onUp() {
    resizeHandle.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
});

// ── Init ─────────────────────────────────────────────────────────

console.log('[MCP Registry] JS module loaded, calling loadData...');
loadData().then(() => {
  console.log('[MCP Registry] loadData complete, connecting SSE...');
  connectSSE();
}).catch(err => {
  console.error('[MCP Registry] loadData failed:', err);
});
