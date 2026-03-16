/**
 * ADRs — Architectural Decision Records.
 * Format follows Greenmark Waste Solutions ADR pattern.
 */

function el(tag, css, text) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

// ── ADR Data ────────────────────────────────────────────────────

const ADRS = [
  {
    id: 'ADR-2026-01',
    title: 'Deploy .mcp.json with Gitignore by Default',
    status: 'Accepted',
    date: '2026-03-15',
    owner: 'Daniel Shanklin',
    related: 'Secrets masking, deploy safety, notification system',
    context: [
      'The Eidos MCP Registry deploys .mcp.json files to hundreds of repos across workspace groups.',
      'These files configure which MCP servers Claude Code loads per project.',
      'Deployed .mcp.json files contain: server commands with machine-specific absolute paths (e.g., /Users/dshanklinbv/...), environment variable references as ${VAR} (secrets are masked, not literal), and a _registry_managed tracking array.',
      'Without gitignore protection, these files could be committed to version control, exposing machine-specific paths across team members and creating merge conflicts on every deploy.',
      'Initial notification system flagged 207 repos across 4 groups with .mcp.json files not in .gitignore as HIGH priority.',
    ],
    decision: [
      'All deployed .mcp.json files should be gitignored by default.',
      'The registry provides a one-click "Fix Gitignore" action that adds .mcp.json to every repo\'s .gitignore in a group.',
      'The notification system detects and flags repos with deployed .mcp.json but no gitignore entry.',
      'Priority is MEDIUM (not HIGH) because secrets are already masked as ${VAR} references — the risk is path pollution, not credential exposure.',
    ],
    options: [
      {
        label: 'A. Always gitignore (selected)',
        pros: 'No accidental commits, no path conflicts, no merge noise',
        cons: 'New team members must run registry deploy to get their .mcp.json',
        selected: true,
      },
      {
        label: 'B. Commit sanitized .mcp.json',
        pros: 'New clones get MCP config immediately, serves as documentation',
        cons: 'Machine-specific paths leak, merge conflicts on deploy, git status noise across 200+ repos',
        selected: false,
      },
      {
        label: 'C. Commit template + gitignore local',
        pros: 'Best of both — template documents intent, local has real config',
        cons: 'Two files to manage, registry would need to support template generation, added complexity',
        selected: false,
      },
    ],
    consequences: [
      'New repos cloned into a managed group have no .mcp.json until the registry detects them and the user approves a deploy via the notification inbox.',
      'The registry\'s "Fix Gitignore" bulk action is the primary mechanism for ensuring gitignore coverage.',
      'Secrets are defense-in-depth: even if .mcp.json is accidentally committed, values show ${VAR} not literals.',
      'Machine-specific paths (absolute paths to binaries, module dirs) remain the primary reason for gitignoring — they cause real problems across team members.',
    ],
  },
  {
    id: 'ADR-2026-02',
    title: 'Promote Servers from User Scope to Project-Only',
    status: 'Accepted',
    date: '2026-03-15',
    owner: 'Daniel Shanklin',
    related: 'ADR-2026-01, scoping, deploy',
    context: [
      'Claude Code loads MCP servers from two scopes: user (~/.claude.json, available everywhere) and project (.mcp.json, per-repo).',
      'Project scope overrides user scope for the same server name but does NOT hide other user-scope servers.',
      'After deploying servers to project scope via .mcp.json, the same servers remain in ~/.claude.json and are visible in every project — defeating the purpose of scoping.',
      'Testing confirmed: deploying cerebro-mcp to Greenmark\'s .mcp.json but leaving it in ~/.claude.json resulted in 27 servers loading instead of 11.',
    ],
    decision: [
      'After deploying servers to groups, they should be "promoted" — removed from ~/.claude.json user scope.',
      'The registry provides POST /promote/all to remove all group-assigned servers from user scope in one operation.',
      'Only servers in __universal__ (global) remain in ~/.claude.json. Everything else lives only in project .mcp.json.',
      'A backup of ~/.claude.json is created before any modification.',
    ],
    options: [
      {
        label: 'A. Auto-promote on deploy (rejected)',
        pros: 'Seamless — deploy handles everything',
        cons: 'Destructive without confirmation, hard to undo if wrong, violates "daemon detects, human decides" principle',
        selected: false,
      },
      {
        label: 'B. Manual promote with UI (selected)',
        pros: 'User sees exactly what will be removed, can promote individual servers or all at once, backed up before change',
        cons: 'Extra step after deploy, user might forget',
        selected: true,
      },
      {
        label: 'C. Never modify ~/.claude.json (rejected)',
        pros: 'No risk of breaking user config',
        cons: 'Scoping never actually works — all servers visible everywhere, tokens wasted, confidentiality not enforced',
        selected: false,
      },
    ],
    consequences: [
      'Users must click "Promote to Project-Only" in the Scope Audit panel after deploying. The UI makes this prominent with a warning banner.',
      'The Scope Audit shows exactly which servers are "leaking" (assigned to groups but still in user scope).',
      'Backup at ~/.claude.backup allows manual recovery if promote removes something unintended.',
      'The promote operation is logged to the activity feed for audit.',
    ],
  },
  {
    id: 'ADR-2026-03',
    title: 'Notification-First Operations Over Auto-Actions',
    status: 'Accepted',
    date: '2026-03-15',
    owner: 'Daniel Shanklin',
    related: 'ADR-2026-01, ADR-2026-02, detector system',
    context: [
      'The registry daemon runs continuously and can detect events: new repos, config drift, health failures, stale deploys, missing gitignore.',
      'The question: should the daemon act automatically (e.g., auto-deploy .mcp.json to new repos) or notify and wait for human approval?',
      'Auto-deploy is safe when .mcp.json doesn\'t exist (nothing to lose). But: the daemon can\'t know if a repo was cloned temporarily, if group assignments are stale, or if the user is mid-refactor.',
    ],
    decision: [
      'The daemon detects and creates notifications. Humans approve or dismiss. No auto-actions.',
      'Exception: truly non-destructive reads (scanning, health checks) happen automatically.',
      'Every notification includes: what happened, why it matters, what actions are available, and what each action will do.',
      'This follows the eidos-duet supervision model: AI does the watching, humans do the deciding.',
    ],
    options: [
      {
        label: 'A. Full auto-deploy for new repos (rejected)',
        pros: 'Zero-touch — new repos get config instantly',
        cons: 'Can\'t distinguish intentional clone from temporary, group assignments might be stale, violates supervision principle',
        selected: false,
      },
      {
        label: 'B. Notify and wait for approval (selected)',
        pros: 'Human always sees what will happen, one-click approval is still fast, full audit trail',
        cons: 'Slight delay between detection and action, requires user to check inbox',
        selected: true,
      },
      {
        label: 'C. Auto-deploy only for empty repos, notify for others (considered)',
        pros: 'Safe for new repos, careful for existing ones',
        cons: 'Two different behaviors create confusion, "safe" is context-dependent',
        selected: false,
      },
    ],
    consequences: [
      'The notification inbox is a required part of the workflow — users must check it periodically.',
      'The red badge on the Inbox tab provides passive awareness without requiring active monitoring.',
      'All actions are reversible: deploy has rollback, promote has backup, gitignore can be removed.',
      'The detector runs on daemon startup and can be triggered manually via "Run Detection" button.',
    ],
  },
];

