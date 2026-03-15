/**
 * Groups view — groups list with global pinned section, group detail page
 * with accordion servers, gitignore banner, deploy history, secrets masking.
 * Also hosts the deploy overlay and deploy progress handler.
 *
 * Note: innerHTML usage below operates on trusted data from our own local API
 * (server names and filesystem paths). No external/user-supplied HTML is rendered.
 */

import { state, api, loadData, renderPendingBanner } from './registry.js';
import { showToast } from './toast.js';

// ── State ────────────────────────────────────────────────────────

let selectedGroup = null;
let _groupDeploying = false;

const SECRET_PATTERNS = ['token', 'key', 'secret', 'password', 'credential', 'auth'];

function hasSecretKeys(env) {
  if (!env) return false;
  return Object.keys(env).some(k =>
    SECRET_PATTERNS.some(p => k.toLowerCase().includes(p))
  );
}

// ── Groups List View ─────────────────────────────────────────────

function renderGlobalPinned(container) {
  const universalServers = (state.groups.__universal__?.servers || []).sort();

  const section = document.createElement('div');
  section.className = 'global-section';
  section.style.marginBottom = '20px';

  const header = document.createElement('div');
  header.className = 'global-header';
  const icon = document.createElement('span');
  icon.className = 'global-icon';
  icon.textContent = '\uD83C\uDF10';
  const titleCol = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'global-title';
  title.textContent = 'Global Servers';
  const sub = document.createElement('div');
  sub.className = 'global-subtitle';
  sub.textContent = 'These servers are inherited by every group';
  titleCol.append(title, sub);
  header.append(icon, titleCol);
  section.appendChild(header);

  if (universalServers.length > 0) {
    const tags = document.createElement('div');
    tags.className = 'global-servers';
    for (const name of universalServers) {
      const tag = document.createElement('span');
      tag.className = 'gc-tag gc-tag-inherited';
      tag.textContent = name;
      tags.appendChild(tag);
    }
    section.appendChild(tags);
  } else {
    const empty = document.createElement('div');
    empty.className = 'gc-empty';
    empty.textContent = 'No global servers configured';
    section.appendChild(empty);
  }

  container.appendChild(section);
}

function renderGroupCards(container) {
  const groups = Object.entries(state.groups)
    .filter(([k]) => k !== '__universal__')
    .sort((a, b) => (a[1].label || a[0]).localeCompare(b[1].label || b[0]));

  if (groups.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:var(--text-dim);padding:20px;text-align:center';
    empty.textContent = 'No workspace groups found. Run a scan to discover ~/repos-*/ directories.';
    container.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'cards-grid';

  for (const [key, group] of groups) {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.addEventListener('click', () => {
      selectedGroup = key;
      renderGroupsView();
    });

    const header = document.createElement('div');
    header.className = 'group-card-header';
    const iconEl = document.createElement('span');
    iconEl.className = 'group-card-icon';
    iconEl.textContent = group._missing ? '\uD83D\uDC80' : '\uD83D\uDCC1';
    const name = document.createElement('span');
    name.className = 'group-card-name';
    name.textContent = group.label || key;

    if (state.pendingGroups && state.pendingGroups.has(key)) {
      const pending = document.createElement('span');
      pending.className = 'deploy-status-badge status-pending';
      pending.textContent = 'pending';
      pending.style.fontSize = '10px';
      header.append(iconEl, name, pending);
    } else {
      header.append(iconEl, name);
    }
    card.appendChild(header);

    const stats = document.createElement('div');
    stats.className = 'group-card-stats';
    const serverCount = (group.servers || []).length;
    stats.textContent = `${serverCount} server${serverCount !== 1 ? 's' : ''} assigned`;
    card.appendChild(stats);

    if (group.path) {
      const path = document.createElement('div');
      path.className = 'group-card-path';
      path.textContent = group.path;
      card.appendChild(path);
    }

    grid.appendChild(card);
  }
  container.appendChild(grid);
}

// ── Group Detail Page ────────────────────────────────────────────

async function renderGitignoreBanner(container, groupKey) {
  try {
    const status = await api.get(`/groups/${encodeURIComponent(groupKey)}/gitignore`);
    if (status.not_ignored > 0) {
      const banner = document.createElement('div');
      banner.className = 'gitignore-banner';
      banner.textContent = `${status.not_ignored} of ${status.total} repos don't have .mcp.json in .gitignore`;

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Fix All';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Fixing...';
        const result = await api.post(`/groups/${encodeURIComponent(groupKey)}/gitignore`);
        btn.textContent = `Fixed ${result.added} repos`;
        showToast(`Added .mcp.json to .gitignore in ${result.added} repos`, 'success');
      });
      banner.appendChild(btn);
      container.appendChild(banner);
    }
  } catch (_e) {
    // silently skip if endpoint not available
  }
}

