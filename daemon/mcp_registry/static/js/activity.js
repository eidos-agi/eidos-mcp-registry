/**
 * Activity feed — bottom drawer showing recent events.
 */

import { api } from './registry.js';

let activityOpen = false;

const EVENT_ICONS = {
  assign: '\u2795',      // ➕
  unassign: '\u2796',    // ➖
  deploy: '\uD83D\uDE80', // 🚀
  config_change: '\u2699\uFE0F', // ⚙️
  scan: '\uD83D\uDD0D',  // 🔍
  gitignore_bulk: '\uD83D\uDEE1\uFE0F', // 🛡️
};

const EVENT_LABELS = {
  assign: 'Assigned',
  unassign: 'Unassigned',
  deploy: 'Deployed',
  config_change: 'Config changed',
  scan: 'Scanned',
  gitignore_bulk: 'Gitignore updated',
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
    default:
      return label;
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
