/**
 * Documentation page — best practices, patterns, and decisions.
 */

function el(tag, css, text) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

function richPara(parts) {
  const p = el('p', 'font-size:14px;color:var(--text-dim);line-height:1.7;margin-bottom:12px');
  for (const part of parts) {
    if (typeof part === 'string') p.appendChild(document.createTextNode(part));
    else if (part.bold) { const s = document.createElement('strong'); s.style.color = 'var(--text)'; s.textContent = part.bold; p.appendChild(s); }
    else if (part.code) { const c = document.createElement('code'); c.style.cssText = 'font-size:13px;color:var(--accent);background:var(--bg);padding:1px 5px;border-radius:3px'; c.textContent = part.code; p.appendChild(c); }
  }
  return p;
}

function sectionTitle(text) {
  return el('h2', 'font-size:20px;font-weight:700;color:var(--text);margin:28px 0 8px', text);
}

function subTitle(text) {
  return el('h3', 'font-size:15px;font-weight:600;color:var(--accent);margin:20px 0 6px', text);
}

function bulletList(items) {
  const list = el('div', 'margin:8px 0 16px;padding-left:4px');
  for (const item of items) {
    const row = el('div', 'display:flex;gap:8px;padding:3px 0;font-size:13px;color:var(--text-dim);line-height:1.6');
    row.appendChild(el('span', 'color:var(--accent);flex-shrink:0', '\u2022'));
    const text = el('span');
    if (typeof item === 'string') {
      text.textContent = item;
    } else {
      for (const part of item) {
        if (typeof part === 'string') text.appendChild(document.createTextNode(part));
        else if (part.bold) { const s = document.createElement('strong'); s.style.color = 'var(--text)'; s.textContent = part.bold; text.appendChild(s); }
        else if (part.code) { const c = document.createElement('code'); c.style.cssText = 'font-size:12px;color:var(--accent);background:var(--bg);padding:0 4px;border-radius:2px'; c.textContent = part.code; text.appendChild(c); }
      }
    }
    row.appendChild(text);
    list.appendChild(row);
  }
  return list;
}

function codeBlock(text) {
  const block = el('pre', 'background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;font-family:"SF Mono",Monaco,monospace;font-size:12px;color:var(--text-dim);overflow-x:auto;margin:8px 0 16px;line-height:1.6');
  block.textContent = text;
  return block;
}

function infoBox(title, text, color) {
  const box = el('div', `background:var(--bg-card);border:1px solid ${color || 'var(--border)'};border-left:3px solid ${color || 'var(--accent)'};border-radius:var(--radius);padding:14px 16px;margin:12px 0`);
  if (title) box.appendChild(el('div', `font-size:13px;font-weight:600;color:${color || 'var(--accent)'};margin-bottom:4px`, title));
  box.appendChild(el('div', 'font-size:13px;color:var(--text-dim);line-height:1.6', text));
  return box;
}

