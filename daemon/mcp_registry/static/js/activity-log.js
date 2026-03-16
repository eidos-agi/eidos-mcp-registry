/**
 * Activity feed — bottom drawer showing recent events.
 */

import { api } from './registry.js';

let activityOpen = false;
let _logFilter = null;
let _searchQuery = '';
let _lastRefreshTs = null;
let _autoRefreshTimer = null;

const EVENT_TYPE_COLORS = {
  deploy: 'var(--green, #22c55e)',
  gitignore_bulk: 'var(--green, #22c55e)',
  detection_run: 'var(--text-dim, #888)',
  notification_approved: 'var(--green, #22c55e)',
  notification_dismissed: 'var(--text-dim, #888)',
  assign: 'var(--accent, #3b82f6)',
  unassign: 'var(--accent, #3b82f6)',
  promote: 'var(--accent, #3b82f6)',
  config_change: 'var(--orange, #f59e0b)',
  webhook: 'var(--orange, #f59e0b)',
  scan: 'var(--text-dim, #888)',
  notification_audit: 'var(--text-dim, #888)',
};

const EVENT_ICONS = {
  assign: '\u2795',
  unassign: '\u2796',
  deploy: '\uD83D\uDE80',
  config_change: '\u2699\uFE0F',
  scan: '\uD83D\uDD0D',
  gitignore_bulk: '\uD83D\uDEE1\uFE0F',
  promote: '\uD83D\uDD12',
  webhook: '\uD83D\uDD14',
  detection_run: '\uD83D\uDCE1',
  notification_approved: '\u2705',
  notification_dismissed: '\u274C',
  notification_audit: '\uD83D\uDCCB',
};

const EVENT_LABELS = {
  assign: 'Server assigned',
  unassign: 'Server removed',
  deploy: 'Deploy',
  config_change: 'Config changed',
  scan: 'Scan complete',
  gitignore_bulk: 'Gitignore fixed',
  promote: 'Promoted to project-only',
  webhook: 'Webhook fired',
  detection_run: 'Detection scan',
  notification_approved: 'Notification approved',
  notification_dismissed: 'Notification dismissed',
  notification_audit: 'Action completed',
};

export function initActivity() {
  // Toggle button
  const btn = document.getElementById('btn-activity');
  if (btn) {
    btn.addEventListener('click', toggleActivity);
  }

  // Close button
  const closeBtn = document.getElementById('btn-activity-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      activityOpen = false;
      const panel = document.getElementById('activity-panel');
      if (panel) panel.classList.remove('open');
    });
  }
}

export function toggleActivity() {
  activityOpen = !activityOpen;
  const panel = document.getElementById('activity-panel');
  if (panel) {
    panel.classList.toggle('open', activityOpen);
    if (activityOpen) loadActivity();
  }
}

export async function loadActivity() {
  const list = document.getElementById('activity-list');
  if (!list) return;

  try {
    const events = await api.get('/activity?limit=50');
    list.textContent = '';

    if (events.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:20px;text-align:center;color:var(--text-dim);font-size:13px';
      empty.textContent = 'No activity yet';
      list.appendChild(empty);
      return;
    }

    for (const event of events) {
      const item = document.createElement('div');
      item.className = 'activity-item';

      const icon = document.createElement('span');
      icon.className = 'activity-icon';
      icon.textContent = EVENT_ICONS[event.type] || '\u2022';

      const text = document.createElement('span');
      text.className = 'activity-text';
      text.textContent = formatEvent(event);

      const time = document.createElement('span');
      time.className = 'activity-time';
      time.textContent = formatTime(event.ts);

      item.append(icon, text, time);
      list.appendChild(item);
    }
  } catch (e) {
    list.textContent = '';
    const err = document.createElement('div');
    err.style.cssText = 'padding:20px;text-align:center;color:var(--red);font-size:13px';
    err.textContent = 'Failed to load activity';
    list.appendChild(err);
  }
}

