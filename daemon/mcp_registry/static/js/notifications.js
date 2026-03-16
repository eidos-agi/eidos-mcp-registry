/**
 * Notifications inbox -- renders notification cards, handles approve/dismiss.
 */

import { api, loadData } from './registry.js';

let _currentFilter = 'pending';

function timeAgo(ts) {
  const diff = (Date.now() / 1000) - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function createCard(n) {
  const card = document.createElement('div');
  card.className = `notification-card ${n.priority}`;

  // Header
  const header = document.createElement('div');
  header.className = 'notification-header';

  const icon = document.createElement('span');
  icon.className = 'notification-icon';
  icon.textContent = n.icon || '';

  const title = document.createElement('span');
  title.className = 'notification-title';
  title.textContent = n.title;

  const badge = document.createElement('span');
  badge.className = `notification-priority priority-${n.priority}`;
  badge.textContent = n.priority;

  header.append(icon, title, badge);

  // Detail
  const detail = document.createElement('div');
  detail.className = 'notification-detail';
  detail.textContent = n.detail;

  // Time
  const timeEl = document.createElement('div');
  timeEl.className = 'notification-time';
  timeEl.textContent = timeAgo(n.created_at);

  card.append(header, detail);

  // Actions (only for pending)
  if (n.status === 'pending' && n.actions && n.actions.length > 0) {
    const actions = document.createElement('div');
    actions.className = 'notification-actions';

    for (const action of n.actions) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = action.label;

      if (action.action === 'dismiss') {
        btn.addEventListener('click', async () => {
          await api.post(`/notifications/${n.id}/dismiss`);
          renderNotificationsView();
          updateNotificationBadge();
        });
      } else if (action.endpoint) {
        btn.className = 'btn btn-primary';
        btn.addEventListener('click', async () => {
          // Approve the notification
          await api.post(`/notifications/${n.id}/approve`);
          // Execute the action
          if (action.method === 'POST') {
            await api.post(action.endpoint, action.body);
          }
          renderNotificationsView();
          updateNotificationBadge();
          loadData();
        });
      }

      actions.appendChild(btn);
    }

    // Always add a dismiss button if not already present
    const hasDismiss = n.actions.some(a => a.action === 'dismiss');
    if (!hasDismiss) {
      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'btn';
      dismissBtn.textContent = 'Dismiss';
      dismissBtn.addEventListener('click', async () => {
        await api.post(`/notifications/${n.id}/dismiss`);
        renderNotificationsView();
        updateNotificationBadge();
      });
      actions.appendChild(dismissBtn);
    }

    card.appendChild(actions);
  }

  card.appendChild(timeEl);
  return card;
}

export async function renderNotificationsView() {
  const container = document.getElementById('view-notifications');
  if (!container) return;
  container.textContent = '';

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'notifications-toolbar';
  toolbar.style.padding = '16px 20px 0';

  const tabGroup = document.createElement('div');
  tabGroup.className = 'tab-group';

  for (const filter of ['pending', 'approved', 'dismissed']) {
    const btn = document.createElement('button');
    btn.className = `tab-btn ${filter === _currentFilter ? 'active' : ''}`;
    btn.textContent = filter.charAt(0).toUpperCase() + filter.slice(1);
    btn.addEventListener('click', () => {
      _currentFilter = filter;
      renderNotificationsView();
    });
    tabGroup.appendChild(btn);
  }

  const detectBtn = document.createElement('button');
  detectBtn.className = 'btn';
  detectBtn.textContent = 'Run Detection';
  detectBtn.addEventListener('click', async () => {
    detectBtn.disabled = true;
    detectBtn.textContent = 'Scanning...';
    await api.post('/notifications/detect');
    detectBtn.disabled = false;
    detectBtn.textContent = 'Run Detection';
    renderNotificationsView();
    updateNotificationBadge();
  });

  toolbar.append(tabGroup, detectBtn);
  container.appendChild(toolbar);

  // Content area
  const content = document.createElement('div');
  content.style.padding = '16px 20px';

  try {
    const items = await api.get(`/notifications?status=${_currentFilter}`);

    if (!items || items.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:60px 0;color:var(--text-dim)';
      const emptyIcon = document.createElement('div');
      emptyIcon.style.cssText = 'font-size:36px;margin-bottom:12px';
      emptyIcon.textContent = _currentFilter === 'pending' ? '\u2713' : '\u2014';
      const emptyText = document.createElement('div');
      emptyText.style.fontSize = '14px';
      emptyText.textContent = _currentFilter === 'pending'
        ? 'No pending notifications'
        : `No ${_currentFilter} notifications`;
      empty.append(emptyIcon, emptyText);
      content.appendChild(empty);
    } else {
      for (const n of items) {
        content.appendChild(createCard(n));
      }
    }
  } catch (err) {
    const errEl = document.createElement('div');
    errEl.style.cssText = 'color:var(--red);padding:20px';
    errEl.textContent = 'Failed to load notifications';
    content.appendChild(errEl);
  }

  container.appendChild(content);
}

export async function updateNotificationBadge() {
  const badge = document.getElementById('notification-badge');
  if (!badge) return;

  try {
    const counts = await api.get('/notifications/count');
    if (counts.total === 0) {
      badge.style.display = 'none';
      return;
    }
    badge.style.display = 'flex';
    badge.textContent = counts.total > 99 ? '99+' : String(counts.total);
    // Red for critical, orange for high, default otherwise
    badge.classList.remove('warn');
    if (counts.critical > 0) {
      badge.style.background = 'var(--red)';
    } else if (counts.high > 0) {
      badge.style.background = 'var(--orange)';
    } else {
      badge.style.background = 'var(--accent)';
    }
  } catch {
    badge.style.display = 'none';
  }
}