function renderAccordionServer(container, name, groupKey, isInherited) {
  const srv = state.servers[name] || {};
  const health = srv.health || 'unknown';

  const card = document.createElement('div');
  card.className = 'accordion-card';

  // Header
  const header = document.createElement('div');
  header.className = 'accordion-header';

  const dot = document.createElement('span');
  dot.className = `health-dot health-${health.replace(/\s+/g, '-')}`;

  const nameEl = document.createElement('span');
  nameEl.className = 'accordion-name';
  nameEl.textContent = name;

  const typeEl = document.createElement('span');
  typeEl.className = 'type-badge';
  typeEl.textContent = srv.type || 'stdio';

  const chevron = document.createElement('span');
  chevron.className = 'accordion-chevron';
  chevron.textContent = '\u25B6';

  header.append(dot, nameEl, typeEl);

  if (hasSecretKeys(srv.env)) {
    const lockBadge = document.createElement('span');
    lockBadge.className = 'secret-badge';
    lockBadge.textContent = '\uD83D\uDD12';
    header.appendChild(lockBadge);
  }

  if (isInherited) {
    const badge = document.createElement('span');
    badge.className = 'gc-badge-inherited';
    badge.textContent = 'universal';
    header.appendChild(badge);
  } else {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn';
    removeBtn.textContent = '\u00D7';
    removeBtn.style.cssText = 'padding:2px 8px;font-size:14px';
    removeBtn.title = 'Unassign from group';
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await api.post('/unassign', { server: name, group: groupKey });
      if (state.pendingGroups) state.pendingGroups.add(groupKey);
      await loadData();
      renderGroupsView();
    });
    header.appendChild(removeBtn);
  }

  header.appendChild(chevron);
  card.appendChild(header);

  // Body (expandable)
  const body = document.createElement('div');
  body.className = 'accordion-body';

  if (srv.command) {
    const sec = document.createElement('div');
    sec.className = 'accordion-section';
    const secTitle = document.createElement('div');
    secTitle.className = 'accordion-section-title';
    secTitle.textContent = 'Command';
    const cmd = document.createElement('code');
    cmd.style.cssText = 'font-size:12px;color:var(--text)';
    cmd.textContent = `${srv.command} ${(srv.args || []).join(' ')}`;
    sec.append(secTitle, cmd);
    body.appendChild(sec);
  }

  if (srv.env && Object.keys(srv.env).length > 0) {
    const sec = document.createElement('div');
    sec.className = 'accordion-section';
    const secTitle = document.createElement('div');
    secTitle.className = 'accordion-section-title';
    secTitle.textContent = 'Environment';
    sec.appendChild(secTitle);
    for (const [k, v] of Object.entries(srv.env)) {
      const row = document.createElement('div');
      row.style.cssText = 'font-size:12px;font-family:monospace;padding:2px 0';
      const isSecret = SECRET_PATTERNS.some(p => k.toLowerCase().includes(p));
      row.textContent = `${k}=${isSecret ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : v}`;
      sec.appendChild(row);
    }
    body.appendChild(sec);
  }

  const healthSec = document.createElement('div');
  healthSec.className = 'accordion-section';
  const healthTitle = document.createElement('div');
  healthTitle.className = 'accordion-section-title';
  healthTitle.textContent = 'Health';
  const healthText = document.createElement('span');
  healthText.style.cssText = `font-size:12px;color:var(--${health === 'connected' ? 'green' : health === 'failed' ? 'red' : 'text-dim'})`;
  healthText.textContent = health;
  healthSec.append(healthTitle, healthText);
  body.appendChild(healthSec);

  card.appendChild(body);

  header.addEventListener('click', () => {
    body.classList.toggle('open');
    chevron.classList.toggle('open');
  });

  container.appendChild(card);
}