function formatEvent(event) {
  const label = EVENT_LABELS[event.type] || event.type;
  const detail = event.detail || {};

  switch (event.type) {
    case 'assign':
      return `${label} ${detail.server || '?'} to ${detail.group || '?'}`;
    case 'unassign':
      return `${label} ${detail.server || '?'} from ${detail.group || '?'}`;
    case 'deploy':
      if (detail.action === 'rollback') {
        return `Rolled back snapshot ${detail.snapshot_id || '?'}`;
      }
      const written = detail.written || 0;
      const errors = detail.errors || 0;
      const groups = detail.groups ? detail.groups.join(', ') : 'all';
      return `${label} to ${groups}: ${written} files${errors ? ` (${errors} errors)` : ''}`;
    case 'config_change':
      return `${label}: ${detail.server || '?'}`;
    case 'scan':
      return `${label}: ${detail.servers_found || '?'} servers, ${detail.groups_found || '?'} groups`;
    case 'gitignore_bulk':
      return `${label} for ${detail.group || '?'}: ${detail.added || 0} repos fixed`;
    case 'promote': {
      const count = detail.count || detail.removed_from_user_scope?.length || 0;
      return `${label}: ${count} servers removed from ~/.claude.json`;
    }
    case 'webhook':
      return `${label}: ${detail.group || '?'} (${detail.status || '?'})`;
    case 'detection_run':
      return `${label}: ${detail.notifications_created || 0} issues found, ${detail.detectors_run || 0} checks ran`;
    case 'notification_approved':
      return `${label}: "${detail.title || '?'}" (${detail.priority || '?'})`;
    case 'notification_dismissed':
      return `Dismissed: "${detail.title || '?'}"`;
    case 'notification_audit':
      return `${label}: ${detail.action || '?'}${detail.has_error ? ' (FAILED)' : ''}`;
    default:
      return `${label}: ${JSON.stringify(detail).substring(0, 60)}`;
  }
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString();
}

function formatTimeFull(ts) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleString();
}

