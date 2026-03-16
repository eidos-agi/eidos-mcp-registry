/**
 * Activity feed — bottom drawer showing recent events.
 */

import { api } from './registry.js';

let activityOpen = false;

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

// ── Full Activity Log Page ──────────────────────────────────────

export async function renderActivityLogView() {
  const container = document.getElementById('view-activity-log');
  if (!container) return;
  container.textContent = '';

  const page = document.createElement('div');
  page.style.cssText = 'max-width:900px;padding:0 20px 40px';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:20px';
  const h1 = document.createElement('h2');
  h1.style.cssText = 'font-size:20px;font-weight:700;margin:0';
  h1.textContent = 'Activity Log';
  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'btn';
  refreshBtn.textContent = 'Refresh';
  refreshBtn.addEventListener('click', () => renderActivityLogView());
  header.append(h1, refreshBtn);
  page.appendChild(header);

  let events;
  try {
    events = await api.get('/activity?limit=100');
  } catch {
    page.appendChild(Object.assign(document.createElement('div'), {
      textContent: 'Failed to load activity log',
      style: 'color:var(--red);padding:20px;text-align:center',
    }));
    container.appendChild(page);
    return;
  }

  if (events.length === 0) {
    page.appendChild(Object.assign(document.createElement('div'), {
      textContent: 'No activity recorded yet. Actions like deploy, assign, promote, and detection runs will appear here.',
      style: 'color:var(--text-dim);padding:40px 0;text-align:center;font-size:14px',
    }));
    container.appendChild(page);
    return;
  }

  // Summary strip
  const typeCounts = {};
  for (const e of events) {
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  }
  const summary = document.createElement('div');
  summary.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px';
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    const badge = document.createElement('span');
    badge.style.cssText = 'font-size:11px;padding:3px 10px;border-radius:10px;background:var(--bg-card);border:1px solid var(--border);color:var(--text-dim)';
    badge.textContent = `${EVENT_ICONS[type] || '\u2022'} ${EVENT_LABELS[type] || type}: ${count}`;
    summary.appendChild(badge);
  }
  page.appendChild(summary);

  // Event list
  for (const event of events) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)';

    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:16px;width:24px;text-align:center;flex-shrink:0;padding-top:1px';
    icon.textContent = EVENT_ICONS[event.type] || '\u2022';

    const content = document.createElement('div');
    content.style.cssText = 'flex:1;min-width:0';

    const text = document.createElement('div');
    text.style.cssText = 'font-size:13px;color:var(--text);line-height:1.5';
    text.textContent = formatEvent(event);

    const time = document.createElement('div');
    time.style.cssText = 'font-size:11px;color:var(--text-dim);margin-top:2px';
    time.textContent = formatTimeFull(event.ts);

    content.append(text, time);

    // Detail (expandable)
    const detail = event.detail;
    if (detail && Object.keys(detail).length > 0) {
      const detailBtn = document.createElement('button');
      detailBtn.style.cssText = 'font-size:10px;color:var(--text-dim);background:none;border:none;cursor:pointer;padding:2px 0;margin-top:2px';
      detailBtn.textContent = 'details';
      const detailBlock = document.createElement('pre');
      detailBlock.style.cssText = 'display:none;font-size:11px;color:var(--text-dim);font-family:"SF Mono",Monaco,monospace;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:8px;margin-top:4px;white-space:pre-wrap;max-height:150px;overflow-y:auto';
      detailBlock.textContent = JSON.stringify(detail, null, 2);
      detailBtn.addEventListener('click', () => {
        const showing = detailBlock.style.display !== 'none';
        detailBlock.style.display = showing ? 'none' : 'block';
        detailBtn.textContent = showing ? 'details' : 'hide';
      });
      content.append(detailBtn, detailBlock);
    }

    row.append(icon, content);
    page.appendChild(row);
  }

  container.appendChild(page);
}
