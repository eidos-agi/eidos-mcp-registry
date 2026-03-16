/**
 * Documentation page — structured guide to the Eidos MCP Registry.
 * Organized by user journey: start → concepts → tabs → background processes.
 */

function el(tag, css, text) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

function richPara(parts) {
  const p = el('p', 'font-size:14px;color:var(--text-dim);line-height:1.8;margin-bottom:16px');
  for (const part of parts) {
    if (typeof part === 'string') p.appendChild(document.createTextNode(part));
    else if (part.bold) { const s = document.createElement('strong'); s.style.color = 'var(--text)'; s.textContent = part.bold; p.appendChild(s); }
    else if (part.code) { const c = document.createElement('code'); c.style.cssText = 'font-size:13px;color:var(--accent);background:var(--bg);padding:1px 5px;border-radius:3px'; c.textContent = part.code; p.appendChild(c); }
  }
  return p;
}

function sectionTitle(text, id) {
  const h = el('h2', 'font-size:20px;font-weight:700;color:var(--text);margin:48px 0 12px;padding-top:20px;border-top:1px solid var(--border)', text);
  if (id) h.id = id;
  return h;
}

function subTitle(text) {
  return el('h3', 'font-size:15px;font-weight:600;color:var(--accent);margin:28px 0 10px', text);
}