function renderAvailableServers(container, groupKey) {
  const assigned = new Set(state.groups[groupKey]?.servers || []);
  const universal = new Set(state.groups.__universal__?.servers || []);
  const available = Object.keys(state.servers)
    .filter(s => !assigned.has(s) && !universal.has(s))
    .sort();

  if (available.length === 0) return;

  const toggle = document.createElement('button');
  toggle.className = 'btn';
  toggle.textContent = `Show available servers (${available.length})`;
  toggle.style.marginTop = '12px';

  const list = document.createElement('div');
  list.style.display = 'none';
  list.style.marginTop = '8px';

  for (const name of available) {
    const srv = state.servers[name] || {};
    const row = document.createElement('div');
    row.className = 'gc-server-row';

    const toggleInput = document.createElement('label');
    toggleInput.className = 'gc-toggle';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.addEventListener('change', async () => {
      await api.post('/assign', { server: name, group: groupKey });
      if (state.pendingGroups) state.pendingGroups.add(groupKey);
      await loadData();
      renderGroupsView();
    });
    const slider = document.createElement('span');
    slider.className = 'gc-toggle-slider';
    toggleInput.append(cb, slider);

    const dot = document.createElement('span');
    dot.className = `health-dot health-${(srv.health || 'unknown').replace(/\s+/g, '-')}`;
    const nameEl = document.createElement('span');
    nameEl.className = 'gc-server-name';
    nameEl.textContent = name;
    const typeEl = document.createElement('span');
    typeEl.className = 'gc-server-type';
    typeEl.textContent = srv.type || 'stdio';

    row.append(toggleInput, dot, nameEl, typeEl);
    list.appendChild(row);
  }

  toggle.addEventListener('click', () => {
    const showing = list.style.display !== 'none';
    list.style.display = showing ? 'none' : '';
    toggle.textContent = showing ? `Show available servers (${available.length})` : 'Hide available servers';
  });

  container.append(toggle, list);
}

function renderDeployButton(container, groupKey) {
  const isPending = state.pendingGroups && state.pendingGroups.has(groupKey);

  const wrapper = document.createElement('div');
  wrapper.className = 'gc-deploy';
  wrapper.style.marginTop = '16px';

  const btn = document.createElement('button');
  btn.className = 'btn btn-deploy-group';
  if (isPending) btn.style.background = 'var(--orange)';
  btn.textContent = isPending ? 'Deploy (pending)' : 'Deploy This Group';

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Deploying...';
    try {
      const result = await api.post('/deploy', { groups: [groupKey] });
      const written = result.written?.length || 0;
      const errors = result.errors?.length || 0;
      if (state.pendingGroups) state.pendingGroups.delete(groupKey);
      btn.textContent = errors > 0
        ? `Deployed ${written} repos (${errors} errors)`
        : `Deployed ${written} repos`;
      btn.classList.add('deployed');
      showToast(`Deployed to ${written} repos`, 'success');
      renderPendingBanner();
      setTimeout(() => {
        btn.classList.remove('deployed');
        btn.textContent = 'Deploy This Group';
        btn.disabled = false;
        btn.style.background = '';
      }, 3000);
    } catch (_err) {
      btn.textContent = 'Deploy failed';
      btn.disabled = false;
    }
  });

  wrapper.appendChild(btn);
  container.appendChild(wrapper);
}

