/**
 * Servers view — server tiles, global section, drop zones, scan banner.
 */

import { state, api, loadData, renderPendingBanner } from './registry.js';

let selectedServer = null;
let _catalogCache = null;
let _auditCache = null;
let _completenessCache = null;

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

  // Click to view detail
  tile.addEventListener('click', () => {
    selectedServer = name;
    renderServersView();
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

// ── Drop zones (left sidebar) ───────────────────────────────────

function renderDropZones(container) {
  const groups = Object.entries(state.groups)
    .filter(([k]) => k !== '__universal__')
    .sort((a, b) => (a[1].label || a[0]).localeCompare(b[1].label || b[0]));

  if (groups.length === 0) return;

  const title = document.createElement('div');
  title.style.cssText = 'font-size:11px;color:var(--text-dim);margin-bottom:8px;font-weight:500;text-transform:uppercase;letter-spacing:0.5px';
  title.textContent = 'Drop to Assign';
  container.appendChild(title);

  for (const [key, group] of groups) {
    const zone = document.createElement('div');
    zone.className = 'drop-zone';
    zone.dataset.group = key;

    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:14px;flex-shrink:0';
    icon.textContent = group._missing ? '\uD83D\uDC80' : '\uD83D\uDCC1';

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0';
    const label = document.createElement('div');
    label.style.cssText = 'font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    label.textContent = group.label || key;
    const count = document.createElement('div');
    count.style.cssText = 'font-size:10px;color:var(--text-dim)';
    const serverCount = (group.servers || []).length;
    count.textContent = `${serverCount} server${serverCount !== 1 ? 's' : ''}`;
    info.append(label, count);

    zone.style.cssText = 'display:flex;align-items:center;gap:8px;text-align:left;padding:10px 12px;margin-bottom:6px';
    zone.append(icon, info);

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

    container.appendChild(zone);
  }
}

// ── Scope Audit Panel ───────────────────────────────────────────

const STATUS_ICONS = {
  global_user: '\uD83C\uDF10',        // 🌐
  global_project_only: '\u26A0\uFE0F', // ⚠️
  needs_promote: '\uD83D\uDD34',       // 🔴
  scoped: '\u2705',                     // ✅
  unassigned_user: '\uD83D\uDFE1',     // 🟡
  unassigned_orphan: '\u26AB',          // ⚫
};

const STATUS_COLORS = {
  global_user: 'var(--accent)',
  global_project_only: 'var(--orange)',
  needs_promote: 'var(--red)',
  scoped: 'var(--green)',
  unassigned_user: 'var(--orange)',
  unassigned_orphan: 'var(--text-dim)',
};

async function renderPromoteBanner(container) {
  let audit, catalog;
  try {
    audit = await api.get('/scope-audit');
  } catch { return; }
  try {
    const catData = await api.get('/server-catalog');
    catalog = catData.servers || {};
  } catch { catalog = {}; }

  const { summary, servers } = audit;

  // Header bar
  const panel = document.createElement('div');
  panel.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:16px;overflow:hidden';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer';
  header.addEventListener('click', () => {
    body.style.display = body.style.display === 'none' ? '' : 'none';
    chevron.textContent = body.style.display === 'none' ? '\u25B6' : '\u25BC';
  });

  const chevron = document.createElement('span');
  chevron.style.cssText = 'color:var(--text-dim);font-size:10px;flex-shrink:0';
  chevron.textContent = '\u25B6';

  const headerTitle = document.createElement('span');
  headerTitle.style.cssText = 'font-size:13px;font-weight:600;flex:1';
  headerTitle.textContent = 'Scope Audit';

  // Summary badges
  const badgeRow = document.createElement('div');
  badgeRow.style.cssText = 'display:flex;gap:6px;flex-shrink:0';

  if (summary.needs_promote > 0) {
    const b = document.createElement('span');
    b.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(248,81,73,0.15);color:var(--red);font-weight:500';
    b.textContent = `${summary.needs_promote} leaking`;
    badgeRow.appendChild(b);
  }
  if (summary.properly_scoped > 0) {
    const b = document.createElement('span');
    b.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(63,185,80,0.15);color:var(--green);font-weight:500';
    b.textContent = `${summary.properly_scoped} scoped`;
    badgeRow.appendChild(b);
  }
  if (summary.global > 0) {
    const b = document.createElement('span');
    b.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:10px;background:var(--accent-dim);color:var(--accent);font-weight:500';
    b.textContent = `${summary.global} global`;
    badgeRow.appendChild(b);
  }
  if (summary.unassigned > 0) {
    const b = document.createElement('span');
    b.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:10px;background:var(--bg-hover);color:var(--text-dim);font-weight:500';
    b.textContent = `${summary.unassigned} unassigned`;
    badgeRow.appendChild(b);
  }

  // Completeness badge
  let completenessMap = {};
  try {
    const completeness = await api.get('/server-catalog/completeness');
    _completenessCache = completeness;
    const incomplete = completeness.servers.filter(s => s.grade === 'D' || s.grade === 'F').length;
    for (const s of completeness.servers) completenessMap[s.server] = s;
    if (incomplete > 0) {
      const b = document.createElement('span');
      b.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(210,153,34,0.15);color:var(--orange);font-weight:500';
      b.textContent = `${incomplete} undocumented`;
      badgeRow.appendChild(b);
    }
  } catch {}

  // Promote All button in header
  const promoteBtn = document.createElement('button');
  promoteBtn.className = 'btn';
  promoteBtn.style.cssText = 'font-size:11px;padding:3px 10px;flex-shrink:0';
  if (summary.needs_promote > 0) {
    promoteBtn.className = 'btn btn-primary';
    promoteBtn.textContent = `Fix ${summary.needs_promote} leaking`;
    promoteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      promoteBtn.disabled = true;
      promoteBtn.textContent = 'Promoting...';
      try {
        const result = await api.post('/promote/all');
        const count = result.removed?.length || 0;
        promoteBtn.textContent = `Fixed ${count}`;
        promoteBtn.style.background = 'var(--green)';
        import('./toast.js').then(m => m.showToast(`Promoted ${count} servers to project-only`, 'success'));
        // Refresh the audit
        setTimeout(() => loadData(), 1000);
      } catch {
        promoteBtn.textContent = 'Failed';
        promoteBtn.disabled = false;
      }
    });
  } else {
    promoteBtn.textContent = 'All clean';
    promoteBtn.disabled = true;
  }

  // Enrich button in header
  const enrichBtn = document.createElement('button');
  enrichBtn.className = 'btn';
  enrichBtn.style.cssText = 'font-size:11px;padding:3px 10px;flex-shrink:0';
  enrichBtn.textContent = 'Enrich';
  enrichBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    enrichBtn.disabled = true;
    enrichBtn.textContent = 'Enriching...';
    try {
      const result = await api.post('/server-catalog/enrich');
      enrichBtn.textContent = 'Done';
      enrichBtn.style.color = 'var(--green)';
      _completenessCache = null;
      _catalogCache = null;
      import('./toast.js').then(m => m.showToast('Auto-enrichment complete', 'success'));
      setTimeout(() => loadData(), 1000);
    } catch {
      enrichBtn.textContent = 'Failed';
      enrichBtn.disabled = false;
    }
  });

  header.append(chevron, headerTitle, badgeRow, enrichBtn, promoteBtn);
  panel.appendChild(header);

  // Body — detailed server list
  const body = document.createElement('div');
  body.style.cssText = 'display:none;border-top:1px solid var(--border)';

  // Group servers by status for logical ordering
  const order = ['needs_promote', 'unassigned_user', 'global_project_only', 'global_user', 'scoped', 'unassigned_orphan'];
  const sorted = [...servers].sort((a, b) => {
    const ai = order.indexOf(a.status);
    const bi = order.indexOf(b.status);
    if (ai !== bi) return ai - bi;
    return a.server.localeCompare(b.server);
  });

  for (const srv of sorted) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:8px 16px;border-bottom:1px solid var(--border);font-size:12px';
    if (srv.status === 'needs_promote') row.style.background = 'rgba(248,81,73,0.05)';

    const icon = document.createElement('span');
    icon.style.cssText = 'flex-shrink:0;width:20px;text-align:center;padding-top:1px';
    icon.textContent = STATUS_ICONS[srv.status] || '\u2022';

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0';

    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'display:flex;align-items:center;gap:8px';

    const name = document.createElement('span');
    name.style.cssText = 'font-weight:600;color:var(--text)';
    name.textContent = srv.server;

    const statusBadge = document.createElement('span');
    statusBadge.style.cssText = `font-size:10px;padding:1px 6px;border-radius:3px;color:${STATUS_COLORS[srv.status] || 'var(--text-dim)'};border:1px solid ${STATUS_COLORS[srv.status] || 'var(--border)'}`;
    statusBadge.textContent = srv.status_label;

    const typeBadge = document.createElement('span');
    typeBadge.className = 'type-badge';
    typeBadge.textContent = srv.type;

    // Completeness grade badge
    if (completenessMap[srv.server]) {
      const comp = completenessMap[srv.server];
      const gradeColors = { A: 'var(--green)', B: 'var(--accent)', C: 'var(--orange)', D: 'var(--red)', F: 'var(--red)' };
      const gradeBadge = document.createElement('span');
      gradeBadge.style.cssText = `font-size:10px;padding:1px 6px;border-radius:3px;font-weight:700;color:${gradeColors[comp.grade]};border:1px solid ${gradeColors[comp.grade]}`;
      gradeBadge.textContent = `${comp.grade} ${comp.score}%`;
      gradeBadge.title = comp.missing.join(', ');
      nameRow.append(name, statusBadge, typeBadge, gradeBadge);
    } else {
      nameRow.append(name, statusBadge, typeBadge);
    }

    const detail = document.createElement('div');
    detail.style.cssText = 'color:var(--text-dim);margin-top:2px;line-height:1.5';
    detail.textContent = srv.detail;

    // Scope indicators
    const scopes = document.createElement('div');
    scopes.style.cssText = 'display:flex;gap:6px;margin-top:4px;flex-wrap:wrap';

    if (srv.in_user_scope) {
      const tag = document.createElement('span');
      tag.style.cssText = 'font-size:10px;padding:1px 6px;border-radius:3px;background:rgba(210,153,34,0.15);color:var(--orange)';
      tag.textContent = '~/.claude.json';
      scopes.appendChild(tag);
    }
    if (srv.in_universal) {
      const tag = document.createElement('span');
      tag.style.cssText = 'font-size:10px;padding:1px 6px;border-radius:3px;background:var(--accent-dim);color:var(--accent)';
      tag.textContent = 'Global';
      scopes.appendChild(tag);
    }
    for (const g of srv.groups) {
      if (g.is_universal) continue;
      const tag = document.createElement('span');
      tag.style.cssText = 'font-size:10px;padding:1px 6px;border-radius:3px;background:rgba(63,185,80,0.15);color:var(--green)';
      tag.textContent = g.label;
      scopes.appendChild(tag);
    }
    if (!srv.in_user_scope && !srv.groups.length) {
      const tag = document.createElement('span');
      tag.style.cssText = 'font-size:10px;padding:1px 6px;border-radius:3px;background:var(--bg-hover);color:var(--text-dim)';
      tag.textContent = 'registry only';
      scopes.appendChild(tag);
    }

    info.append(nameRow, detail, scopes);

    // Catalog info (summary + risk_notes)
    const catEntry = catalog[srv.server];
    if (catEntry) {
      const catInfo = document.createElement('div');
      catInfo.style.cssText = 'margin-top:4px;font-size:11px;line-height:1.5';

      if (catEntry.summary) {
        const summaryEl = document.createElement('div');
        summaryEl.style.cssText = 'color:var(--text);font-style:italic';
        summaryEl.textContent = catEntry.summary;
        catInfo.appendChild(summaryEl);
      }

      if (catEntry.risk_notes) {
        const riskEl = document.createElement('div');
        const isHigh = catEntry.risk_notes.toUpperCase().includes('HIGH') || catEntry.risk_notes.toUpperCase().includes('CRITICAL');
        riskEl.style.cssText = `color:${isHigh ? 'var(--red)' : 'var(--text-dim)'};margin-top:2px`;
        riskEl.textContent = catEntry.risk_notes;
        catInfo.appendChild(riskEl);
      }

      info.appendChild(catInfo);
    }

    // Per-server promote button
    if (srv.action === 'promote') {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.cssText = 'font-size:10px;padding:2px 8px;flex-shrink:0;color:var(--red);border-color:var(--red)';
      btn.textContent = 'Promote';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '...';
        await api.post('/promote', { servers: [srv.server] });
        btn.textContent = '\u2713';
        btn.style.color = 'var(--green)';
        btn.style.borderColor = 'var(--green)';
      });
      row.append(icon, info, btn);
    } else {
      row.append(icon, info);
    }

    body.appendChild(row);
  }

  panel.appendChild(body);
  container.appendChild(panel);
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

