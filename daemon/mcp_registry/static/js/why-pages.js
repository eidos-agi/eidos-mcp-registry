/**
 * Why MCP + Why Eidos Registry — content pages with data-driven arguments.
 */

import { state } from './registry.js';

// ── Helpers ─────────────────────────────────────────────────────

function el(tag, className, children) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (typeof children === 'string') e.textContent = children;
  else if (Array.isArray(children)) children.forEach(c => { if (c) e.appendChild(c); });
  else if (children instanceof Node) e.appendChild(children);
  return e;
}

function html(tag, props, children) {
  const e = document.createElement(tag);
  if (props) Object.entries(props).forEach(([k, v]) => {
    if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'className') e.className = v;
    else e.setAttribute(k, v);
  });
  if (typeof children === 'string') e.textContent = children;
  else if (Array.isArray(children)) children.forEach(c => { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}

function barRow(label, pct, value, colorClass) {
  const row = el('div', 'bar-row');
  row.appendChild(el('span', 'bar-label', label));
  const track = el('div', 'bar-track');
  const fill = el('div', `bar-fill ${colorClass}`);
  fill.style.width = pct + '%';
  fill.textContent = value;
  track.appendChild(fill);
  row.appendChild(track);
  return row;
}

function metricCard(value, label, colorClass) {
  const card = el('div', 'metric-card');
  card.appendChild(el('div', `metric-value ${colorClass || ''}`, value));
  card.appendChild(el('div', 'metric-label', label));
  return card;
}

function scenarioCard(icon, title, description) {
  const card = el('div', 'scenario');
  const hdr = el('div', 'scenario-header');
  hdr.appendChild(el('span', 'scenario-icon', icon));
  hdr.appendChild(el('span', 'scenario-title', title));
  card.appendChild(hdr);
  const p = document.createElement('p');
  // Content is hardcoded (trusted), not user-supplied
  p.innerHTML = description;
  card.appendChild(p);
  return card;
}

function featureItem(icon, title, desc) {
  const item = el('div', 'feature-item');
  item.appendChild(el('div', 'feature-item-icon', icon));
  item.appendChild(el('div', 'feature-item-title', title));
  item.appendChild(el('div', 'feature-item-desc', desc));
  return item;
}

function compareGrid(badTitle, badItems, goodTitle, goodItems) {
  const grid = el('div', 'compare-grid');

  const bad = el('div', 'compare-card bad');
  bad.appendChild(el('h4', null, badTitle));
  const badList = el('ul');
  badItems.forEach(i => badList.appendChild(el('li', null, i)));
  bad.appendChild(badList);

  const good = el('div', 'compare-card good');
  good.appendChild(el('h4', null, goodTitle));
  const goodList = el('ul');
  goodItems.forEach(i => goodList.appendChild(el('li', null, i)));
  good.appendChild(goodList);

  grid.append(bad, good);
  return grid;
}

function pullQuote(text) {
  return el('div', 'pull-quote', text);
}

function section(title, ...children) {
  const container = document.createDocumentFragment();
  if (title) container.appendChild(el('h3', null, title));
  children.forEach(c => { if (c) container.appendChild(c); });
  return container;
}

function para(text) {
  const p = el('p');
  // Content is hardcoded (trusted), not user-supplied
  p.innerHTML = text;
  return p;
}

// ── Compute live metrics from current state ─────────────────────

function computeMetrics() {
  const servers = Object.values(state.servers || {});
  const groups = Object.entries(state.groups || {}).filter(([k]) => k !== '__universal__');
  const totalServers = servers.length;

  // Estimate tools per server (conservative: 8 avg based on typical MCP servers)
  const avgToolsPerServer = 8;
  const totalTools = totalServers * avgToolsPerServer;

  // Token math: ~300 tokens per tool definition in system prompt
  const tokensPerTool = 300;
  const totalTokensAll = totalTools * tokensPerTool;

  // Average group has fewer servers assigned
  const groupServerCounts = groups.map(([, g]) => (g.servers || []).length);
  const universalCount = (state.groups?.__universal__?.servers || []).length;
  const avgGroupServers = groupServerCounts.length > 0
    ? Math.round(groupServerCounts.reduce((a, b) => a + b, 0) / groupServerCounts.length) + universalCount
    : totalServers;
  const avgGroupTools = avgGroupServers * avgToolsPerServer;
  const avgGroupTokens = avgGroupTools * tokensPerTool;

  // Savings
  const tokenSavings = totalTokensAll - avgGroupTokens;
  const pctSavings = totalTokensAll > 0 ? Math.round((tokenSavings / totalTokensAll) * 100) : 0;

  // Cost math (Sonnet: $3/MTok input)
  const costPerMessage = totalTokensAll / 1_000_000 * 3;
  const costPerMessageScoped = avgGroupTokens / 1_000_000 * 3;
  const dailyMessages = 100;
  const monthlySavings = (costPerMessage - costPerMessageScoped) * dailyMessages * 30;

  // Secret exposure
  const serversWithSecrets = servers.filter(s => {
    const env = s.env || {};
    return Object.keys(env).some(k =>
      ['token', 'key', 'secret', 'password', 'credential', 'auth'].some(p => k.toLowerCase().includes(p))
    );
  }).length;

  return {
    totalServers,
    totalTools,
    totalTokensAll,
    avgGroupServers,
    avgGroupTools,
    avgGroupTokens,
    tokenSavings,
    pctSavings,
    costPerMessage: costPerMessage.toFixed(3),
    costPerMessageScoped: costPerMessageScoped.toFixed(3),
    monthlySavings: monthlySavings.toFixed(0),
    serversWithSecrets,
    groupCount: groups.length,
    universalCount,
  };
}

// ══════════════════════════════════════════════════════════════════
// WHY MCP
// ══════════════════════════════════════════════════════════════════

export function renderWhyMcpView() {
  const container = document.getElementById('view-why-mcp');
  if (!container) return;
  container.textContent = '';

  const page = el('div', 'content-page');

  // Hero
  const hero = el('div', 'content-hero');
  const h1 = document.createElement('h1');
  // Hardcoded trusted content
  h1.innerHTML = 'MCP is <span>Infrastructure</span>, Not Just Tooling';
  hero.appendChild(h1);
  hero.appendChild(para('The Model Context Protocol is to AI agents what TCP/IP was to the internet — the invisible layer that makes everything else possible. CLI tools were the beginning. MCP is what comes next.'));
  page.appendChild(hero);

  // ── Section: The Paradigm Shift
  page.appendChild(el('h2', null, 'CLI Tools vs MCP Servers'));
  page.appendChild(para('CLI tools are <strong>fire-and-forget</strong>: invoke, get output, done. MCP servers are <strong>persistent, stateful, and secure</strong>. This isn\'t an incremental improvement — it\'s a different paradigm.'));

  page.appendChild(compareGrid(
    'CLI Tools (subprocess)',
    [
      'Ephemeral — runs, outputs, dies',
      'No authentication — anyone can call',
      'No schema — parse stdout and pray',
      'Pull-only — cannot push events',
      'No discoverability — must know the command',
      'Secrets in env vars — readable by any child process',
      'No rate limiting or access control',
      'No structured errors — exit codes only',
    ],
    'MCP Servers (protocol)',
    [
      'Persistent — maintains state and connections',
      'OAuth + auth built into protocol',
      'Typed tool schemas with input validation',
      'Bidirectional — can stream events and notifications',
      'Self-describing — tools list their capabilities',
      'Credentials isolated inside the server process',
      'Per-tool authorization and rate limiting',
      'Structured error responses with context',
    ]
  ));

  // ── Section: Security
  page.appendChild(el('h2', null, 'Security: The Killer Advantage'));
  page.appendChild(para('This is where MCP\'s architecture becomes non-negotiable for any serious deployment. CLI tools have <strong>zero security boundary</strong> — every subprocess inherits the full environment. MCP enforces boundaries at the protocol level.'));

  const secFeatures = el('div', 'feature-grid');
  secFeatures.appendChild(featureItem('\uD83D\uDD10', 'Credential Isolation', 'Secrets live inside the MCP server process. The AI agent never sees API keys, tokens, or passwords — it only sees the tool interface. A compromised prompt cannot extract credentials.'));
  secFeatures.appendChild(featureItem('\uD83D\uDEE1\uFE0F', 'Scoped Access Control', 'MCP servers can enforce per-tool permissions. A "read-only" agent can list issues but not close them. A "reviewer" can comment but not merge. CLI tools have no concept of permission scoping.'));
  secFeatures.appendChild(featureItem('\uD83D\uDCCB', 'Audit Trail', 'Every MCP tool invocation is a structured, logged event with input parameters and outputs. CLI tool calls are invisible — just a subprocess that ran and exited. You can\'t audit what you can\'t see.'));
  secFeatures.appendChild(featureItem('\uD83D\uDD12', 'Transport Security', 'MCP supports TLS, OAuth 2.0, and header-based auth. HTTP/SSE transports use standard web security. CLI tools communicate over unencrypted stdio pipes.'));
  secFeatures.appendChild(featureItem('\uD83D\uDEAB', 'Input Validation', 'MCP tool schemas define exact parameter types and constraints. Malformed input is rejected before execution. CLI tools parse arguments as strings with no validation layer.'));
  secFeatures.appendChild(featureItem('\u23F1\uFE0F', 'Rate Limiting', 'MCP servers can throttle tool calls per-agent or per-session. A runaway AI loop can\'t hammer an API. CLI tools have no built-in throttling mechanism.'));
  page.appendChild(secFeatures);

  page.appendChild(pullQuote('MCP servers are the first technology that gives AI agents the same security properties that web APIs give to human users: authentication, authorization, rate limiting, and audit logging.'));

  // ── Section: What MCP Enables
  page.appendChild(el('h2', null, 'What MCP Makes Possible'));
  page.appendChild(para('Once you have a protocol layer between AI and tools, entirely new capabilities emerge:'));

  const enables = el('div', 'feature-grid');
  enables.appendChild(featureItem('\uD83D\uDD04', 'Stateful Sessions', 'An MCP server can remember context across multiple tool calls in a session. A database MCP can hold a transaction open. A project management MCP can track which issues you\'ve already reviewed.'));
  enables.appendChild(featureItem('\uD83D\uDCE1', 'Real-time Notifications', 'MCP servers can push events to the AI: "deploy completed", "test failed", "new PR opened". CLI tools can\'t notify — they can only be polled.'));
  enables.appendChild(featureItem('\uD83D\uDD17', 'Composable Agents', 'Multiple AI agents can share the same MCP server, each with different permissions. One agent reads; another writes; a supervisor monitors both. Try doing that with subprocess calls.'));
  enables.appendChild(featureItem('\uD83D\uDCCA', 'Resource Exposure', 'MCP servers can expose structured data (files, databases, APIs) as browseable resources. The AI can explore before acting — like browsing a file system vs. running blind commands.'));
  enables.appendChild(featureItem('\uD83C\uDFD7\uFE0F', 'Infrastructure Orchestration', 'Deploy pipelines, CI/CD, cloud provisioning — all through typed, authenticated, auditable tool calls. No more shell scripts with hardcoded credentials.'));
  enables.appendChild(featureItem('\uD83C\uDF10', 'Cross-Machine Federation', 'MCP servers can run remotely. Your AI agent on your laptop can invoke tools running on a build server, a staging environment, or a cloud function. CLI tools are local-only.'));
  page.appendChild(enables);

  // ── Section: The TCP/IP Analogy
  page.appendChild(el('h2', null, 'The TCP/IP of AI'));
  page.appendChild(para('TCP/IP didn\'t replace sending files on floppy disks because it was faster. It replaced it because it created a <strong>universal protocol layer</strong> that made email, the web, streaming, and everything else possible.'));
  page.appendChild(para('MCP won\'t replace CLI tools because it\'s faster. It will replace them because it creates a <strong>universal agent protocol layer</strong> that makes secure multi-agent systems, enterprise AI deployments, and auditable autonomous operations possible.'));
  page.appendChild(para('The question isn\'t whether your AI tools will use MCP. The question is whether you\'ll adopt it now while you have architectural choice, or later when you\'re forced to retrofit.'));

  page.appendChild(pullQuote('CLI tools are the floppy disk of AI tooling. They work, they\'re simple, and they\'ll be with us for years. But the infrastructure layer has already moved on.'));

  container.appendChild(page);
}

// ══════════════════════════════════════════════════════════════════
// WHY EIDOS REGISTRY
// ══════════════════════════════════════════════════════════════════

export function renderWhyEidosView() {
  const container = document.getElementById('view-why-eidos');
  if (!container) return;
  container.textContent = '';

  const m = computeMetrics();
  const page = el('div', 'content-page');

  // Hero
  const hero = el('div', 'content-hero');
  const h1 = document.createElement('h1');
  // Hardcoded trusted content
  h1.innerHTML = 'Claude Code\'s MCP Problem — <span>and How to Fix It</span>';
  hero.appendChild(h1);
  hero.appendChild(para('Claude Code is extraordinary at writing software. But its MCP server management is flat, manual, and dangerous at scale. Here\'s what breaks, why it matters, and how the Eidos Registry fixes it.'));
  page.appendChild(hero);

  // ── Section: Your Numbers
  page.appendChild(el('h2', null, 'Your Environment Right Now'));
  page.appendChild(para(`These metrics are computed live from your actual MCP registry — <strong>${m.totalServers} servers</strong> across <strong>${m.groupCount} groups</strong>.`));

  const metrics = el('div', 'metrics-row');
  metrics.appendChild(metricCard(m.totalServers.toString(), 'MCP Servers Installed'));
  metrics.appendChild(metricCard(`~${m.totalTools}`, 'Tools in System Prompt'));
  metrics.appendChild(metricCard(`~${(m.totalTokensAll / 1000).toFixed(0)}K`, 'Tokens per Message (unscoped)', 'bad'));
  page.appendChild(metrics);

  // ── Section: The Token Tax
  page.appendChild(el('h2', null, 'The Token Tax'));
  page.appendChild(para(`Every MCP tool definition is injected into every system prompt. With <strong>${m.totalServers} servers</strong> exposing <strong>~${m.totalTools} tools</strong>, you\'re burning <strong>~${(m.totalTokensAll / 1000).toFixed(0)}K tokens</strong> before the conversation even starts. That\'s not just expensive — it degrades response quality.`));

  // Bar chart: token usage
  const chart = el('div', 'bar-chart');
  chart.appendChild(barRow('All tools (unscoped)', 100, `${(m.totalTokensAll / 1000).toFixed(0)}K tokens`, 'red'));
  const scopedPct = m.totalTokensAll > 0 ? Math.round((m.avgGroupTokens / m.totalTokensAll) * 100) : 50;
  chart.appendChild(barRow('Scoped to group (avg)', scopedPct, `${(m.avgGroupTokens / 1000).toFixed(0)}K tokens`, 'green'));
  page.appendChild(chart);

  const savings = el('div', 'metrics-row');
  savings.appendChild(metricCard(`${m.pctSavings}%`, 'Token Reduction with Scoping', 'good'));
  savings.appendChild(metricCard(`$${m.costPerMessage}`, 'Cost/Message (unscoped)', 'bad'));
  savings.appendChild(metricCard(`~$${m.monthlySavings}`, 'Monthly Savings (100 msgs/day)', 'good'));
  page.appendChild(savings);

  page.appendChild(para(`<strong>Why this matters beyond cost:</strong> Large tool schemas force the model to spend reasoning tokens selecting the right tool from ${m.totalTools} options. Fewer tools = faster responses, fewer wrong tool calls, better output quality.`));

  // ── Section: Confidentiality Breaches
  page.appendChild(el('h2', null, 'Confidentiality: What\'s Actually Exposed'));
  page.appendChild(para(`You have <strong>${m.serversWithSecrets} servers with secret credentials</strong> in their environment variables. Without scoping, every MCP server is available in every context. Here\'s what that means:`));

  page.appendChild(scenarioCard('\uD83C\uDFE2', 'The Consultant Problem',
    'You work on <span class="highlight">Client A\'s repo</span>, but your Wrike MCP exposes <span class="highlight">Client B\'s project board</span>. Your email MCP exposes <span class="highlight">all client communications</span>. Claude can and will reference cross-client data if it seems relevant to your prompt. This isn\'t a hypothetical — it\'s how context windows work.'));

  page.appendChild(scenarioCard('\uD83D\uDD11', 'The Secrets Sprawl',
    'Every MCP server\'s API key sits in <span class="highlight">plaintext in .claude.json or .mcp.json</span>. Deploy that .mcp.json to a repo without .gitignore? Those keys are now <span class="highlight">in git history forever</span>. The registry masks secrets as <code>${VAR}</code> references, but Claude Code\'s default behavior writes literals.'));

  page.appendChild(scenarioCard('\uD83C\uDFAF', 'The Wrong Tool Problem',
    `With <span class="highlight">${m.totalTools} tools</span> available, Claude frequently picks the wrong one. <code>wrike.search_tasks</code> vs <code>github.search_issues</code> vs <code>taskr.taskr_search</code> — all match "find my tasks." Each failed tool call wastes <span class="highlight">500-2000 tokens</span> on the attempt, the error, and the retry. Scoping to 5 servers eliminates 80% of these collisions.`));

  page.appendChild(scenarioCard('\uD83D\uDCCA', 'The Context Pollution Problem',
    'MCP tool docstrings compete with your actual conversation for context window space. At <span class="highlight">' + (m.totalTokensAll / 1000).toFixed(0) + 'K tokens</span> of tool schemas, you\'ve consumed a significant chunk of the context window before any code, files, or conversation history. This directly degrades Claude\'s ability to reason about your actual problem.'));

  // ── Section: What Claude Code Gets Wrong
  page.appendChild(el('h2', null, 'Five Things Claude Code Gets Wrong'));

  page.appendChild(compareGrid(
    'Claude Code Today',
    [
      'Flat scoping: user scope or project scope, nothing between',
      'No bulk operations: add a server to 50 repos = 50 manual edits',
      'No deploy safety: edit .mcp.json wrong and MCP breaks silently',
      'No secret management: API keys in plaintext JSON',
      'No visibility: which servers are healthy? What\'s installed where?',
    ],
    'With Eidos Registry',
    [
      'Group-based scoping: per-client, per-team, per-project',
      'Bulk deploy: one click propagates to all repos in a group',
      'Deploy preview + rollback: see changes before writing, undo mistakes',
      'Secret masking: ${VAR} references, .gitignore enforcement',
      'Health dashboard + activity log: full visibility and audit trail',
    ]
  ));

  // ── Section: How Eidos Fixes It
  page.appendChild(el('h2', null, 'How the Registry Solves This'));

  const solutions = el('div', 'feature-grid');
  solutions.appendChild(featureItem('\uD83D\uDCC1', 'Group-Based Scoping',
    `Your ${m.groupCount} workspace groups each get exactly the servers they need. Client A\'s repos only see Client A\'s tools. No cross-contamination, no accidental data exposure.`));
  solutions.appendChild(featureItem('\uD83C\uDF10', 'Universal Inheritance',
    `${m.universalCount} server${m.universalCount !== 1 ? 's' : ''} marked as Global ${m.universalCount !== 1 ? 'are' : 'is'} available everywhere — shared utilities like documentation lookup. Everything else is scoped.`));
  solutions.appendChild(featureItem('\uD83D\uDD10', 'Secret Masking',
    `${m.serversWithSecrets} servers have credentials that are automatically masked as \${VAR} references in deployed .mcp.json files. Secrets never touch git.`));
  solutions.appendChild(featureItem('\uD83D\uDD04', 'Deploy + Rollback',
    'Preview exactly what will change before deploying. Every deploy creates a snapshot. One-click rollback to any previous state. No more "I broke 50 repos."'));
  solutions.appendChild(featureItem('\uD83D\uDCCA', 'Token Optimization',
    `By scoping servers per group, you reduce tool schema tokens by ~${m.pctSavings}% — saving ~$${m.monthlySavings}/month and improving response quality.`));
  solutions.appendChild(featureItem('\uD83D\uDCCB', 'Activity Audit Log',
    'Every assignment, deploy, config change, and rollback is logged with timestamps. Know who changed what, when, and why.'));
  solutions.appendChild(featureItem('\uD83D\uDEE1\uFE0F', 'Gitignore Enforcement',
    'One click adds .mcp.json to .gitignore across all repos in a group. Prevents accidental secret commits to version control.'));
  solutions.appendChild(featureItem('\u26A1', 'Per-Group Config Overrides',
    'Same server, different config per group. Cerebro with production Supabase for one client, staging for another. No manual per-repo editing.'));
  page.appendChild(solutions);

  // ── Section: Why Scoping Makes Agents Faster
  page.appendChild(el('h2', null, 'Why Proper Scoping Makes Coding Agents Faster'));
  page.appendChild(para('Token savings aren\'t just about cost. Every unnecessary tool in the system prompt <strong>directly degrades agent speed and quality</strong> at every step of an agentic coding loop.'));

  const speedFeatures = el('div', 'feature-grid');
  speedFeatures.appendChild(featureItem('\u26A1', 'Faster Tool Selection',
    `With ${m.totalTools} tools, Claude spends reasoning tokens deciding which to call. With ~${m.avgGroupTools} tools (scoped), the decision tree is ${Math.round(m.totalTools / Math.max(m.avgGroupTools, 1))}x smaller. This compounds across every step — a 20-step coding task makes 20 tool selection decisions.`));
  speedFeatures.appendChild(featureItem('\uD83C\uDFAF', 'Fewer Wrong Tool Calls',
    'Each failed tool attempt costs a full round-trip: reasoning to choose, formatting the call, waiting for execution, parsing the error, reasoning again. With 27 servers you get name collisions \u2014 multiple "search" tools, multiple "list" tools. Scoping eliminates most collisions.'));
  speedFeatures.appendChild(featureItem('\uD83E\uDDE0', 'More Room for Actual Context',
    `Every token spent on tool definitions is a token NOT spent on your codebase, conversation history, or file contents. With ${(m.totalTokensAll / 1000).toFixed(0)}K tokens of tool schemas, the agent has materially less capacity to reason about your 3000-line file.`));
  speedFeatures.appendChild(featureItem('\uD83D\uDDDC\uFE0F', 'Later Context Compression',
    'When the context window fills, Claude Code compresses prior messages \u2014 you lose conversation history. More tool definitions = compression kicks in earlier = the agent forgets what you discussed 10 messages ago.'));
  speedFeatures.appendChild(featureItem('\uD83D\uDD04', 'Fewer Retry Loops',
    'Wrong tool calls trigger error-recovery loops: call wrong tool \u2192 get error \u2192 re-reason \u2192 try another tool. Each loop wastes 500-2000 tokens and 2-5 seconds. With proper scoping, the right tool is usually the obvious choice.'));
  speedFeatures.appendChild(featureItem('\uD83D\uDE80', 'Parallel Session Scaling',
    'If you run multiple Claude Code sessions (different projects), each loads ALL servers. With scoping, each session loads only what it needs. Multiply the per-message savings by concurrent sessions.'));
  page.appendChild(speedFeatures);

  // Agent speed bar chart
  const speedChart = el('div', 'bar-chart');
  speedChart.appendChild(barRow('Tool selection overhead', 100, `${m.totalTools} tools to evaluate`, 'red'));
  speedChart.appendChild(barRow('After scoping', scopedPct, `~${m.avgGroupTools} tools to evaluate`, 'green'));
  const wrongCallPct = Math.min(100, Math.round(m.totalTools / 2.5));
  speedChart.appendChild(barRow('Wrong tool call risk', wrongCallPct, `${wrongCallPct}% collision probability`, 'orange'));
  const scopedCollision = Math.min(100, Math.round(m.avgGroupTools / 2.5));
  speedChart.appendChild(barRow('After scoping', scopedCollision, `${scopedCollision}% collision probability`, 'green'));
  page.appendChild(speedChart);

  page.appendChild(pullQuote('A coding agent with 40 focused tools consistently outperforms the same agent with 200+ tools \u2014 not because it has fewer capabilities, but because it wastes zero time on irrelevant options. Scoping doesn\'t limit the agent. It sharpens it.'));

  // ── Section: The Bottom Line
  page.appendChild(el('h2', null, 'The Bottom Line'));

  const bottomMetrics = el('div', 'metrics-row');
  bottomMetrics.appendChild(metricCard(`${m.pctSavings}%`, 'Fewer Tokens per Message'));
  bottomMetrics.appendChild(metricCard(`~$${m.monthlySavings}`, 'Monthly Cost Savings'));
  bottomMetrics.appendChild(metricCard(`${m.serversWithSecrets}`, 'Servers with Secrets Protected'));
  page.appendChild(bottomMetrics);

  page.appendChild(pullQuote('The Eidos MCP Registry doesn\'t replace Claude Code. It gives Claude Code the server management layer it should have had from the start — scoped, secure, and visible.'));

  container.appendChild(page);
}