function formatTimeRelative(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function getTimeGroup(ts) {
  if (!ts) return 'Older';
  const d = new Date(ts * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (d >= today) return 'Today';
  if (d >= yesterday) return 'Yesterday';
  if (d >= weekAgo) return 'This Week';
  return 'Older';
}

function collapseConsecutive(events) {
  const result = [];
  let i = 0;
  while (i < events.length) {
    let j = i + 1;
    const evtText = formatEvent(events[i]);
    while (j < events.length && events[j].type === events[i].type && formatEvent(events[j]) === evtText) {
      j++;
    }
    const count = j - i;
    if (count >= 3) {
      result.push({
        ...events[i],
        _collapsed: true,
        _count: count,
        _lastTs: events[i].ts,
        _formattedText: evtText,
      });
    } else {
      for (let k = i; k < j; k++) {
        result.push(events[k]);
      }
    }
    i = j;
  }
  return result;
}

function formatEventText(event) {
  // Fix #8: Replace "0 repos fixed" with friendlier text
  let text = event._collapsed ? event._formattedText : formatEvent(event);
  text = text.replace(/:\s*0 repos fixed/, ': all repos already protected');
  if (event._collapsed) {
    text = `${event._count}x ${text} (last: ${formatTimeRelative(event._lastTs)})`;
  }
  return text;
}

function isImportantEvent(event) {
  return event.type === 'deploy' || event.type === 'gitignore_bulk';
}

function hasErrors(event) {
  const d = event.detail || {};
  return d.errors > 0 || d.has_error;
}

function isZeroResultDetection(event) {
  return event.type === 'detection_run' && (event.detail || {}).notifications_created === 0;
}

function formatRefreshAge(ts) {
  if (!ts) return 'Updated just now';
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 5) return 'Updated just now';
  if (diffSec < 60) return `Updated ${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  return `Updated ${diffMin}m ago`;
}

// ── Full Activity Log Page ──────────────────────────────────────

let _rendering = false;
export async function renderActivityLogView() {
  const container = document.getElementById('view-activity-log');
  if (!container) return;
  if (_rendering) return; // prevent re-entrant renders from SSE/loadData
  _rendering = true;
  try {
  container.textContent = '';

  // Clear any existing auto-refresh timer
  if (_autoRefreshTimer) {
    clearInterval(_autoRefreshTimer);
    _autoRefreshTimer = null;
  }

  const page = document.createElement('div');
  page.style.cssText = 'max-width:900px;padding:0 20px 40px';

  // Header — Fix #10: Replace Refresh button with "Updated X ago" indicator
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:20px';
  const h1 = document.createElement('h2');
  h1.style.cssText = 'font-size:20px;font-weight:700;margin:0';
  h1.textContent = 'Activity Log';

  _lastRefreshTs = Date.now();
  const refreshIndicator = document.createElement('span');
  refreshIndicator.style.cssText = 'font-size:12px;color:var(--text-dim);cursor:pointer;user-select:none;padding:4px 8px;border-radius:var(--radius, 4px);transition:background 0.15s';
  refreshIndicator.textContent = 'Updated just now';
  refreshIndicator.title = 'Click to refresh';
  refreshIndicator.addEventListener('mouseenter', () => { refreshIndicator.style.background = 'var(--bg-hover, rgba(0,0,0,0.05))'; });
  refreshIndicator.addEventListener('mouseleave', () => { refreshIndicator.style.background = 'none'; });
  refreshIndicator.addEventListener('click', () => { _searchQuery = ''; renderActivityLogView(); });

  // Update the refresh age text every 10s
  const refreshAgeTimer = setInterval(() => {
    if (!document.body.contains(refreshIndicator)) { clearInterval(refreshAgeTimer); return; }
    refreshIndicator.textContent = formatRefreshAge(_lastRefreshTs);
  }, 10000);

  // Auto-refresh every 60s when tab is active
  _autoRefreshTimer = setInterval(() => {
    if (!document.hidden && document.body.contains(container)) {
      renderActivityLogView();
    }
  }, 60000);

  header.append(h1, refreshIndicator);
  page.appendChild(header);

  // Fix #9: Search input
  const searchWrap = document.createElement('div');
  searchWrap.style.cssText = 'margin-bottom:12px';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search events\u2026';
  searchInput.value = _searchQuery;
  searchInput.style.cssText = 'width:100%;box-sizing:border-box;padding:7px 12px;font-size:13px;border:1px solid var(--border);border-radius:var(--radius, 6px);background:var(--bg-card, #fff);color:var(--text);outline:none';
  let _debounceTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      _searchQuery = searchInput.value;
      renderActivityLogView();
    }, 200);
  });
  searchWrap.appendChild(searchInput);
  page.appendChild(searchWrap);

  let events;
  try {
    events = await api.get('/activity?limit=100');
  } catch(e) {
    const errDiv = document.createElement('div');
    errDiv.textContent = 'Failed to load activity log';
    errDiv.style.cssText = 'color:var(--red);padding:20px;text-align:center';
    page.appendChild(errDiv);
    container.appendChild(page);
    return;
  }

  if (events.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.textContent = 'No activity recorded yet. Actions like deploy, assign, promote, and detection runs will appear here.';
    emptyDiv.style.cssText = 'color:var(--text-dim);padding:40px 0;text-align:center;font-size:14px';
    page.appendChild(emptyDiv);
    container.appendChild(page);
    return;
  }

  // Filter state
  const activeFilter = _logFilter;

  // Fix #7: Filter bar with better clickable badges
  const filterBar = document.createElement('div');
  filterBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;align-items:center';

  function makeBadge(label, isActive, color, onClick) {
    const btn = document.createElement('button');
    const bg = isActive ? (color || 'var(--accent)') : 'var(--bg-card, #fff)';
    const fg = isActive ? '#fff' : 'var(--text-dim)';
    const border = isActive ? (color || 'var(--accent)') : 'var(--border)';
    btn.style.cssText = [
      'font-size:11px', 'padding:4px 12px', 'border-radius:12px',
      `border:1px solid ${border}`,
      `background:${isActive ? bg : 'var(--bg-card, #fff)'}`,
      `color:${fg}`,
      'cursor:pointer', 'transition:all 0.15s', 'outline:none',
      isActive ? 'box-shadow:inset 0 1px 3px rgba(0,0,0,0.2)' : '',
      'font-weight:' + (isActive ? '600' : '400'),
    ].join(';');
    btn.textContent = label;
    btn.addEventListener('mouseenter', () => {
      if (!isActive) btn.style.background = 'var(--bg-hover, rgba(0,0,0,0.04))';
    });
    btn.addEventListener('mouseleave', () => {
      if (!isActive) btn.style.background = 'var(--bg-card, #fff)';
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  filterBar.appendChild(makeBadge(
    `All (${events.length})`, !activeFilter, null,
    () => { _logFilter = null; renderActivityLogView(); }
  ));

  // Type counts
  const typeCounts = {};
  for (const e of events) {
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    const isActive = activeFilter === type;
    const color = EVENT_TYPE_COLORS[type] || 'var(--text-dim)';
    const label = `${EVENT_ICONS[type] || '\u2022'} ${EVENT_LABELS[type] || type}: ${count}`;
    filterBar.appendChild(makeBadge(label, isActive, color, () => {
      _logFilter = isActive ? null : type;
      renderActivityLogView();
    }));
  }
  page.appendChild(filterBar);

  // Apply type filter
  let filtered = activeFilter ? events.filter(e => e.type === activeFilter) : events;

  // Apply search filter (Fix #9)
  if (_searchQuery) {
    const q = _searchQuery.toLowerCase();
    filtered = filtered.filter(e => {
      const text = formatEventText(e).toLowerCase();
      const label = (EVENT_LABELS[e.type] || e.type).toLowerCase();
      return text.includes(q) || label.includes(q);
    });
  }

  if ((activeFilter || _searchQuery) && filtered.length < events.length) {
    const showing = document.createElement('div');
    showing.style.cssText = 'font-size:12px;color:var(--text-dim);margin-bottom:12px';
    const filterLabel = activeFilter ? ` filtered by ${EVENT_LABELS[activeFilter] || activeFilter}` : '';
    const searchLabel = _searchQuery ? ` matching "${_searchQuery}"` : '';
    showing.textContent = `Showing ${filtered.length} of ${events.length} events${filterLabel}${searchLabel}`;
    page.appendChild(showing);
  }

  // Fix #1: Collapse consecutive identical events
  const collapsed = collapseConsecutive(filtered);

  // Fix #6: Time-based grouping
  let lastGroup = null;
  for (const event of collapsed) {
    const group = getTimeGroup(event.ts);
    if (group !== lastGroup) {
      lastGroup = group;
      const divider = document.createElement('div');
      divider.style.cssText = 'font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.05em;padding:16px 0 6px;border-bottom:1px solid var(--border);margin-bottom:2px';
      divider.textContent = group;
      page.appendChild(divider);
    }

    const isZero = isZeroResultDetection(event);
    const important = isImportantEvent(event);
    const errored = hasErrors(event);

    const row = document.createElement('div');
    let rowStyle = 'display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)';

    // Fix #2: Visual hierarchy — accent border for important events
    if (important) {
      const borderColor = errored ? 'var(--red, #ef4444)' : 'var(--green, #22c55e)';
      rowStyle += `;border-left:3px solid ${borderColor};padding-left:10px`;
    }

    // Fix #2/#8: Dim zero-result detection scans
    if (isZero) {
      rowStyle += ';opacity:0.5';
    }

    row.style.cssText = rowStyle;

    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:16px;width:24px;text-align:center;flex-shrink:0;padding-top:1px';
    icon.textContent = EVENT_ICONS[event.type] || '\u2022';

    const content = document.createElement('div');
    content.style.cssText = 'flex:1;min-width:0';

    // Build text line with inline chevron for details (Fix #5)
    const textLine = document.createElement('div');
    textLine.style.cssText = 'display:flex;align-items:center;gap:6px';

    const text = document.createElement('span');
    const fontSize = isZero ? '12px' : '13px';
    text.style.cssText = `font-size:${fontSize};color:var(--text);line-height:1.5`;
    text.textContent = formatEventText(event);
    textLine.appendChild(text);

    // Fix #5: Chevron toggle for details (inline)
    const detail = event.detail;
    let detailBlock = null;
    if (detail && Object.keys(detail).length > 0 && !event._collapsed) {
      const chevron = document.createElement('span');
      chevron.style.cssText = 'font-size:10px;color:var(--text-dim);cursor:pointer;transition:transform 0.15s;display:inline-block;user-select:none';
      chevron.textContent = '\u25B6';
      detailBlock = document.createElement('pre');
      detailBlock.style.cssText = 'display:none;font-size:11px;color:var(--text-dim);font-family:"SF Mono",Monaco,monospace;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius, 4px);padding:8px;margin-top:4px;white-space:pre-wrap;max-height:150px;overflow-y:auto';
      detailBlock.textContent = JSON.stringify(detail, null, 2);
      chevron.addEventListener('click', () => {
        const showing = detailBlock.style.display !== 'none';
        detailBlock.style.display = showing ? 'none' : 'block';
        chevron.style.transform = showing ? 'rotate(0deg)' : 'rotate(90deg)';
      });
      textLine.appendChild(chevron);
    }

    content.appendChild(textLine);

    // Fix #4: Relative time with full timestamp on hover
    const time = document.createElement('div');
    time.style.cssText = 'font-size:11px;color:var(--text-dim);margin-top:2px';
    time.textContent = formatTimeRelative(event.ts);
    time.title = formatTimeFull(event.ts);
    content.appendChild(time);

    if (detailBlock) {
      content.appendChild(detailBlock);
    }

    // Fix #3: Colored type tag badges
    const typeTag = document.createElement('span');
    const tagColor = EVENT_TYPE_COLORS[event.type] || 'var(--text-dim)';
    typeTag.style.cssText = `font-size:10px;color:${tagColor};background:${tagColor}18;padding:2px 8px;border-radius:8px;margin-left:8px;white-space:nowrap;flex-shrink:0;border:1px solid ${tagColor}30`;
    typeTag.textContent = EVENT_LABELS[event.type] || event.type;

    row.append(icon, content, typeTag);
    page.appendChild(row);
  }

  container.appendChild(page);

  // Re-focus search input if user was typing
  if (_searchQuery) {
    const newInput = page.querySelector('input');
    if (newInput) {
      newInput.focus();
      newInput.setSelectionRange(newInput.value.length, newInput.value.length);
    }
  }
  } finally { _rendering = false; }
}
