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
  {
    id: 'ADR-2026-04',
    title: 'Secrets Masking via ${VAR} References, Not Literal Removal',
    status: 'Accepted',
    date: '2026-03-15',
    owner: 'Daniel Shanklin',
    related: 'ADR-2026-01, deploy safety',
    context: [
      'Deployed .mcp.json files contain environment variables, some of which are secrets (API keys, tokens, passwords).',
      'Writing literal secret values to .mcp.json files in hundreds of repos creates a massive exposure surface.',
      'Three approaches were considered: write literals (dangerous), strip env vars entirely (breaks servers), or write ${VAR} references (safe, functional).',
      'Claude Code supports ${VAR} syntax in .mcp.json \u2014 it resolves references from the shell environment at runtime.',
    ],
    decision: [
      'Secret env vars are replaced with ${VAR} references during deploy (e.g., TASKR_API_KEY: "sk-123" becomes TASKR_API_KEY: "${TASKR_API_KEY}").',
      'Detection uses pattern matching: any env var name containing token, key, secret, password, credential, or auth (case-insensitive) is masked.',
      'Non-secret env vars (NODE_ENV, PORT, CEREBRO_DB) retain their literal values.',
      'The registry store keeps the original literal values for reference and catalog display.',
    ],
    options: [
      {
        label: 'A. Write literal secret values (rejected)',
        pros: 'Simple, no transformation needed',
        cons: 'Secrets in plaintext across hundreds of repos, one git commit exposes everything',
        selected: false,
      },
      {
        label: 'B. Strip env vars entirely (rejected)',
        pros: 'No secrets anywhere',
        cons: 'Breaks servers that require env vars \u2014 MCP server won\'t start without its API key reference',
        selected: false,
      },
      {
        label: 'C. ${VAR} references (selected)',
        pros: 'Preserves config structure, Claude Code resolves at runtime, defense-in-depth with gitignore',
        cons: 'Requires env vars to be set in shell, pattern matching may miss unusual secret names',
        selected: true,
      },
    ],
    consequences: [
      'Users must have secret values set as environment variables in their shell for servers to function.',
      'The deployed .mcp.json is safe to inspect \u2014 no literal secrets, only variable references.',
      'Combined with gitignore (ADR-2026-01), this provides two layers of protection: masking + exclusion from version control.',
      'The editor UI shows a hint when secret env vars are detected: "Secret values will be masked as ${VAR} references when deployed."',
    ],
  },
  {
    id: 'ADR-2026-05',
    title: 'Group-Based Scoping Over Per-Repo Configuration',
    status: 'Accepted',
    date: '2026-03-15',
    owner: 'Daniel Shanklin',
    related: 'ADR-2026-02, token optimization',
    context: [
      'The registry needs to determine which MCP servers each repo gets. Two granularity levels are possible: per-group (~/repos-greenmark/ gets cerebro-mcp) or per-repo (each repo individually configured).',
      'The user has 10 workspace groups containing ~200+ total repos.',
      'Most repos within a group need the same servers \u2014 all Greenmark repos need cerebro-mcp, all Aic repos need taskr and wrike.',
      'Exceptions exist (one repo in a group needs a different server) but are rare.',
    ],
    decision: [
      'Scoping is done at the group level. All repos in a group inherit the group\'s servers plus global servers.',
      'Per-repo overrides exist via the repo_overrides system (add/remove specific servers for a single repo) for exceptions.',
      'Groups map to ~/repos-*/ directories, discovered automatically by the scanner.',
    ],
    options: [
      {
        label: 'A. Per-repo configuration (rejected)',
        pros: 'Maximum flexibility, exact control per repo',
        cons: 'Unmanageable at 200+ repos, every clone requires individual config, no inheritance',
        selected: false,
      },
      {
        label: 'B. Group-based with overrides (selected)',
        pros: 'Manageable (10 groups vs 200 repos), automatic inheritance, exceptions handled via overrides',
        cons: 'Slightly coarser than per-repo, repos in wrong directory get wrong servers',
        selected: true,
      },
      {
        label: 'C. Tag-based (rejected)',
        pros: 'Flexible grouping independent of filesystem',
        cons: 'Requires maintaining tags per repo, no natural discovery mechanism, adds complexity',
        selected: false,
      },
    ],
    consequences: [
      'Repo organization on disk matters \u2014 repos in ~/repos-greenmark/ get Greenmark servers.',
      'Moving a repo between directories changes its MCP servers (after redeploy).',
      'The per-repo override system handles exceptions without breaking the group model.',
      'Token savings of 43% were achieved with group-level scoping alone \u2014 per-repo would save marginally more but at much higher management cost.',
    ],
  },
  {
    id: 'ADR-2026-06',
    title: 'Registry Maintains All Servers Regardless of Assignment',
    status: 'Accepted',
    date: '2026-03-15',
    owner: 'Daniel Shanklin',
    related: 'ADR-2026-02, server lifecycle',
    context: [
      'When a server is disabled (removed from all groups and user scope), the question is whether to delete it from the registry entirely or keep it as a known entity.',
      'MCP servers come and go \u2014 you might disable taskr for a week then re-enable it.',
      'The registry serves as the single source of truth for all known servers, including their catalog metadata, documentation, and configuration.',
    ],
    decision: [
      'Disabling a server removes it from groups and user scope but does NOT delete it from registry.json.',
      'The server remains visible in the Servers view under a collapsible "Disabled" section with dashed borders and reduced opacity.',
      'Disabled servers show their token savings ("25,500 tokens saved") as a green badge.',
      'Re-enabling is done from the server detail page via the "Assign to group" dropdown.',
    ],
    options: [
      {
        label: 'A. Hard delete from registry (rejected)',
        pros: 'Clean data, no stale entries',
        cons: 'Lose all catalog metadata, docs, and config. Must re-scan to rediscover. Irreversible.',
        selected: false,
      },
      {
        label: 'B. Soft disable, keep in registry (selected)',
        pros: 'Preserve all metadata, instant re-enable, shows savings, complete audit history',
        cons: 'Registry grows over time with servers you may never re-enable',
        selected: true,
      },
    ],
    consequences: [
      'The Servers view always shows the complete picture \u2014 active servers with token costs, disabled servers with savings.',
      'The token savings display on disabled servers reinforces the value of scoping decisions.',
      'Server catalog completeness, documentation, and risk notes survive disable/enable cycles.',
    ],
  },
  {
    id: 'ADR-2026-07',
    title: 'Token Budget Transparency Over Hidden Optimization',
    status: 'Accepted',
    date: '2026-03-15',
    owner: 'Daniel Shanklin',
    related: 'Token Savings page, Why Eidos page',
    context: [
      'The registry reduces token overhead by scoping servers to groups. The savings are real but invisible without explicit measurement.',
      'Two approaches: silently optimize (just scope and let it work) or build comprehensive visibility into token costs.',
      'The user has 469 tools across 27 servers, consuming ~117K tokens per message when unscoped.',
      'Perplexity\'s CTO cited token overhead as the reason for abandoning MCP entirely \u2014 visibility is the counter-argument.',
    ],
    decision: [
      'Build a full Token Savings page showing per-server token costs, per-group budgets, the snowball effect across sessions, and projected savings.',
      'Every server tile shows a token bar and count, making cost viscerally visible.',
      'The Why Eidos page uses live metrics from the actual server state, not theoretical numbers.',
      'Charts use canvas-based rendering to show context window pressure, cumulative billing, and the session elongation snowball.',
    ],
    options: [
      {
        label: 'A. Silent optimization (rejected)',
        pros: 'Simpler, less code, less maintenance',
        cons: 'User can\'t see the value, can\'t justify the tool to others, can\'t make informed scoping decisions',
        selected: false,
      },
      {
        label: 'B. Full transparency with live data (selected)',
        pros: 'Self-justifying tool, data-driven scoping decisions, shareable evidence for team adoption',
        cons: 'More code to maintain, token estimates are approximate (based on ~250 tokens/tool average)',
        selected: true,
      },
    ],
    consequences: [
      'The token bar on every server tile makes cost a first-class visible attribute, not a hidden concern.',
      'The snowball model (session elongation from context pressure + wrong tool calls) shows savings are 2x larger than the simple per-message calculation.',
      'Live metrics update automatically as servers are assigned/unassigned/disabled.',
    ],
  },
  {
    id: 'ADR-2026-08',
    title: 'Server Catalog with Completeness Scoring',
    status: 'Accepted',
    date: '2026-03-15',
    owner: 'Daniel Shanklin',
    related: 'Catalog system, auto-enrichment',
    context: [
      'With 27 servers, it becomes hard to remember what each one does, what data it accesses, and whether it\'s safe to scope to a particular group.',
      'Documentation was initially ad-hoc \u2014 some servers had full docs (director-daemon: A grade), most had a one-liner (C grade).',
      'New servers discovered during scans had zero documentation.',
    ],
    decision: [
      'Every server gets a structured catalog entry with weighted fields: summary, maintainer, tool count, scope recommendation, risk notes, documentation, installation info.',
      'Completeness is scored A-F based on weighted field presence (MAX_SCORE=120 across 15 fields).',
      'Auto-enrichment inspects the filesystem: finds binaries, follows symlinks to git repos, extracts tool docstrings via AST parsing, reads README first paragraphs.',
      'The Scope Audit panel shows completeness grades alongside scope status.',
    ],
    options: [
      {
        label: 'A. No documentation system (rejected)',
        pros: 'Zero overhead',
        cons: 'Can\'t make informed scoping decisions, risk notes lost, new team members have no context',
        selected: false,
      },
      {
        label: 'B. Unstructured notes (rejected)',
        pros: 'Flexible, easy to start',
        cons: 'No accountability, no completeness tracking, inconsistent across servers',
        selected: false,
      },
      {
        label: 'C. Structured schema with scoring (selected)',
        pros: 'System nags about undocumented servers, auto-enrichment fills what it can, grades visible in UI',
        cons: 'Creates pressure to document, scoring weights are subjective',
        selected: true,
      },
    ],
    consequences: [
      'New servers enter the registry with zero docs, get auto-enriched on scan, and show their grade in the UI.',
      'The "Enrich" button in the Scope Audit runs auto-enrichment for all servers.',
      'Human-only fields (architecture descriptions, scope rationale) require manual entry but the system tracks what\'s missing.',
      'Current scores: 1 A (director-daemon), 6 B, 20 C \u2014 indicating most servers need richer documentation.',
    ],
  },
  {
    id: 'ADR-2026-09',
    title: 'Content Pages as Durable Arguments, Not Feature Docs',
    status: 'Accepted',
    date: '2026-03-15',
    owner: 'Daniel Shanklin',
    related: 'Why MCP, Why Eidos, Rebuttal, CLI vs MCP pages',
    context: [
      'The registry has multiple content pages: Why MCP, Why Eidos, Rebuttal (Perplexity), CLI vs MCP, Token Savings, Lazy Loading.',
      'These pages don\'t interact with any backend API or config file. They render static arguments about infrastructure philosophy.',
      'During architecture review, these were considered for removal ("move to a blog or Notion doc") to simplify the tool.',
    ],
    decision: [
      'Content pages stay in the app. They are the most durable part of the system \u2014 zero coupling to Claude Code internals.',
      'They serve as in-context persuasion: open the browser, click the tab, hand someone the laptop.',
      'They won\'t break when Claude Code updates its .mcp.json format or scoping model.',
      'The operational code (deploy, promote, store) is what might get commoditized. The arguments are the moat.',
    ],
    options: [
      {
        label: 'A. Remove content pages, keep operational only (rejected)',
        pros: 'Simpler tool, less code, focused purpose',
        cons: 'Lose the selling story, must explain value verbally every time, no shareable evidence',
        selected: false,
      },
      {
        label: 'B. Move to external docs site (rejected)',
        pros: 'Separation of concerns, easier to update independently',
        cons: 'Not in context when showing the tool, extra URL to share, likely goes stale',
        selected: false,
      },
      {
        label: 'C. Keep in app as tabs (selected)',
        pros: 'Always available in context, zero maintenance (no API coupling), most durable part of the system',
        cons: 'More tabs in nav rail, content might go stale (e.g., Perplexity rebuttal)',
        selected: true,
      },
    ],
    consequences: [
      'The nav rail has many tabs. Content pages are grouped in the lower section, operational tabs at the top.',
      'Content pages that reference current events (Perplexity rebuttal, March 2026) may need periodic review.',
      'The Why Eidos page uses live data from the registry \u2014 token counts and savings update automatically.',
      'These pages position the tool as thoughtful infrastructure, not just a config manager.',
    ],
  },
  {
    id: 'ADR-2026-10',
    title: 'VS Code Simple Browser Compatibility: No Bare Catch, File Rename for Cache Busting',
    status: 'Accepted',
    date: '2026-03-15',
    owner: 'Daniel Shanklin',
    related: 'JS module architecture',
    context: [
      'The registry must work in both Chrome and VS Code\'s Simple Browser (embedded webview).',
      'After adding new exports to activity.js, VS Code showed "does not provide export named renderActivityLogView" even though the file was correct on disk.',
      'VS Code Simple Browser caches ES modules by URL permanently. Cache-Control: no-cache headers are ignored for module imports.',
      'Additionally, bare catch {} syntax (ES2019) was found in 15 places across 6 files, which may not work in older JS engines.',
    ],
    decision: [
      'Never use bare catch {} \u2014 always catch(e) {} for compatibility with older JS engines.',
      'When adding new exports to existing JS modules, rename the file to bust VS Code\'s module cache.',
      'Add Cache-Control: no-cache headers for all .js files as defense-in-depth (helps Chrome, not VS Code).',
      'Test in VS Code Simple Browser after every JS module change, not just Chrome.',
    ],
    options: [
      {
        label: 'A. Bundle all JS into one file (rejected)',
        pros: 'No module caching issues, one file to serve',
        cons: 'Lose module isolation, harder to develop, build step required',
        selected: false,
      },
      {
        label: 'B. File rename + no-cache headers (selected)',
        pros: 'Works in both environments, no build step, simple',
        cons: 'Must remember to rename when adding exports, git history shows renames',
        selected: true,
      },
      {
        label: 'C. Import maps / dynamic imports only (rejected)',
        pros: 'More control over module resolution',
        cons: 'Import maps may not work in VS Code webview, adds complexity',
        selected: false,
      },
    ],
    consequences: [
      'activity.js was renamed to activity-log.js to fix the immediate issue.',
      'All 15 instances of bare catch {} were replaced with catch(e) {}.',
      'Future JS changes that add exports should be tested in VS Code Simple Browser before committing.',
      'This is a known limitation of VS Code\'s embedded browser, not a bug in the registry.',
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
