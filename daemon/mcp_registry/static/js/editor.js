/**
 * Editor panel — slide-out config editor for individual servers.
 */

import { state, api, loadData } from './registry.js';

// ── DOM refs ──────────────────────────────────────────────────────

const editorPanel = document.getElementById('editor-panel');
const editorBackdrop = document.getElementById('editor-backdrop');
const editorBody = document.getElementById('editor-body');
const editorTitle = document.getElementById('editor-title');
const editorStatus = document.getElementById('editor-status');
let editingServer = null;

// ── Editor functions ──────────────────────────────────────────────

export function openEditor(serverName) {
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

export function closeEditor() {
  editorPanel.classList.remove('open');
  editorBackdrop.classList.remove('open');
  editingServer = null;
}

export function addTextField(id, label, value) {
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

export function addTextAreaField(id, label, value) {
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

export function addSelectField(id, label, options, selected) {
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

export function addEnvEditor(id, envObj) {
  const field = document.createElement('div');
  field.className = 'editor-field';
  const lbl = document.createElement('label');
  lbl.textContent = 'Environment Variables';
  field.appendChild(lbl);

  // Phase 8: Secret masking hint
  if (Object.keys(envObj).some(k =>
    ['token', 'key', 'secret', 'password', 'credential', 'auth'].some(p => k.toLowerCase().includes(p))
  )) {
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:var(--accent);margin-bottom:8px';
    hint.textContent = '\uD83D\uDD12 Secret values will be masked as ${VAR} references when deployed';
    field.appendChild(hint);
  }

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

export function addEnvRow(container, key, value) {
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

export function collectEditorData() {
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

// ── Event listeners ───────────────────────────────────────────────

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

// ── Wire cards to open editor on click ────────────────────────────

// Intercept card clicks but not interfere with drag.
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