export function renderDocsView() {
  const container = document.getElementById('view-docs');
  if (!container) return;
  container.textContent = '';

  const page = el('div', 'max-width:800px;padding:0 20px 40px');

  // Hero
  const hero = el('div', 'padding:32px 0;border-bottom:1px solid var(--border);margin-bottom:24px');
  hero.appendChild(el('h1', 'font-size:32px;font-weight:700;line-height:1.2;margin-bottom:12px', 'Documentation'));
  hero.appendChild(el('p', 'font-size:16px;color:var(--text-dim)', 'Best practices, decisions, and patterns for MCP server management.'));
  page.appendChild(hero);

  // ═══════════════════════════════════════════════════
  // Gitignore
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('Should You Gitignore .mcp.json?'));

  page.appendChild(richPara([
    {bold: 'Short answer:'}, ' Yes, you usually should gitignore ', {code: '.mcp.json'},
    ' if it\'s editor/client-specific or can contain secrets. But not if you\'re intentionally sharing a sanitized, reusable config.'
  ]));

  page.appendChild(subTitle('When to gitignore .mcp.json'));

  page.appendChild(bulletList([
    ['It is generated or managed by a specific client (Cursor, Kiro, Claude Code) and ', {bold: 'tied to your local environment or paths'}],
    ['It may contain API keys or credentials \u2014 many IDEs drop secrets directly into MCP config files'],
    ['Different devs on the team have different local MCP setups, similar to ', {code: '.vscode/'}, ', ', {code: '.idea/'}, ', or ', {code: '.env'}, ' files'],
    ['It\'s managed by the Eidos Registry \u2014 the registry deploys machine-specific configs with ', {code: '${VAR}'}, ' secret references'],
  ]));

  page.appendChild(infoBox(
    'How the Registry Handles This',
    'The Eidos Registry masks secrets as ${VAR} references (e.g., ${TASKR_API_KEY} instead of sk-test-123). This means .mcp.json files don\'t contain literal secrets. However, they still contain machine-specific paths (e.g., /Users/dshanklinbv/...) that would pollute git history across team members.',
    'var(--accent)'
  ));

  page.appendChild(subTitle('When to commit .mcp.json'));

  page.appendChild(bulletList([
    ['It is a hand-crafted, shared, ', {bold: 'sanitized'}, ' config that documents how your project\'s MCP servers should be wired up'],
    ['You split config into "template + local override" \u2014 commit ', {code: 'mcp.example.json'}, ' and gitignore ', {code: '.mcp.json'}],
    ['The config uses only relative paths and ', {code: '${VAR}'}, ' references \u2014 no machine-specific content'],
  ]));

  page.appendChild(subTitle('Recommended Pattern'));

  page.appendChild(codeBlock(
    '# .gitignore\n' +
    '.mcp.json          # Local config managed by registry\n' +
    '\n' +
    '# Optionally commit a template:\n' +
    '# mcp.example.json  # Sanitized reference config'
  ));

  page.appendChild(richPara([
    'The registry\'s ', {bold: 'Fix Gitignore'}, ' button in notifications adds ', {code: '.mcp.json'},
    ' to every repo\'s ', {code: '.gitignore'}, ' in a group with one click.'
  ]));

  // ═══════════════════════════════════════════════════
  // Scoping
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('How Scoping Works'));

  page.appendChild(richPara([
    'Claude Code loads MCP servers from three layers, in order of precedence:'
  ]));

  page.appendChild(codeBlock(
    'Priority 1: Project scope (.mcp.json in repo root)\n' +
    '            \u2514\u2500 Overrides user scope for same server name\n' +
    '\n' +
    'Priority 2: User scope (~/.claude.json)\n' +
    '            \u2514\u2500 Available in every project\n' +
    '\n' +
    'Priority 3: Local scope (~/.claude.json [project:path])\n' +
    '            \u2514\u2500 Per-project overrides in user config'
  ));

  page.appendChild(infoBox(
    'The Scoping Problem',
    'Project scope overrides user scope for the same server name, but it does NOT hide other user-scope servers. A server in ~/.claude.json is visible in EVERY project regardless of .mcp.json content. This is why the registry\'s Promote feature removes group-assigned servers from user scope.',
    'var(--orange)'
  ));

  page.appendChild(subTitle('The Registry\'s Scoping Flow'));

  page.appendChild(bulletList([
    [{bold: 'Assign'}, ' \u2014 place a server in a group (e.g., cerebro-mcp \u2192 Greenmark)'],
    [{bold: 'Deploy'}, ' \u2014 write .mcp.json files to every repo in the group'],
    [{bold: 'Promote'}, ' \u2014 remove the server from ~/.claude.json so it only exists at project scope'],
    [{bold: 'Verify'}, ' \u2014 the scope audit confirms the server is properly isolated'],
  ]));

  // ═══════════════════════════════════════════════════
  // Secrets
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('Secrets Masking'));

  page.appendChild(richPara([
    'When deploying ', {code: '.mcp.json'}, ' files, the registry automatically replaces secret environment variable values with ', {code: '${VAR}'}, ' references.'
  ]));

  page.appendChild(codeBlock(
    '// Before (in registry store):\n' +
    '"env": {"TASKR_API_KEY": "sk-test-123"}\n' +
    '\n' +
    '// After (in deployed .mcp.json):\n' +
    '"env": {"TASKR_API_KEY": "${TASKR_API_KEY}"}'
  ));

  page.appendChild(richPara([
    'Detection patterns: any env var name containing ', {code: 'token'}, ', ', {code: 'key'},
    ', ', {code: 'secret'}, ', ', {code: 'password'}, ', ', {code: 'credential'},
    ', or ', {code: 'auth'}, ' (case-insensitive) is automatically masked.'
  ]));

  page.appendChild(infoBox(
    'Important',
    'Claude Code resolves ${VAR} references from your shell environment at runtime. The actual secret must be set as an environment variable on your machine. The registry keeps the real value in its store for reference but never writes it to .mcp.json.',
    'var(--green)'
  ));

  // ═══════════════════════════════════════════════════
  // Notifications
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('Notification Priorities'));

  page.appendChild(richPara([
    'The detector scans for conditions that need attention and creates notifications at four priority levels:'
  ]));

  const priorities = el('div', 'margin:12px 0');
  const prioData = [
    ['CRITICAL', 'var(--red)', 'Secrets exposed in git, literal API keys in committed .mcp.json'],
    ['HIGH', 'var(--orange)', 'Server health failures (down >5 minutes)'],
    ['MEDIUM', 'var(--accent)', 'Config drift, stale deploys, missing gitignore'],
    ['LOW', 'var(--text-dim)', 'New repos detected, new servers discovered'],
  ];
  for (const [level, color, desc] of prioData) {
    const row = el('div', 'display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)');
    const badge = el('span', `font-size:11px;padding:2px 10px;border-radius:10px;font-weight:600;color:${color};border:1px solid ${color};width:70px;text-align:center;flex-shrink:0`, level);
    row.appendChild(badge);
    row.appendChild(el('span', 'font-size:13px;color:var(--text-dim)', desc));
    priorities.appendChild(row);
  }
  page.appendChild(priorities);

  page.appendChild(richPara([
    'Notifications use ', {bold: 'fingerprint deduplication'}, ' \u2014 the same issue won\'t create duplicate notifications. Approve or dismiss to clear them.'
  ]));

  // ═══════════════════════════════════════════════════
  // Deploy Safety
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('Deploy Safety'));

  page.appendChild(bulletList([
    [{bold: 'Preview before deploy'}, ' \u2014 the deploy overlay shows exactly which repos will be affected and what changes'],
    [{bold: 'Merge, not overwrite'}, ' \u2014 existing .mcp.json servers the registry doesn\'t manage are preserved'],
    [{bold: 'Snapshot before deploy'}, ' \u2014 every deploy creates a rollback snapshot of all affected files'],
    [{bold: 'One-click rollback'}, ' \u2014 restore any previous state from the deploy history'],
    [{bold: 'Group filtering'}, ' \u2014 deploy to specific groups, not everything at once'],
    [{bold: 'Idempotent'}, ' \u2014 deploying twice produces identical files, no side effects'],
  ]));

  // ═══════════════════════════════════════════════════
  // Architecture
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('Architecture'));

  page.appendChild(codeBlock(
    'eidos-mcp-registry/\n' +
    '  daemon/\n' +
    '    mcp_registry/\n' +
    '      store.py          # Thread-safe registry state + JSON persistence\n' +
    '      server.py         # FastAPI REST + SSE server on :19285\n' +
    '      deployer.py       # .mcp.json generation, merge, deploy, rollback\n' +
    '      scanner.py        # Discovery: claude mcp list + ~/.claude.json + repos\n' +
    '      health.py         # Background health polling\n' +
    '      activity.py       # Ring buffer event log\n' +
    '      notifications.py  # Inbox with priorities + deduplication\n' +
    '      detector.py       # Event detection engine (5 detectors)\n' +
    '      deploy_history.py # Snapshot + rollback\n' +
    '      catalog.py        # Server metadata, completeness scoring\n' +
    '      webhook.py        # Deploy webhook notifications\n' +
    '      renderer.py       # HTML/CSS served as Python constant\n' +
    '      server_catalog.json  # Server metadata store\n' +
    '      static/js/        # ES module frontend\n' +
    '    tests/              # 280+ tests (unit, API, E2E Playwright)'
  ));

  container.appendChild(page);
}