// ── Server Detail Page ──────────────────────────────────────────

async function renderServerDetail(container, name) {
  const srv = state.servers[name] || {};
  const health = srv.health || 'unknown';

  // Load catalog + audit if not cached
  if (!_catalogCache) {
    try { const d = await api.get('/server-catalog'); _catalogCache = d.servers || {}; } catch { _catalogCache = {}; }
  }
  if (!_auditCache) {
    try { const d = await api.get('/scope-audit'); _auditCache = {}; for (const s of d.servers) _auditCache[s.server] = s; } catch { _auditCache = {}; }
  }
  const cat = _catalogCache[name] || {};
  const audit = _auditCache[name] || {};

  // Back button
  const back = document.createElement('button');
  back.className = 'btn';
  back.textContent = '\u2190 Back to Servers';
  back.style.marginBottom = '16px';
  back.addEventListener('click', () => { selectedServer = null; renderServersView(); });
  container.appendChild(back);

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:14px;padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:20px';

  const dot = document.createElement('span');
  dot.className = `health-dot health-${health.replace(/\s+/g, '-')}`;
  dot.style.cssText = 'width:12px;height:12px';

  const nameEl = document.createElement('h2');
  nameEl.style.cssText = 'font-size:22px;font-weight:700;flex:1;margin:0';
  nameEl.textContent = name;

  const editBtn = document.createElement('button');
  editBtn.className = 'btn';
  editBtn.textContent = 'Edit Config';
  editBtn.addEventListener('click', () => {
    import('./editor.js').then(m => m.openEditor(name));
  });

  header.append(dot, nameEl, editBtn);
  container.appendChild(header);

  // Summary from catalog
  if (cat.summary) {
    const summary = document.createElement('p');
    summary.style.cssText = 'font-size:15px;color:var(--text-dim);line-height:1.6;margin-bottom:20px';
    summary.textContent = cat.summary;
    container.appendChild(summary);
  }

  // Risk alert
  if (cat.risk_notes) {
    const isHigh = /HIGH|CRITICAL/i.test(cat.risk_notes);
    const risk = document.createElement('div');
    risk.style.cssText = `padding:12px 16px;border-radius:var(--radius);margin-bottom:16px;font-size:13px;line-height:1.5;border:1px solid ${isHigh ? 'var(--red)' : 'var(--border)'};background:${isHigh ? 'rgba(248,81,73,0.08)' : 'var(--bg-card)'};color:${isHigh ? 'var(--red)' : 'var(--text-dim)'}`;
    const riskIcon = document.createElement('span');
    riskIcon.textContent = isHigh ? '\uD83D\uDEA8 ' : '\u26A0\uFE0F ';
    risk.append(riskIcon, document.createTextNode(cat.risk_notes));
    container.appendChild(risk);
  }

  // Info cards row
  const cards = document.createElement('div');
  cards.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:20px';

  function infoCard(label, value, color) {
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:12px';
    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px';
    lbl.textContent = label;
    const val = document.createElement('div');
    val.style.cssText = `font-size:14px;font-weight:600;color:${color || 'var(--text)'}`;
    val.textContent = value;
    card.append(lbl, val);
    return card;
  }

  cards.appendChild(infoCard('Type', srv.type || 'stdio'));
  cards.appendChild(infoCard('Health', health, health === 'connected' ? 'var(--green)' : health === 'failed' ? 'var(--red)' : 'var(--text-dim)'));
  cards.appendChild(infoCard('Tools', cat.tool_count ? `${cat.tool_count} tools` : '?'));
  cards.appendChild(infoCard('Maintainer', cat.maintainer || 'unknown'));
  cards.appendChild(infoCard('Scope', audit.status_label || '?', (STATUS_COLORS[audit.status] || 'var(--text-dim)')));
  if (cat.recommended_scope) {
    cards.appendChild(infoCard('Recommended', cat.recommended_scope));
  }
  container.appendChild(cards);

  // Completeness card
  try {
    if (!_completenessCache) {
      _completenessCache = await api.get('/server-catalog/completeness');
    }
    const compEntry = (_completenessCache.servers || []).find(s => s.server === name);
    if (compEntry) {
      const compSection = document.createElement('div');
      compSection.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:16px';

      const compTitle = document.createElement('div');
      compTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--text);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px';
      compTitle.textContent = 'Documentation Completeness';

      const gradeColors = { A: 'var(--green)', B: 'var(--accent)', C: 'var(--orange)', D: 'var(--red)', F: 'var(--red)' };
      const gradeColor = gradeColors[compEntry.grade] || 'var(--text-dim)';

      const gradeRow = document.createElement('div');
      gradeRow.style.cssText = 'display:flex;align-items:center;gap:16px;margin-bottom:12px';

      const gradeLetter = document.createElement('span');
      gradeLetter.style.cssText = `font-size:32px;font-weight:800;color:${gradeColor}`;
      gradeLetter.textContent = compEntry.grade;

      const scoreBar = document.createElement('div');
      scoreBar.style.cssText = 'flex:1';
      const scoreLabel = document.createElement('div');
      scoreLabel.style.cssText = `font-size:14px;font-weight:600;color:${gradeColor};margin-bottom:4px`;
      scoreLabel.textContent = `${compEntry.score}% complete`;
      const barBg = document.createElement('div');
      barBg.style.cssText = 'height:6px;background:var(--bg-hover);border-radius:3px;overflow:hidden';
      const barFill = document.createElement('div');
      barFill.style.cssText = `height:100%;width:${compEntry.score}%;background:${gradeColor};border-radius:3px;transition:width 0.3s`;
      barBg.appendChild(barFill);
      scoreBar.append(scoreLabel, barBg);

      gradeRow.append(gradeLetter, scoreBar);

      compSection.append(compTitle, gradeRow);

      // Missing fields
      if (compEntry.missing && compEntry.missing.length > 0) {
        const missingLabel = document.createElement('div');
        missingLabel.style.cssText = 'font-size:11px;font-weight:600;color:var(--text-dim);margin-bottom:6px;margin-top:4px';
        missingLabel.textContent = `Missing fields (${compEntry.missing.length})`;
        compSection.appendChild(missingLabel);

        const missingList = document.createElement('div');
        missingList.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px';
        for (const field of compEntry.missing) {
          const tag = document.createElement('span');
          tag.style.cssText = 'font-size:10px;padding:2px 8px;border-radius:3px;background:var(--bg-hover);color:var(--text-dim);font-family:"SF Mono",Monaco,monospace';
          tag.textContent = field;
          missingList.appendChild(tag);
        }
        compSection.appendChild(missingList);
      }

      // Auto-enrich button
      const enrichBtn = document.createElement('button');
      enrichBtn.className = 'btn';
      enrichBtn.style.cssText = 'margin-top:12px;font-size:12px';
      enrichBtn.textContent = 'Auto-Enrich';
      enrichBtn.addEventListener('click', async () => {
        enrichBtn.disabled = true;
        enrichBtn.textContent = 'Enriching...';
        try {
          await api.post('/server-catalog/enrich');
          enrichBtn.textContent = 'Done — Refreshing...';
          enrichBtn.style.color = 'var(--green)';
          _completenessCache = null;
          _catalogCache = null;
          setTimeout(() => renderServersView(), 500);
        } catch {
          enrichBtn.textContent = 'Failed';
          enrichBtn.disabled = false;
        }
      });
      compSection.appendChild(enrichBtn);

      container.appendChild(compSection);
    }
  } catch {}

  // Scope detail
  if (audit.detail) {
    const scopeSection = document.createElement('div');
    scopeSection.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:16px';

    const scopeTitle = document.createElement('div');
    scopeTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px';
    scopeTitle.textContent = 'Scope Status';

    const scopeIcon = document.createElement('span');
    scopeIcon.style.cssText = 'font-size:16px;margin-right:8px';
    scopeIcon.textContent = STATUS_ICONS[audit.status] || '\u2022';

    const scopeText = document.createElement('div');
    scopeText.style.cssText = 'font-size:13px;color:var(--text-dim);line-height:1.6';
    scopeText.textContent = audit.detail;

    // Scope tags
    const tags = document.createElement('div');
    tags.style.cssText = 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap';
    if (audit.in_user_scope) {
      const t = document.createElement('span');
      t.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:3px;background:rgba(210,153,34,0.15);color:var(--orange)';
      t.textContent = '~/.claude.json (user scope)';
      tags.appendChild(t);
    }
    if (audit.in_universal) {
      const t = document.createElement('span');
      t.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:3px;background:var(--accent-dim);color:var(--accent)';
      t.textContent = 'Global (universal)';
      tags.appendChild(t);
    }
    for (const g of audit.groups || []) {
      if (g.is_universal) continue;
      const t = document.createElement('span');
      t.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:3px;background:rgba(63,185,80,0.15);color:var(--green)';
      t.textContent = g.label;
      tags.appendChild(t);
    }

    scopeSection.append(scopeTitle, scopeIcon, scopeText, tags);

    // Promote button if needed
    if (audit.action === 'promote') {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.cssText = 'margin-top:10px;font-size:12px;color:var(--red);border-color:var(--red)';
      btn.textContent = 'Promote to Project-Only';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Promoting...';
        const result = await api.post('/promote', { servers: [name] });
        btn.textContent = result.removed?.length ? '\u2713 Promoted' : 'Already done';
        btn.style.color = 'var(--green)';
        btn.style.borderColor = 'var(--green)';
        _auditCache = null; // invalidate cache
      });
      scopeSection.appendChild(btn);
    }

    container.appendChild(scopeSection);
  }

  // Scope rationale from catalog
  if (cat.scope_rationale) {
    const rationale = document.createElement('div');
    rationale.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:16px';
    const ratTitle = document.createElement('div');
    ratTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px';
    ratTitle.textContent = 'Scope Rationale';
    const ratText = document.createElement('div');
    ratText.style.cssText = 'font-size:13px;color:var(--text-dim);line-height:1.6';
    ratText.textContent = cat.scope_rationale;
    rationale.append(ratTitle, ratText);
    container.appendChild(rationale);
  }

  // Command & config section
  const configSection = document.createElement('div');
  configSection.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:16px';

  const configTitle = document.createElement('div');
  configTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--text);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px';
  configTitle.textContent = 'Configuration';
  configSection.appendChild(configTitle);

  if (srv.command) {
    const cmdRow = document.createElement('div');
    cmdRow.style.cssText = 'margin-bottom:8px';
    const cmdLabel = document.createElement('div');
    cmdLabel.style.cssText = 'font-size:10px;color:var(--text-dim);text-transform:uppercase;margin-bottom:2px';
    cmdLabel.textContent = 'Command';
    const cmdVal = document.createElement('code');
    cmdVal.style.cssText = 'font-size:13px;color:var(--accent);font-family:"SF Mono",Monaco,monospace';
    cmdVal.textContent = `${srv.command} ${(srv.args || []).join(' ')}`;
    cmdRow.append(cmdLabel, cmdVal);
    configSection.appendChild(cmdRow);
  }

  if (srv.url) {
    const urlRow = document.createElement('div');
    urlRow.style.cssText = 'margin-bottom:8px';
    const urlLabel = document.createElement('div');
    urlLabel.style.cssText = 'font-size:10px;color:var(--text-dim);text-transform:uppercase;margin-bottom:2px';
    urlLabel.textContent = 'URL';
    const urlVal = document.createElement('code');
    urlVal.style.cssText = 'font-size:13px;color:var(--accent);font-family:"SF Mono",Monaco,monospace';
    urlVal.textContent = srv.url;
    urlRow.append(urlLabel, urlVal);
    configSection.appendChild(urlRow);
  }

  // Env vars
  if (srv.env && Object.keys(srv.env).length > 0) {
    const envLabel = document.createElement('div');
    envLabel.style.cssText = 'font-size:10px;color:var(--text-dim);text-transform:uppercase;margin-bottom:4px;margin-top:8px';
    envLabel.textContent = 'Environment Variables';
    configSection.appendChild(envLabel);

    for (const [k, v] of Object.entries(srv.env)) {
      const row = document.createElement('div');
      row.style.cssText = 'font-family:"SF Mono",Monaco,monospace;font-size:12px;padding:3px 0;display:flex;gap:8px';
      const keyEl = document.createElement('span');
      keyEl.style.color = 'var(--text)';
      keyEl.textContent = k;
      const eqEl = document.createElement('span');
      eqEl.style.color = 'var(--text-dim)';
      eqEl.textContent = '=';
      const valEl = document.createElement('span');
      const isSecret = ['token', 'key', 'secret', 'password', 'credential', 'auth'].some(p => k.toLowerCase().includes(p));
      valEl.style.color = isSecret ? 'var(--orange)' : 'var(--text-dim)';
      valEl.textContent = isSecret ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : v;
      row.append(keyEl, eqEl, valEl);
      if (isSecret) {
        const badge = document.createElement('span');
        badge.style.cssText = 'font-size:9px;padding:0 4px;border-radius:2px;background:rgba(210,153,34,0.15);color:var(--orange);font-family:sans-serif';
        badge.textContent = 'secret';
        row.appendChild(badge);
      }
      configSection.appendChild(row);
    }
  }

  container.appendChild(configSection);

  // Group assignments section
  const groupSection = document.createElement('div');
  groupSection.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:16px';

  const groupTitle = document.createElement('div');
  groupTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--text);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px';
  groupTitle.textContent = 'Group Assignments';
  groupSection.appendChild(groupTitle);

  let hasAssignment = false;
  for (const [gk, g] of Object.entries(state.groups)) {
    if (!(g.servers || []).includes(name)) continue;
    hasAssignment = true;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)';
    const icon = document.createElement('span');
    icon.textContent = gk === '__universal__' ? '\uD83C\uDF10' : '\uD83D\uDCC1';
    const label = document.createElement('span');
    label.style.cssText = 'font-size:13px;font-weight:500;flex:1';
    label.textContent = g.label || gk;
    const badge = document.createElement('span');
    badge.style.cssText = `font-size:10px;padding:1px 6px;border-radius:3px;${gk === '__universal__' ? 'background:var(--accent-dim);color:var(--accent)' : 'background:rgba(63,185,80,0.15);color:var(--green)'}`;
    badge.textContent = gk === '__universal__' ? 'global' : 'assigned';
    row.append(icon, label, badge);
    groupSection.appendChild(row);
  }
  if (!hasAssignment) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:13px;color:var(--text-dim);font-style:italic';
    empty.textContent = 'Not assigned to any group';
    groupSection.appendChild(empty);
  }

  container.appendChild(groupSection);

  // Sensitive data section
  if (cat.accesses_sensitive_data) {
    const sensSection = document.createElement('div');
    sensSection.style.cssText = 'background:var(--bg-card);border:1px solid var(--red);border-radius:var(--radius);padding:16px;margin-bottom:16px';

    const sensTitle = document.createElement('div');
    sensTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--red);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px';
    sensTitle.textContent = '\uD83D\uDD12 Sensitive Data Access';
    sensSection.appendChild(sensTitle);

    if (cat.sensitive_data_types && cat.sensitive_data_types.length > 0) {
      const tags = document.createElement('div');
      tags.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
      for (const dtype of cat.sensitive_data_types) {
        const tag = document.createElement('span');
        tag.style.cssText = 'font-size:11px;padding:3px 10px;border-radius:4px;background:rgba(248,81,73,0.1);color:var(--red);border:1px solid rgba(248,81,73,0.2)';
        tag.textContent = dtype;
        tags.appendChild(tag);
      }
      sensSection.appendChild(tags);
    }
    container.appendChild(sensSection);
  }

  // Documentation links
  if (cat.documentation_urls && cat.documentation_urls.length > 0) {
    const docSection = document.createElement('div');
    docSection.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:16px';

    const docTitle = document.createElement('div');
    docTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px';
    docTitle.textContent = 'Documentation';
    docSection.appendChild(docTitle);

    for (const url of cat.documentation_urls) {
      const link = document.createElement('div');
      link.style.cssText = 'padding:4px 0';
      const a = document.createElement('a');
      a.style.cssText = 'font-size:13px;color:var(--accent);text-decoration:none;font-family:"SF Mono",Monaco,monospace;word-break:break-all';
      a.textContent = url;
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      link.appendChild(a);
      docSection.appendChild(link);
    }
    container.appendChild(docSection);
  }

  // Docs section
  if (cat.docs) {
    const docsSection = document.createElement('div');
    docsSection.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:16px';

    const docsTitle = document.createElement('div');
    docsTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--text);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px';
    docsTitle.textContent = 'Documentation';
    docsSection.appendChild(docsTitle);

    // Overview
    if (cat.docs.overview && cat.docs.overview !== cat.summary) {
      const overview = document.createElement('p');
      overview.style.cssText = 'font-size:13px;color:var(--text-dim);line-height:1.6;margin-bottom:12px';
      overview.textContent = cat.docs.overview;
      docsSection.appendChild(overview);
    }

    // Architecture
    if (cat.docs.architecture) {
      const archLabel = document.createElement('div');
      archLabel.style.cssText = 'font-size:11px;font-weight:600;color:var(--accent);margin-bottom:4px;margin-top:8px';
      archLabel.textContent = 'Architecture';
      const arch = document.createElement('p');
      arch.style.cssText = 'font-size:12px;color:var(--text-dim);line-height:1.6;margin-bottom:8px';
      arch.textContent = cat.docs.architecture;
      docsSection.append(archLabel, arch);
    }

    // Tools documentation
    if (cat.docs.tools && Object.keys(cat.docs.tools).length > 0) {
      const toolsLabel = document.createElement('div');
      toolsLabel.style.cssText = 'font-size:11px;font-weight:600;color:var(--accent);margin-bottom:6px;margin-top:12px';
      toolsLabel.textContent = `Tools (${Object.keys(cat.docs.tools).length})`;
      docsSection.appendChild(toolsLabel);

      for (const [toolName, toolDesc] of Object.entries(cat.docs.tools)) {
        const toolRow = document.createElement('div');
        toolRow.style.cssText = 'padding:6px 0;border-bottom:1px solid var(--border)';
        const tn = document.createElement('code');
        tn.style.cssText = 'font-size:12px;color:var(--accent);font-family:"SF Mono",Monaco,monospace';
        tn.textContent = toolName;
        const td = document.createElement('div');
        td.style.cssText = 'font-size:12px;color:var(--text-dim);margin-top:2px;line-height:1.5';
        td.textContent = toolDesc;
        toolRow.append(tn, td);
        docsSection.appendChild(toolRow);
      }
    }

    // Data sources
    if (cat.docs.data_sources && cat.docs.data_sources.length > 0) {
      const dsLabel = document.createElement('div');
      dsLabel.style.cssText = 'font-size:11px;font-weight:600;color:var(--accent);margin-bottom:4px;margin-top:12px';
      dsLabel.textContent = 'Data Sources';
      docsSection.appendChild(dsLabel);
      for (const ds of cat.docs.data_sources) {
        const dsItem = document.createElement('div');
        dsItem.style.cssText = 'font-size:12px;color:var(--text-dim);padding:2px 0;padding-left:12px';
        dsItem.textContent = '\u2022 ' + ds;
        docsSection.appendChild(dsItem);
      }
    }

    // Security notes
    if (cat.docs.security_notes) {
      const secLabel = document.createElement('div');
      secLabel.style.cssText = 'font-size:11px;font-weight:600;color:var(--red);margin-bottom:4px;margin-top:12px';
      secLabel.textContent = 'Security Notes';
      const secText = document.createElement('p');
      secText.style.cssText = 'font-size:12px;color:var(--text-dim);line-height:1.6';
      secText.textContent = cat.docs.security_notes;
      docsSection.append(secLabel, secText);
    }

    // Dependencies
    if (cat.docs.dependencies && cat.docs.dependencies.length > 0) {
      const depLabel = document.createElement('div');
      depLabel.style.cssText = 'font-size:11px;font-weight:600;color:var(--accent);margin-bottom:4px;margin-top:12px';
      depLabel.textContent = 'Dependencies';
      docsSection.appendChild(depLabel);
      for (const dep of cat.docs.dependencies) {
        const depItem = document.createElement('div');
        depItem.style.cssText = 'font-size:12px;color:var(--text-dim);padding:2px 0;padding-left:12px';
        depItem.textContent = '\u2022 ' + dep;
        docsSection.appendChild(depItem);
      }
    }

    container.appendChild(docsSection);
  }

  // Installation & Code section
  const inst = cat.installation || {};
  if (Object.keys(inst).length > 0) {
    const installSection = document.createElement('div');
    installSection.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:16px';

    const installTitle = document.createElement('div');
    installTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--text);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px';
    installTitle.textContent = 'Installation & Code';
    installSection.appendChild(installTitle);

    function installRow(label, value, isCode) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)';
      const lbl = document.createElement('span');
      lbl.style.cssText = 'font-size:11px;color:var(--text-dim);width:120px;flex-shrink:0;text-transform:uppercase';
      lbl.textContent = label;
      const val = document.createElement('span');
      val.style.cssText = `font-size:12px;${isCode ? 'font-family:"SF Mono",Monaco,monospace;color:var(--accent)' : 'color:var(--text)'};word-break:break-all`;
      val.textContent = value;
      row.append(lbl, val);
      installSection.appendChild(row);
    }

    if (inst.binary) {
      installRow('Binary', inst.binary, true);
      if (inst.binary_resolves_to && inst.binary_resolves_to !== inst.binary) {
        installRow('Resolves to', inst.binary_resolves_to, true);
      }
    }
    if (inst.url) {
      installRow('Remote URL', inst.url, true);
    }
    if (inst.code_repo) {
      installRow('Code repo', inst.code_repo, true);
    }
    if (inst.last_commit_date) {
      const age = inst.code_age_days;
      const ageStr = age === 0 ? 'today' : age === 1 ? '1 day ago' : `${age} days ago`;
      const ageColor = age > 30 ? 'var(--orange)' : age > 90 ? 'var(--red)' : 'var(--green)';

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)';
      const lbl = document.createElement('span');
      lbl.style.cssText = 'font-size:11px;color:var(--text-dim);width:120px;flex-shrink:0;text-transform:uppercase';
      lbl.textContent = 'Last commit';
      const val = document.createElement('span');
      val.style.cssText = 'font-size:12px;color:var(--text);display:flex;gap:8px;align-items:center';
      val.textContent = inst.last_commit_date.substring(0, 10);
      const ageBadge = document.createElement('span');
      ageBadge.style.cssText = `font-size:10px;padding:1px 6px;border-radius:3px;color:${ageColor};border:1px solid ${ageColor}`;
      ageBadge.textContent = ageStr;
      val.appendChild(ageBadge);
      row.append(lbl, val);
      installSection.appendChild(row);
    }
    if (inst.last_commit_message) {
      installRow('Commit msg', inst.last_commit_message, false);
    }

    container.appendChild(installSection);
  }

  // Source (fallback if no installation section)
  if (cat.source && !cat.installation) {
    const sourceSection = document.createElement('div');
    sourceSection.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:16px';
    const srcTitle = document.createElement('div');
    srcTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--text);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px';
    srcTitle.textContent = 'Source';
    const srcVal = document.createElement('code');
    srcVal.style.cssText = 'font-size:12px;color:var(--text-dim);font-family:"SF Mono",Monaco,monospace;word-break:break-all';
    srcVal.textContent = cat.source;
    sourceSection.append(srcTitle, srcVal);
    container.appendChild(sourceSection);
  }
}

