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
        btn.addEventListener('click', () => {
          // Immediately update UI — don't block
          btn.disabled = true;
          btn.textContent = 'Running...';

          // Disable all other buttons on this card
          card.querySelectorAll('.btn').forEach(b => { b.disabled = true; });

          // Add a live status indicator to the card
          const statusEl = document.createElement('div');
          statusEl.style.cssText = 'margin-top:10px;padding:10px 12px;background:var(--bg);border:1px solid var(--accent);border-radius:var(--radius);font-size:12px;color:var(--accent);display:flex;align-items:center;gap:8px';
          const spinner = document.createElement('span');
          spinner.style.cssText = 'display:inline-block;width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite';
          const statusText = document.createElement('span');
          statusText.textContent = `Executing: ${action.label}...`;
          statusEl.append(spinner, statusText);
          card.appendChild(statusEl);

          // Run async — don't await, let UI stay responsive
          (async () => {
            try {
              // Approve first
              await api.post(`/notifications/${n.id}/approve`);
              statusText.textContent = 'Approved. Calling ' + action.endpoint + '...';

              // Execute the action
              let actionResult = null;
              if (action.method === 'POST') {
                actionResult = await api.post(action.endpoint, action.body);
              } else if (action.method === 'GET') {
                actionResult = await api.get(action.endpoint);
              }

              // Record audit proof
              await api.post(`/notifications/${n.id}/audit`, {
                action_taken: action.label,
                endpoint: action.endpoint,
                result: actionResult || {},
                completed_at: new Date().toISOString(),
              });

              // Show success
              statusEl.style.borderColor = 'var(--green)';
              statusEl.style.color = 'var(--green)';
              spinner.remove();
              const checkmark = document.createElement('span');
              checkmark.textContent = '\u2713';
              checkmark.style.cssText = 'font-size:16px;font-weight:700';
              statusEl.prepend(checkmark);

              // Build result summary
              const r = actionResult || {};
              const parts = [];
              if (r.added !== undefined) parts.push(`${r.added} fixed`);
              if (r.already !== undefined) parts.push(`${r.already} already done`);
              if (r.written) parts.push(`${r.written.length || r.written} written`);
              if (r.errors && (r.errors.length || r.errors > 0)) parts.push(`${r.errors.length || r.errors} errors`);
              statusText.textContent = parts.length > 0
                ? `Done: ${parts.join(', ')}`
                : 'Done';

              // Refresh badge count after a beat
              setTimeout(() => {
                updateNotificationBadge();
                loadData();
              }, 500);

            } catch (err) {
              // Show error
              statusEl.style.borderColor = 'var(--red)';
              statusEl.style.color = 'var(--red)';
              spinner.remove();
              statusText.textContent = 'Failed: ' + (err.message || 'Unknown error');

              // Still record the failure
              try {
                await api.post(`/notifications/${n.id}/audit`, {
                  action_taken: action.label,
                  endpoint: action.endpoint,
                  error: err.message || 'Action failed',
                  completed_at: new Date().toISOString(),
                });
              } catch(e) {}
            }
          })();
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

  // Audit result (for approved/dismissed notifications)
  if (n.audit_result) {
    const audit = document.createElement('div');
    audit.style.cssText = 'margin-top:10px;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);font-size:12px';

    const auditHeader = document.createElement('div');
    auditHeader.style.cssText = 'font-weight:600;color:var(--green);margin-bottom:6px;display:flex;align-items:center;gap:6px';
    auditHeader.textContent = '\u2713 Audit Proof';
    audit.appendChild(auditHeader);

    const ar = n.audit_result;
    if (ar.action_taken) {
      const row = document.createElement('div');
      row.style.cssText = 'color:var(--text-dim);padding:2px 0';
      row.textContent = 'Action: ' + ar.action_taken;
      audit.appendChild(row);
    }
    if (ar.completed_at) {
      const row = document.createElement('div');
      row.style.cssText = 'color:var(--text-dim);padding:2px 0';
      row.textContent = 'Completed: ' + new Date(ar.completed_at).toLocaleString();
      audit.appendChild(row);
    }
    if (ar.error) {
      const row = document.createElement('div');
      row.style.cssText = 'color:var(--red);padding:2px 0;font-weight:500';
      row.textContent = 'Error: ' + ar.error;
      audit.appendChild(row);
    }
    if (ar.result) {
      const result = ar.result;
      // Show key result fields
      const fields = [];
      if (result.added !== undefined) fields.push(`${result.added} repos fixed`);
      if (result.already !== undefined) fields.push(`${result.already} already done`);
      if (result.written) fields.push(`${result.written.length || result.written} files written`);
      if (result.restored) fields.push(`${result.restored.length || result.restored} files restored`);
      if (result.removed) fields.push(`${result.removed.length || result.removed} removed`);
      if (result.errors && (result.errors.length || result.errors > 0)) fields.push(`${result.errors.length || result.errors} errors`);

      if (fields.length > 0) {
        const row = document.createElement('div');
        row.style.cssText = 'color:var(--text);padding:2px 0;font-weight:500';
        row.textContent = 'Result: ' + fields.join(', ');
        audit.appendChild(row);
      } else {
        // Show raw result as JSON
        const row = document.createElement('pre');
        row.style.cssText = 'color:var(--text-dim);padding:4px 0;font-size:11px;font-family:"SF Mono",Monaco,monospace;white-space:pre-wrap;max-height:100px;overflow-y:auto';
        row.textContent = JSON.stringify(result, null, 2);
        audit.appendChild(row);
      }
    }

    card.appendChild(audit);
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
  } catch(e) {
    badge.style.display = 'none';
  }
}