async function renderDeployHistory(container, groupKey) {
  try {
    const history = await api.get('/deploy/history?limit=10');
    const groupHistory = history.filter(h => h.groups && h.groups.includes(groupKey)).slice(0, 5);

    if (groupHistory.length === 0) return;

    const section = document.createElement('div');
    section.className = 'deploy-history-list';

    const title = document.createElement('h3');
    title.style.cssText = 'font-size:13px;color:var(--text-dim);margin-bottom:8px';
    title.textContent = 'Deploy History';
    section.appendChild(title);

    for (const snap of groupHistory) {
      const item = document.createElement('div');
      item.className = 'deploy-history-item';

      const time = document.createElement('span');
      time.className = 'deploy-history-time';
      time.textContent = new Date(snap.ts * 1000).toLocaleString();

      const info = document.createElement('span');
      info.className = 'deploy-history-info';
      info.textContent = `${snap.file_count} files`;

      const rollbackBtn = document.createElement('button');
      rollbackBtn.className = 'btn-rollback';
      rollbackBtn.textContent = 'Rollback';
      rollbackBtn.addEventListener('click', async () => {
        rollbackBtn.disabled = true;
        rollbackBtn.textContent = 'Rolling back...';
        try {
          const result = await api.post(`/deploy/rollback/${encodeURIComponent(snap.id)}`);
          const restored = result.restored?.length || 0;
          rollbackBtn.textContent = `Restored ${restored} files`;
          showToast(`Rolled back: ${restored} files restored`, 'success');
        } catch (_e) {
          rollbackBtn.textContent = 'Failed';
        }
      });

      item.append(time, info, rollbackBtn);
      section.appendChild(item);
    }
    container.appendChild(section);
  } catch (_e) {
    // silently skip if endpoint not available
  }
}

async function renderGroupDetail(container, groupKey) {
  const group = state.groups[groupKey];
  if (!group) return;

  // Back button
  const back = document.createElement('button');
  back.className = 'btn';
  back.textContent = '\u2190 Back to Groups';
  back.style.marginBottom = '16px';
  back.addEventListener('click', () => { selectedGroup = null; renderGroupsView(); });
  container.appendChild(back);

  // Header
  const header = document.createElement('div');
  header.className = 'gc-header';
  const titleEl = document.createElement('h2');
  titleEl.style.cssText = 'font-size:18px;font-weight:600';
  titleEl.textContent = group.label || groupKey;
  header.appendChild(titleEl);
  if (group.path) {
    const pathEl = document.createElement('span');
    pathEl.className = 'gc-path';
    pathEl.textContent = group.path;
    header.appendChild(pathEl);
  }
  if (group._missing) {
    const missing = document.createElement('span');
    missing.className = 'gc-missing';
    missing.textContent = 'Path not found';
    header.appendChild(missing);
  }
  container.appendChild(header);

  // Gitignore banner (async)
  await renderGitignoreBanner(container, groupKey);

  // Pending changes banner
  if (state.pendingGroups && state.pendingGroups.has(groupKey)) {
    const pending = document.createElement('div');
    pending.className = 'pending-banner active';
    pending.style.cssText = 'border-radius:var(--radius);margin-bottom:12px';
    const text = document.createElement('span');
    text.className = 'pending-banner-text';
    text.textContent = 'This group has pending changes';
    pending.appendChild(text);
    container.appendChild(pending);
  }

  // Inherited servers
  const universalServers = (state.groups.__universal__?.servers || []).sort();
  if (universalServers.length > 0) {
    const sec = document.createElement('div');
    sec.className = 'gc-section';
    sec.style.marginBottom = '16px';
    const secTitle = document.createElement('div');
    secTitle.className = 'gc-section-title';
    secTitle.textContent = 'Inherited (Universal)';
    sec.appendChild(secTitle);
    for (const srvName of universalServers) {
      renderAccordionServer(sec, srvName, groupKey, true);
    }
    container.appendChild(sec);
  }

  // Assigned servers
  const assignedServers = (group.servers || []).sort();
  const assignedSec = document.createElement('div');
  assignedSec.className = 'gc-section';
  assignedSec.style.marginBottom = '16px';
  const assignedTitle = document.createElement('div');
  assignedTitle.className = 'gc-section-title';
  assignedTitle.textContent = `Assigned to ${group.label || groupKey} (${assignedServers.length})`;
  assignedSec.appendChild(assignedTitle);

  if (assignedServers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'gc-empty';
    empty.textContent = 'No servers assigned \u2014 add from available servers below';
    assignedSec.appendChild(empty);
  } else {
    for (const srvName of assignedServers) {
      renderAccordionServer(assignedSec, srvName, groupKey, false);
    }
  }
  container.appendChild(assignedSec);

  // Available servers
  renderAvailableServers(container, groupKey);

  // Deploy button
  renderDeployButton(container, groupKey);

  // Deploy history
  await renderDeployHistory(container, groupKey);
}