// ── Main render ─────────────────────────────────────────────────

export async function renderServersView() {
  const container = document.getElementById('view-servers');
  container.textContent = '';

  // Breadcrumb: if a server is selected, show detail page
  if (selectedServer && state.servers[selectedServer]) {
    await renderServerDetail(container, selectedServer);
    return;
  }

  // Two-column layout: drop zones (left) | servers (right)
  const layout = document.createElement('div');
  layout.className = 'servers-layout';

  // ── Left column: drop zones ──
  const leftCol = document.createElement('div');
  leftCol.className = 'servers-drop-rail';
  renderDropZones(leftCol);
  layout.appendChild(leftCol);

  // ── Right column: servers ──
  const rightCol = document.createElement('div');
  rightCol.className = 'servers-main';

  // Global section
  renderGlobalSection(rightCol);

  // Scope audit panel — shows every server's scope status
  renderPromoteBanner(rightCol);  // async, renders when data arrives

  // All non-universal servers
  const universalSet = new Set(state.groups.__universal__?.servers || []);
  const allServers = Object.keys(state.servers).filter(s => !universalSet.has(s)).sort();

  if (allServers.length > 0) {
    const title = document.createElement('h2');
    title.style.cssText = 'font-size:14px;color:var(--text-dim);margin-bottom:12px;font-weight:500';
    title.textContent = `All Servers (${allServers.length})`;
    rightCol.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'cards-grid';
    for (const name of allServers) {
      grid.appendChild(createServerTile(name));
    }
    rightCol.appendChild(grid);
  }

  layout.appendChild(rightCol);
  container.appendChild(layout);
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