// ── Render ───────────────────────────────────────────────────────

export function renderAdrsView() {
  const container = document.getElementById('view-adrs');
  if (!container) return;
  container.textContent = '';

  const page = el('div', 'max-width:800px;padding:0 20px 40px');

  // Hero
  const hero = el('div', 'padding:32px 0;border-bottom:1px solid var(--border);margin-bottom:24px');
  hero.appendChild(el('h1', 'font-size:32px;font-weight:700;line-height:1.2;margin-bottom:12px', 'Architectural Decision Records'));
  hero.appendChild(el('p', 'font-size:16px;color:var(--text-dim)', 'Why we made the decisions we made. Each ADR documents the context, options considered, and consequences.'));
  page.appendChild(hero);

  // Render each ADR
  for (const adr of ADRS) {
    const card = el('div', 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:20px');

    // Header
    const header = el('div', 'display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)');
    header.appendChild(el('span', 'font-size:12px;color:var(--accent);font-weight:600;font-family:"SF Mono",Monaco,monospace', adr.id));
    header.appendChild(el('h2', 'font-size:17px;font-weight:700;color:var(--text);flex:1;margin:0', adr.title));
    const statusBadge = el('span', 'font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(63,185,80,0.15);color:var(--green);font-weight:600', adr.status);
    header.appendChild(statusBadge);
    card.appendChild(header);

    // Meta
    const meta = el('div', 'display:flex;gap:16px;font-size:12px;color:var(--text-dim);margin-bottom:16px');
    meta.appendChild(el('span', '', 'Date: ' + adr.date));
    meta.appendChild(el('span', '', 'Owner: ' + adr.owner));
    card.appendChild(meta);

    if (adr.related) {
      card.appendChild(el('div', 'font-size:11px;color:var(--text-dim);margin-bottom:16px', 'Related: ' + adr.related));
    }

    // Context
    card.appendChild(el('div', 'font-size:12px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px', 'Context'));
    for (const line of adr.context) {
      const p = el('div', 'font-size:13px;color:var(--text-dim);line-height:1.6;padding:2px 0 2px 12px;border-left:2px solid var(--border);margin-bottom:4px');
      p.textContent = line;
      card.appendChild(p);
    }

    // Decision
    card.appendChild(el('div', 'font-size:12px;font-weight:600;color:var(--green);text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 6px', 'Decision'));
    for (const line of adr.decision) {
      const p = el('div', 'font-size:13px;color:var(--text);line-height:1.6;padding:2px 0 2px 12px;border-left:2px solid var(--green);margin-bottom:4px;font-weight:500');
      p.textContent = line;
      card.appendChild(p);
    }

    // Options
    card.appendChild(el('div', 'font-size:12px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px', 'Options Considered'));
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px';

    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    ['Option', 'Pros', 'Cons'].forEach(h => {
      const th = el('th', 'text-align:left;padding:6px 8px;border-bottom:2px solid var(--border);color:var(--text-dim);font-size:11px;text-transform:uppercase', h);
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const opt of adr.options) {
      const row = document.createElement('tr');
      row.style.cssText = opt.selected ? 'background:rgba(63,185,80,0.05)' : '';
      const tdLabel = el('td', `padding:6px 8px;border-bottom:1px solid var(--border);color:${opt.selected ? 'var(--green)' : 'var(--text-dim)'};font-weight:${opt.selected ? '600' : '400'}`, opt.label);
      const tdPros = el('td', 'padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-dim)', opt.pros);
      const tdCons = el('td', 'padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-dim)', opt.cons);
      row.append(tdLabel, tdPros, tdCons);
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    card.appendChild(table);

    // Consequences
    card.appendChild(el('div', 'font-size:12px;font-weight:600;color:var(--orange);text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 6px', 'Consequences'));
    for (const line of adr.consequences) {
      const p = el('div', 'font-size:13px;color:var(--text-dim);line-height:1.6;padding:2px 0 2px 12px;border-left:2px solid var(--orange);margin-bottom:4px');
      p.textContent = line;
      card.appendChild(p);
    }

    page.appendChild(card);
  }

  container.appendChild(page);
}