function bulletList(items) {
  const list = el('div', 'margin:12px 0 24px;padding-left:4px');
  for (const item of items) {
    const row = el('div', 'display:flex;gap:10px;padding:6px 0;font-size:13px;color:var(--text-dim);line-height:1.7');
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
  const block = el('pre', 'background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:16px 20px;font-family:"SF Mono",Monaco,monospace;font-size:12px;color:var(--text-dim);overflow-x:auto;margin:12px 0 24px;line-height:1.7');
  block.textContent = text;
  return block;
}

function infoBox(title, text, color) {
  const box = el('div', `background:var(--bg-card);border:1px solid ${color || 'var(--border)'};border-left:3px solid ${color || 'var(--accent)'};border-radius:var(--radius);padding:16px 20px;margin:16px 0`);
  if (title) box.appendChild(el('div', `font-size:13px;font-weight:600;color:${color || 'var(--accent)'};margin-bottom:6px`, title));
  box.appendChild(el('div', 'font-size:13px;color:var(--text-dim);line-height:1.7', text));
  return box;
}

function numberedList(items) {
  const list = el('div', 'margin:12px 0 24px;padding-left:4px');
  items.forEach((item, i) => {
    const row = el('div', 'display:flex;gap:10px;padding:6px 0;font-size:13px;color:var(--text-dim);line-height:1.7');
    row.appendChild(el('span', 'color:var(--accent);flex-shrink:0;font-weight:600;min-width:16px', `${i + 1}.`));
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
  });
  return list;
}

function definitionItem(term, definition, note) {
  const item = el('div', 'padding:14px 0;border-bottom:1px solid var(--border)');
  item.appendChild(el('div', 'font-size:14px;font-weight:600;color:var(--text)', term));
  item.appendChild(el('div', 'font-size:13px;color:var(--text-dim);margin-top:4px;line-height:1.7', definition));
  if (note) {
    const why = el('div', 'font-size:12px;color:var(--accent);margin-top:6px;font-style:italic');
    why.textContent = note;
    item.appendChild(why);
  }
  return item;
}

export function renderDocsView() {
  const container = document.getElementById('view-docs');
  if (!container) return;
  container.textContent = '';

  const page = el('div', 'max-width:800px;padding:0 20px 40px');

  // ═══════════════════════════════════════════════════
  // Hero
  // ═══════════════════════════════════════════════════

  const hero = el('div', 'padding:32px 0;border-bottom:1px solid var(--border);margin-bottom:24px');
  hero.appendChild(el('h1', 'font-size:32px;font-weight:700;line-height:1.2;margin-bottom:12px', 'Documentation'));
  const subtitle = el('p', 'font-size:16px;color:var(--text-dim)');
  subtitle.appendChild(document.createTextNode('Everything you need to understand and use the Eidos MCP Registry '));
  const ccBadge = el('span', 'color:#da7756;font-weight:600');
  ccBadge.textContent = 'for Claude Code';
  subtitle.appendChild(ccBadge);
  subtitle.appendChild(document.createTextNode(', from first launch to advanced workflows.'));
  hero.appendChild(subtitle);
  page.appendChild(hero);

  // ═══════════════════════════════════════════════════
  // Table of Contents
  // ═══════════════════════════════════════════════════

  const tocSections = [
    ['getting-started', 'Getting Started'],
    ['key-concepts', 'Key Concepts'],
    ['tab-by-tab', 'The App \u2014 Tab by Tab'],
    ['detection-scans', 'Detection Scans'],
    ['scoping', 'How Scoping Works'],
    ['deploy', 'How Deploy Works'],
    ['secrets', 'Secrets Masking'],
    ['gitignore', 'Gitignore Best Practices'],
    ['catalog', 'Server Catalog & Documentation'],
    ['notifications', 'Notification System'],
    ['architecture', 'Architecture'],
  ];

  const toc = el('div', 'margin-bottom:28px');
  toc.appendChild(el('div', 'font-size:12px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px', 'Contents'));
  const tocGrid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:8px 24px');
  for (const [id, label] of tocSections) {
    const link = el('a', 'font-size:13px;color:var(--accent);text-decoration:none;padding:4px 0;cursor:pointer;display:block', label);
    link.href = `#${id}`;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    tocGrid.appendChild(link);
  }
  toc.appendChild(tocGrid);
  page.appendChild(toc);

  // ═══════════════════════════════════════════════════
  // 1. Getting Started
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('Getting Started', 'getting-started'));

  page.appendChild(richPara([
    'The Eidos MCP Registry is a local daemon built specifically for ', {bold: 'Claude Code'}, ' users. It manages which MCP servers are available in which projects. Instead of manually editing ',
    {code: '.mcp.json'}, ' files in every repo and keeping ', {code: '~/.claude.json'}, ' in sync, the registry gives you a single UI to organize, deploy, and monitor all your MCP servers across Claude Code\'s scoping system.'
  ]));

  page.appendChild(subTitle('The 4-Step Lifecycle'));

  page.appendChild(numberedList([
    [{bold: 'Scan'}, ' \u2014 The registry discovers your MCP servers from ', {code: '~/.claude.json'}, ', ', {code: 'claude mcp list'}, ', and project ', {code: '.mcp.json'}, ' files.'],
    [{bold: 'Assign'}, ' \u2014 Drag servers into groups. Each group maps to a set of repos that share the same MCP servers.'],
    [{bold: 'Deploy'}, ' \u2014 Write ', {code: '.mcp.json'}, ' files to every repo in each group. The registry handles merge, secrets masking, and snapshots.'],
    [{bold: 'Promote'}, ' \u2014 Remove deployed servers from ', {code: '~/.claude.json'}, ' user scope so they only appear where assigned.'],
  ]));

  page.appendChild(subTitle('First-Time Flow'));

  page.appendChild(richPara([
    'When you first open the app, the registry has already scanned your system. You\'ll see your servers on the ',
    {bold: 'Servers'}, ' tab. From there:'
  ]));

  page.appendChild(numberedList([
    'Drag servers from the catalog into groups on the Servers tab (or create groups on the Groups tab first).',
    'Open the Groups tab, select a group, and click Deploy to write .mcp.json to its repos.',
    'Back on Servers, open the Scope Audit panel and click Promote to clean up user scope.',
    'Check the Inbox tab for any notifications about drift, missing gitignore, or new repos.',
  ]));

  // ═══════════════════════════════════════════════════
  // 2. Key Concepts
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('Key Concepts', 'key-concepts'));

  page.appendChild(richPara([
    'Reference glossary for terms used throughout the registry.'
  ]));

  const glossary = el('div', 'margin:8px 0 16px');

  glossary.appendChild(definitionItem(
    'Server',
    'An MCP server \u2014 a process that exposes tools to Claude Code via the Model Context Protocol.',
    'Each server has a name, command, args, and optional env vars.'
  ));
  glossary.appendChild(definitionItem(
    'Group',
    'A named collection of repos that share the same set of MCP servers. Examples: "Greenmark", "Data Pipeline", "Personal".',
    'Groups are how you scope servers to only the projects that need them.'
  ));
  glossary.appendChild(definitionItem(
    'Global (Universal)',
    'A special group for servers that should be available in every project. Global servers are kept in user scope.',
    'Use sparingly \u2014 every global server adds token overhead to every conversation.'
  ));
  glossary.appendChild(definitionItem(
    'Assign',
    'Place a server into a group. This tells the registry which repos should have access to that server.',
  ));
  glossary.appendChild(definitionItem(
    'Deploy',
    'Write .mcp.json files to all repos in a group based on the registry\'s current assignments. Handles merge, secrets masking, and snapshots.',
  ));
  glossary.appendChild(definitionItem(
    'Promote',
    'Remove a server from ~/.claude.json user scope after deploying it to project-scoped .mcp.json files. Prevents the server from leaking into every project.',
    'Without promotion, group-assigned servers still appear everywhere via user scope.'
  ));
  glossary.appendChild(definitionItem(
    'Detection Scan',
    'An automated sweep that checks for drift, new repos, health failures, and missing gitignore entries. Runs at daemon startup and on-demand via the Inbox tab.',
    'Creates notifications for anything that needs attention. See the Detection Scans section below.'
  ));
  glossary.appendChild(definitionItem(
    'Drift',
    'When a deployed .mcp.json file on disk no longer matches what the registry would generate. Caused by manual edits, re-deploys with different assignments, or external tools modifying the file.',
    'The drift detector shows exactly which servers would be added, removed, or updated.'
  ));
  glossary.appendChild(definitionItem(
    'Scope Audit',
    'A per-server report showing whether each server is correctly scoped. Flags servers that are "leaking" to unintended projects.',
    'Statuses: Global, Scoped, Needs Promote, Unassigned. See How Scoping Works.'
  ));
  glossary.appendChild(definitionItem(
    'Token Budget',
    'The estimated token cost of a server\'s tool schemas. Each tool adds ~250 tokens of schema overhead per API call, multiplied across every message in a conversation.',
    'The Tokens tab visualizes per-group budgets and the snowball effect.'
  ));
  glossary.appendChild(definitionItem(
    'Disable / Enable',
    'Temporarily disable a server without removing it from groups. Disabled servers are excluded from deploys.',
  ));
  glossary.appendChild(definitionItem(
    'Rollback',
    'Restore .mcp.json files to a previous snapshot taken before a deploy. Available from the group detail page.',
  ));
  glossary.appendChild(definitionItem(
    'Merge Strategy',
    'During deploy, registry-managed servers are updated while user-added servers in the same .mcp.json are preserved. Tracked via a _registry_managed array.',
    'This means you can hand-edit .mcp.json for local servers without the registry overwriting them.'
  ));

  page.appendChild(glossary);

  // ═══════════════════════════════════════════════════
  // 3. The App — Tab by Tab
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('The App \u2014 Tab by Tab', 'tab-by-tab'));

  page.appendChild(richPara([
    'The left rail has 13 tabs. The first four are operational; the rest are informational.'
  ]));

  // -- Servers
  page.appendChild(subTitle('Servers'));
  page.appendChild(richPara([
    'The main workspace. Shows a tile grid of all discovered servers, organized into a ', {bold: 'Global'}, ' section and ', {bold: 'group drop zones'}, '. Each tile shows the server name, tool count, token cost bar, and completeness grade.'
  ]));
  page.appendChild(bulletList([
    [{bold: 'Drag to assign'}, ' \u2014 drag a server tile into a group zone to assign it'],
    [{bold: 'Scope Audit panel'}, ' \u2014 shows per-server scoping status (Global, Scoped, Needs Promote, Unassigned). Click Promote to fix leaking servers'],
    [{bold: 'Server detail'}, ' \u2014 click a tile to see full metadata, documentation score, tool list, environment variables, and group membership'],
    [{bold: 'Token bars'}, ' \u2014 the colored bar on each tile indicates token cost: ', {bold: 'green'}, ' (<5K), ', {bold: 'orange'}, ' (5\u201310K), ', {bold: 'red'}, ' (>10K tokens per message)'],
  ]));

  // -- Groups
  page.appendChild(subTitle('Groups'));
  page.appendChild(richPara([
    'Card list of all groups. Click a group to see its detail page with:'
  ]));
  page.appendChild(bulletList([
    [{bold: 'Assigned servers'}, ' \u2014 accordion list of servers in this group with their configs'],
    [{bold: 'Repos'}, ' \u2014 list of repos in the group\'s directory path'],
    [{bold: 'Deploy button'}, ' \u2014 preview changes, then write .mcp.json to all repos'],
    [{bold: 'Rollback'}, ' \u2014 restore a previous deploy snapshot'],
    [{bold: 'Gitignore status'}, ' \u2014 shows which repos have .mcp.json in .gitignore'],
  ]));

  // -- Inbox
  page.appendChild(subTitle('Inbox'));
  page.appendChild(richPara([
    'Notification cards from detection scans. Each card shows what was detected, the priority level, and action buttons.'
  ]));
  page.appendChild(bulletList([
    [{bold: 'Approve'}, ' \u2014 execute the suggested fix (deploy, add gitignore, etc.) and record an audit proof'],
    [{bold: 'Dismiss'}, ' \u2014 acknowledge without acting; removes the notification'],
    [{bold: 'Run Detection'}, ' \u2014 button at the top to trigger a fresh detection scan on demand'],
    'Each notification includes an audit proof showing what action was taken and when',
  ]));

  // -- Log
  page.appendChild(subTitle('Log'));
  page.appendChild(richPara([
    'Chronological activity feed of every action: deploys, assignments, promotions, health checks, and more. Supports filters by event type and text search.'
  ]));

  // -- Tokens
  page.appendChild(subTitle('Tokens'));
  page.appendChild(richPara([
    'Token budget visualization showing the real cost of MCP server tool schemas.'
  ]));
  page.appendChild(bulletList([
    [{bold: 'Per-server costs'}, ' \u2014 tool count \u00d7 250 tokens/tool = schema overhead per API call'],
    [{bold: 'Group budgets'}, ' \u2014 each group\'s total token cost (own servers + global floor)'],
    [{bold: 'Snowball charts'}, ' \u2014 tool schemas are re-sent in every API call, so costs multiply across a conversation'],
    [{bold: 'Compression risk'}, ' \u2014 shows at which message number the context window fills (unscoped fills faster)'],
    [{bold: 'Savings estimate'}, ' \u2014 monthly/yearly cost savings from scoping, based on $3/million input tokens'],
  ]));

  // -- Content tabs
  page.appendChild(subTitle('Content Tabs'));
  page.appendChild(bulletList([
    [{bold: 'Why MCP'}, ' \u2014 explains the Model Context Protocol and why it matters'],
    [{bold: 'Why Eidos'}, ' \u2014 the registry\'s value proposition'],
    [{bold: 'Rebuttal'}, ' \u2014 counter-arguments to common objections'],
    [{bold: 'CLI vs MCP'}, ' \u2014 comparison of CLI tool wrapping vs native MCP servers'],
    [{bold: 'Lazy Load'}, ' \u2014 on-demand server loading to reduce token overhead'],
    [{bold: 'Docs'}, ' \u2014 this page'],
    [{bold: 'ADRs'}, ' \u2014 architectural decision records documenting key design choices'],
  ]));

  // ═══════════════════════════════════════════════════
  // 4. Detection Scans — In Depth
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('Detection Scans \u2014 In Depth', 'detection-scans'));

  page.appendChild(richPara([
    'A detection scan is an automated sweep that inspects your filesystem and registry state for conditions that need attention. It creates notifications in the Inbox for anything it finds.'
  ]));

  page.appendChild(subTitle('When Scans Run'));
  page.appendChild(bulletList([
    [{bold: 'Daemon startup'}, ' \u2014 a full scan runs automatically every time the registry daemon starts'],
    [{bold: 'Manual trigger'}, ' \u2014 click the ', {bold: 'Run Detection'}, ' button at the top of the Inbox tab'],
  ]));

  page.appendChild(subTitle('The 4 Detectors'));

  page.appendChild(infoBox(
    '1. New Repos',
    'Scans each group\'s directory path for repos that don\'t have a .mcp.json file yet. If a new repo appears in a group\'s directory, you\'ll get a notification offering one-click deploy to bring it in line with the group\'s server config.',
    'var(--accent)'
  ));

  page.appendChild(infoBox(
    '2. Drift',
    'Compares .mcp.json files on disk to what the registry would generate. If someone manually edited the file, or you changed assignments without re-deploying, drift shows exactly which servers would be added, removed, or updated. Creates a per-group notification with the diff.',
    'var(--orange)'
  ));

  page.appendChild(infoBox(
    '3. Health Failures',
    'Monitors server health status. If a server has been reporting "failed" health checks for more than 5 minutes, a notification is created with the option to re-scan. Prevents you from deploying broken servers without knowing.',
    'var(--red)'
  ));

  page.appendChild(infoBox(
    '4. Missing Gitignore',
    'Scans repos in each group for .mcp.json files that aren\'t listed in .gitignore. Since .mcp.json contains machine-specific paths, committing it to git pollutes history across team members. The notification offers a bulk-fix to add .mcp.json to all affected .gitignore files.',
    'var(--accent)'
  ));

  page.appendChild(subTitle('How Notifications Are Created'));

  page.appendChild(richPara([
    'Each detector generates a ', {bold: 'fingerprint'}, ' for every issue it finds (e.g., a hash of the group name + drift type). If a notification with the same fingerprint already exists, no duplicate is created. This means running detection repeatedly is safe \u2014 you won\'t get spammed.'
  ]));

  page.appendChild(subTitle('Notification Lifecycle'));

  page.appendChild(codeBlock(
    'Detection scan finds issue\n' +
    '  \u2514\u2500 Creates notification (with fingerprint)\n' +
    '       \u251c\u2500 Approve \u2192 executes fix + records audit proof\n' +
    '       \u2514\u2500 Dismiss \u2192 removes notification, no action taken'
  ));

  // ═══════════════════════════════════════════════════
  // 5. How Scoping Works
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('How Scoping Works', 'scoping'));

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
    'The Core Problem',
    'Project scope overrides user scope for the same server name, but it does NOT hide other user-scope servers. A server in ~/.claude.json is visible in EVERY project regardless of .mcp.json content. If you have 30 servers in user scope, every project sees all 30 \u2014 burning tokens and cluttering Claude\'s tool list.',
    'var(--orange)'
  ));

  page.appendChild(subTitle('The Registry\'s Solution: Assign \u2192 Deploy \u2192 Promote'));

  page.appendChild(numberedList([
    [{bold: 'Assign'}, ' \u2014 place a server in a group (e.g., cerebro-mcp \u2192 Greenmark). This is intent only; nothing on disk changes yet.'],
    [{bold: 'Deploy'}, ' \u2014 write .mcp.json files to every repo in the group. Now those repos have the server at project scope.'],
    [{bold: 'Promote'}, ' \u2014 remove the server from ', {code: '~/.claude.json'}, ' so it ', {bold: 'only'}, ' exists at project scope. This stops the leak.'],
  ]));

  page.appendChild(subTitle('Scope Audit Statuses'));

  page.appendChild(richPara([
    'The Scope Audit panel on the Servers tab shows one status per server:'
  ]));

  const auditStatuses = el('div', 'margin:8px 0 16px');
  const statusData = [
    ['Global', 'var(--accent)', 'In the universal group AND in ~/.claude.json. Correct for servers that belong everywhere.'],
    ['Scoped', 'var(--green)', 'Assigned to group(s) only, not in user scope. This is the ideal state for non-global servers.'],
    ['Needs Promote', 'var(--red)', 'Assigned to a group but still in ~/.claude.json. The server leaks to every project. Click Promote to fix.'],
    ['Unassigned (user)', 'var(--orange)', 'Not in any group, only in ~/.claude.json. Visible everywhere. Assign to a group or mark as global.'],
    ['Unassigned (orphan)', 'var(--text-dim)', 'Not assigned and not in user scope. The server exists in the catalog but isn\'t deployed anywhere.'],
  ];
  for (const [status, color, desc] of statusData) {
    const row = el('div', 'display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)');
    const badge = el('span', `font-size:11px;padding:2px 10px;border-radius:10px;font-weight:600;color:${color};border:1px solid ${color};min-width:80px;text-align:center;flex-shrink:0;white-space:nowrap`, status);
    row.appendChild(badge);
    row.appendChild(el('span', 'font-size:13px;color:var(--text-dim);line-height:1.5', desc));
    auditStatuses.appendChild(row);
  }
  page.appendChild(auditStatuses);

  page.appendChild(richPara([
    'You can promote servers individually from the Scope Audit panel or use ', {bold: 'Promote All'},
    ' to remove every group-assigned server from user scope in one operation. A backup of ',
    {code: '~/.claude.json'}, ' is created before any promotion.'
  ]));

  // ═══════════════════════════════════════════════════
  // 6. How Deploy Works
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('How Deploy Works', 'deploy'));

  page.appendChild(subTitle('Step by Step'));

  page.appendChild(numberedList([
    'You click Deploy on a group detail page.',
    'The registry builds the effective server set: group-assigned servers + global servers, with per-group config overrides applied.',
    'A deploy preview shows every repo that will be affected and exactly what will change (servers added, removed, updated).',
    'You confirm. The registry snapshots every affected .mcp.json file for rollback.',
    'New .mcp.json files are written using the merge strategy (see below).',
    'An activity log entry is recorded with the full diff.',
  ]));

  page.appendChild(subTitle('Merge Strategy'));

  page.appendChild(richPara([
    'The registry tracks which servers it manages via a ', {code: '_registry_managed'}, ' array inside each ', {code: '.mcp.json'}, ' file. During deploy:'
  ]));

  page.appendChild(bulletList([
    [{bold: 'Registry-managed servers'}, ' \u2014 added or updated to match the current effective set'],
    [{bold: 'Previously managed, now unassigned'}, ' \u2014 removed from the file'],
    [{bold: 'User-added servers'}, ' \u2014 any server NOT in ', {code: '_registry_managed'}, ' is preserved untouched'],
  ]));

  page.appendChild(infoBox(
    'Safe by Default',
    'If you hand-edit .mcp.json to add a local-only server, the registry won\'t overwrite it. Only servers the registry placed there (tracked in _registry_managed) are touched during deploy.',
    'var(--green)'
  ));

  page.appendChild(subTitle('Other Deploy Properties'));

  page.appendChild(bulletList([
    [{bold: 'Secrets masking'}, ' \u2014 env var values matching secret patterns are replaced with ', {code: '${VAR}'}, ' references (see Secrets Masking below)'],
    [{bold: 'Snapshot before deploy'}, ' \u2014 every deploy creates a rollback snapshot of all affected files'],
    [{bold: 'Deploy preview'}, ' \u2014 see exactly what changes before writing anything to disk'],
    [{bold: 'Dependency checking'}, ' \u2014 warns if a server depends on another server that isn\'t in the effective set'],
    [{bold: 'Idempotent'}, ' \u2014 deploying twice produces identical files with no side effects'],
  ]));

  // ═══════════════════════════════════════════════════
  // 7. Secrets Masking
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('Secrets Masking', 'secrets'));

  page.appendChild(richPara([
    'When deploying ', {code: '.mcp.json'}, ' files, the registry automatically replaces secret environment variable values with ', {code: '${VAR}'}, ' references so raw secrets never hit disk.'
  ]));

  page.appendChild(codeBlock(
    '// Before (in registry store):\n' +
    '"env": {"TASKR_API_KEY": "sk-test-123"}\n' +
    '\n' +
    '// After (in deployed .mcp.json):\n' +
    '"env": {"TASKR_API_KEY": "${TASKR_API_KEY}"}'
  ));

  page.appendChild(subTitle('Detection Patterns'));

  page.appendChild(richPara([
    'Any env var name containing these strings (case-insensitive) is automatically masked:'
  ]));

  page.appendChild(bulletList([
    [{code: 'token'}, ', ', {code: 'key'}, ', ', {code: 'secret'}, ', ', {code: 'password'}, ', ', {code: 'credential'}, ', ', {code: 'auth'}],
  ]));

  page.appendChild(subTitle('How Resolution Works'));

  page.appendChild(richPara([
    'Claude Code resolves ', {code: '${VAR}'}, ' references from your shell environment at runtime. The actual secret must be set as an environment variable on your machine. The registry keeps the real value in its store for reference but never writes it to ', {code: '.mcp.json'}, '.'
  ]));

  page.appendChild(infoBox(
    'Defense in Depth',
    'Secrets masking + gitignore = two layers of protection. Even if .mcp.json is accidentally committed, it contains ${VAR} references instead of real secrets. But you should still gitignore \u2014 the file contains machine-specific paths.',
    'var(--green)'
  ));

  // ═══════════════════════════════════════════════════
  // 8. Gitignore Best Practices
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('Gitignore Best Practices', 'gitignore'));

  page.appendChild(subTitle('When to Gitignore .mcp.json'));

  page.appendChild(bulletList([
    ['It\'s managed by the registry \u2014 contains machine-specific paths like ', {code: '/Users/yourname/...'}, ' that differ per developer'],
    'It\'s generated by a specific client (Cursor, Kiro, Claude Code) tied to your local environment',
    'It may contain API keys or credentials \u2014 many IDEs drop secrets directly into MCP config files',
    'Different devs on the team have different local MCP setups',
  ]));

  page.appendChild(subTitle('When to Commit .mcp.json'));

  page.appendChild(bulletList([
    ['It\'s a hand-crafted, shared, ', {bold: 'sanitized'}, ' config using only relative paths and ', {code: '${VAR}'}, ' references'],
    ['You use a split approach: commit ', {code: 'mcp.example.json'}, ' as a template, gitignore ', {code: '.mcp.json'}],
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
    'The registry\'s ', {bold: 'Fix Gitignore'}, ' action (available in Inbox notifications and group detail) adds ', {code: '.mcp.json'},
    ' to every repo\'s ', {code: '.gitignore'}, ' in a group with one click.'
  ]));

  // ═══════════════════════════════════════════════════
  // 9. Server Catalog & Documentation
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('Server Catalog & Documentation', 'catalog'));

  page.appendChild(richPara([
    'Every discovered server has a catalog entry with metadata, documentation, and a completeness score.'
  ]));

  page.appendChild(subTitle('Completeness Scoring'));

  page.appendChild(richPara([
    'Each server is graded A through F based on how well-documented it is. The score is a weighted sum of fields:'
  ]));

  page.appendChild(bulletList([
    'Description, category, author, version, homepage, repository URL',
    'Tool descriptions, argument schemas, example usage',
    'README content (auto-enriched from filesystem if available)',
  ]));

  page.appendChild(richPara([
    'Grades appear as badges on server tiles. Click a tile to see the full detail page with every scored field.'
  ]));

  page.appendChild(subTitle('Auto-Enrichment'));

  page.appendChild(richPara([
    'The registry automatically reads README files, package.json, and pyproject.toml from server directories to fill in missing metadata. This happens during scanning and can be re-triggered from the server detail page.'
  ]));

  page.appendChild(subTitle('Token Bars on Tiles'));

  page.appendChild(richPara([
    'The colored bar at the bottom of each server tile shows estimated token cost per API call:'
  ]));

  page.appendChild(bulletList([
    [{bold: 'Green'}, ' \u2014 under 5,000 tokens (lightweight server)'],
    [{bold: 'Orange'}, ' \u2014 5,000\u201310,000 tokens (moderate overhead)'],
    [{bold: 'Red'}, ' \u2014 over 10,000 tokens (heavy; consider lazy loading or splitting)'],
  ]));

  // ═══════════════════════════════════════════════════
  // 10. Notification System
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('Notification System', 'notifications'));

  page.appendChild(subTitle('Priority Levels'));

  const priorities = el('div', 'margin:12px 0');
  const prioData = [
    ['CRITICAL', 'var(--red)', 'Secrets exposed in git, literal API keys in committed .mcp.json'],
    ['HIGH', 'var(--orange)', 'Server health failures (down >5 minutes)'],
    ['MEDIUM', 'var(--accent)', 'Config drift, stale deploys, missing gitignore'],
    ['LOW', 'var(--text-dim)', 'New repos detected, new servers discovered'],
  ];
  for (const [level, color, desc] of prioData) {
    const row = el('div', 'display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)');
    const badge = el('span', `font-size:11px;padding:2px 10px;border-radius:10px;font-weight:600;color:${color};border:1px solid ${color};width:70px;text-align:center;flex-shrink:0`, level);
    row.appendChild(badge);
    row.appendChild(el('span', 'font-size:13px;color:var(--text-dim)', desc));
    priorities.appendChild(row);
  }
  page.appendChild(priorities);

  page.appendChild(subTitle('Approve vs Dismiss'));

  page.appendChild(bulletList([
    [{bold: 'Approve'}, ' \u2014 executes the suggested fix (deploy to new repos, add gitignore, re-scan health) and records an ', {bold: 'audit proof'}, ' with timestamp and action details'],
    [{bold: 'Dismiss'}, ' \u2014 removes the notification without taking action. The issue may be re-detected on the next scan if it still exists'],
  ]));

  page.appendChild(subTitle('Deduplication'));

  page.appendChild(richPara([
    'Every notification carries a ', {bold: 'fingerprint'}, ' \u2014 a hash of the issue type and relevant identifiers. If a notification with the same fingerprint already exists in the inbox, the detector skips it. This makes repeated scans safe: you won\'t see duplicates.'
  ]));

  // ═══════════════════════════════════════════════════
  // 11. Architecture
  // ═══════════════════════════════════════════════════

  page.appendChild(sectionTitle('Architecture', 'architecture'));

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
    '      detector.py       # Detection scan engine (4 detectors)\n' +
    '      deploy_history.py # Snapshot + rollback\n' +
    '      catalog.py        # Server metadata, completeness scoring\n' +
    '      webhook.py        # Deploy webhook notifications\n' +
    '      renderer.py       # HTML/CSS served as Python constant\n' +
    '      server_catalog.json  # Server metadata store\n' +
    '      static/js/        # ES module frontend\n' +
    '    tests/              # 280+ tests (unit, API, E2E Playwright)'
  ));

  page.appendChild(subTitle('Data Flow'));

  page.appendChild(codeBlock(
    'Scanner \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n' +
    '\u2502  Discovers servers from CLI, ~/.claude.json, repos    \u2502\n' +
    '\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n' +
    '                         \u2502\n' +
    '                    Store (JSON)\n' +
    '                    \u251c\u2500 servers{}\n' +
    '                    \u251c\u2500 groups{}\n' +
    '                    \u2514\u2500 assignments{}\n' +
    '                         \u2502\n' +
    '          \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n' +
    '          \u2502             \u2502             \u2502\n' +
    '      Deployer      Detector     Health\n' +
    '      \u251c\u2500 merge     \u251c\u2500 drift     \u251c\u2500 poll\n' +
    '      \u251c\u2500 mask      \u251c\u2500 new repo  \u2514\u2500 notify\n' +
    '      \u251c\u2500 snapshot  \u251c\u2500 health\n' +
    '      \u2514\u2500 write     \u2514\u2500 gitignore\n' +
    '          \u2502             \u2502\n' +
    '      .mcp.json    Notifications\n' +
    '      (on disk)    (Inbox tab)'
  ));

  container.appendChild(page);
}