// ── Main Groups View Entry Point ─────────────────────────────────

export async function renderGroupsView() {
  const container = document.getElementById('view-groups');
  if (!container) return;
  container.textContent = '';

  if (selectedGroup && state.groups[selectedGroup]) {
    await renderGroupDetail(container, selectedGroup);
  } else {
    selectedGroup = null;
    renderGlobalPinned(container);
    renderGroupCards(container);
  }
}

// ── Legacy: renderGroupConfig (used by servers-view.js tree) ─────

export function renderGroupConfig(_titleEl, _gridEl, groupKey) {
  // Redirect to groups tab detail page
  selectedGroup = groupKey;
  import('./registry.js').then(m => {
    m.switchTab('groups');
  });
}

// ── Deploy Page ──────────────────────────────────────────────────

const deployOverlay = document.getElementById('deploy-overlay');
const deployBody = document.getElementById('deploy-body');
let deployPreviewData = null;
let deployChecked = new Set();
let deployGroupState = {};

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
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'padding:40px;text-align:center;color:var(--text-dim)';
    const icon = document.createElement('div');
    icon.style.cssText = 'font-size:48px;margin-bottom:16px';
    icon.textContent = '\u2705';
    const heading = document.createElement('h3');
    heading.style.cssText = 'color:var(--text);margin-bottom:8px';
    heading.textContent = 'Nothing to deploy';
    const desc = document.createElement('p');
    desc.textContent = 'Assign servers to groups first, then deploy to propagate .mcp.json files.';
    wrapper.append(icon, heading, desc);
    deployBody.appendChild(wrapper);
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

  for (const [groupKey, data] of Object.entries(byGroup).sort((a, b) => a[0].localeCompare(b[0]))) {
    const groupLabel = state.groups[groupKey]?.label || groupKey;
    const gState = deployGroupState[groupKey] || 'pending';
    const checked = deployChecked.has(groupKey);

    const card = document.createElement('div');
    card.className = `deploy-group-card ${gState}`;

    // Header row
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

    // Phase 8: Secrets masking badge in deploy overlay
    const deployHasSecrets = [...data.servers].some(srvName => {
      const srv = state.servers[srvName];
      return srv && hasSecretKeys(srv.env);
    });
    if (deployHasSecrets && gState === 'pending') {
      const secretBadge = document.createElement('div');
      secretBadge.style.cssText = 'margin-top:6px;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--accent)';
      secretBadge.textContent = '\uD83D\uDD12 Secrets masked as ${VAR} references';
      card.appendChild(secretBadge);
    }

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

    // Absolute path warning
    const hasAbsPaths = [...data.servers].some(srvName => {
      const srv = state.servers[srvName];
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

    // Overwrite warning
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

export function handleDeployProgress(data) {
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

// ── Deploy event listeners ───────────────────────────────────────

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

  for (const gk of selectedGroups) deployGroupState[gk] = 'deploying';
  renderDeployGroups();

  const result = await api.post('/deploy', { groups: selectedGroups });

  state.deploying = false;

  const errorPaths = new Set((result.errors || []).map(e => e.path));
  for (const gk of selectedGroups) {
    const groupHasErrors = Object.entries(deployPreviewData.files)
      .some(([p, info]) => info.group === gk && errorPaths.has(p));
    deployGroupState[gk] = groupHasErrors ? 'error' : 'done';
  }
  deployChecked.clear();

  renderDeployGroups();

  document.getElementById('deploy-status').textContent =
    `Deployed: ${result.written?.length || 0} files` +
    (result.errors?.length ? ` (${result.errors.length} errors)` : '');
});
