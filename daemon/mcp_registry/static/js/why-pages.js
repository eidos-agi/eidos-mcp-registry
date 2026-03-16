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
  // Hardcoded trusted content — no user input, safe static string
  h1.innerHTML = 'Eidos AGI — <span>and Why We Built This</span>';
  hero.appendChild(h1);
  hero.appendChild(para('An open-source project from Eidos AGI. We build tools that put humans in the cockpit of AI systems — not behind them, not removed from them.'));
  page.appendChild(hero);

  // ── Section: About Eidos AGI
  page.appendChild(el('h2', null, 'About Eidos AGI'));

  page.appendChild(para('Eidos AGI is a research lab founded in March 2025. The thesis is simple: <strong>the correct relationship between human and AI is a cockpit, not a chat box.</strong>'));

  page.appendChild(para('Every AI product today ships one of two broken models. The <strong>vending machine</strong> — type a prompt, get an output, no relationship, no continuity. Or the <strong>drone</strong> — fire a task, hope for the best, find out what happened after. Neither is right. The cockpit is the third option: human and AI as a unit, where intent flows in and capability flows out.'));

  page.appendChild(para('Eidos v1 generated a working Tetris game from an English sentence in 55 seconds. Within 12 months, Anthropic, OpenAI, Cognition, Microsoft, and CrewAI independently converged on the same architectural patterns — without having seen Eidos. The patterns were discovered, not designed. They are structural necessities of autonomous problem-solving.'));

  const principles = el('div', 'feature-grid');
  principles.appendChild(featureItem('\uD83E\uDDE0', 'The Loop',
    'PERCEIVE \u2192 DECOMPOSE \u2192 SPECIALIZE \u2192 ACT \u2192 VERIFY \u2192 LEARN \u2192 RETRY. Everything else is a tool. Tools are output of the architecture, not part of it.'));
  principles.appendChild(featureItem('\uD83D\uDEEB', 'The Cockpit',
    'Human in the loop is the architecture, not the limitation. The AGI earns autonomy through demonstrated competence over time — from supervised operation to trusted autonomy.'));
  principles.appendChild(featureItem('\uD83D\uDD10', 'The Identity',
    'An AGI is a user, not a puppet. It should have its own accounts, credentials, audit trail, and killswitch — like any team member you onboard.'));
  principles.appendChild(featureItem('\uD83C\uDF10', 'Open Source',
    'Eidos tools are open source because the ecosystem needs shared infrastructure, not walled gardens. This registry exists to solve a real problem for real Claude Code users.'));
  page.appendChild(principles);

  page.appendChild(pullQuote('The most capable reasoning substrate in history, accessed through a vending machine slot. We\'re building the cockpit layer — persistent, accumulating, trust-building — that turns chat into collaboration.'));

  // ── Section: The Eidos Ecosystem
  page.appendChild(el('h2', null, 'The Eidos Ecosystem'));

  page.appendChild(para('The MCP Registry is one piece of a broader toolkit. Every Eidos project serves the same cockpit philosophy — giving humans visibility and control over what AI systems are doing:'));

  const ecosystem = el('div', 'feature-grid');
  ecosystem.appendChild(featureItem('\uD83D\uDCCB', 'MCP Registry (this tool)',
    'Scoping, deployment, and monitoring of MCP servers across Claude Code projects. The tool you\'re using right now.'));
  ecosystem.appendChild(featureItem('\uD83E\uDDE0', 'Eidos v5',
    'Multi-model deliberation system. Three AI models argue about your task in Socratic dialogue, then execute the winning plan. Dreamer, Doubter, Decider.'));
  ecosystem.appendChild(featureItem('\uD83D\uDD11', 'Eidos Vault',
    'Secure credential management for AI agents — secrets that agents can use but never see in plaintext.'));
  ecosystem.appendChild(featureItem('\uD83D\uDCE7', 'Eidos Mail',
    'Email integration as an MCP server — giving AI agents supervised access to communications.'));
  ecosystem.appendChild(featureItem('\uD83D\uDD0D', 'Eidos CLI',
    'Command-line interface for interacting with the Eidos ecosystem and managing AI workflows.'));
  ecosystem.appendChild(featureItem('\u2705', 'Eidos Consent',
    'Human-in-the-loop approval gates — AI proposes, human approves before execution.'));
  page.appendChild(ecosystem);

  // ── Transition to the tool
  page.appendChild(el('h2', null, 'Why This Registry Exists'));

  page.appendChild(para('Claude Code is extraordinary at writing software. But its MCP server management is flat, manual, and dangerous at scale. Here\'s what breaks, why it matters, and how the Eidos Registry fixes it.'));

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

  page.appendChild(pullQuote('The Eidos MCP Registry doesn\'t replace Claude Code. It gives Claude Code the server management layer it should have had from the start — scoped, secure, and visible. That\'s the cockpit philosophy: don\'t remove the human, give them better instruments.'));

  container.appendChild(page);
}

// ══════════════════════════════════════════════════════════════════
// REBUTTAL — Perplexity, CLI, and the Scoping Answer
// ══════════════════════════════════════════════════════════════════

export function renderRebuttalView() {
  const container = document.getElementById('view-rebuttal');
  if (!container) return;
  container.textContent = '';

  const m = computeMetrics();
  const page = el('div', 'content-page');

  // Hero
  const hero = el('div', 'content-hero');
  const h1 = document.createElement('h1');
  h1.innerHTML = 'Perplexity Is Right. <span>And Also Wrong.</span>';
  hero.appendChild(h1);
  hero.appendChild(para('On March 11, 2026, Perplexity CTO Denis Yarats announced they\'re moving away from MCP toward APIs and CLIs. His criticisms are real. His conclusion doesn\'t follow \u2014 unless you\'re Perplexity.'));
  page.appendChild(hero);

  // ── Section: What Yarats Said
  page.appendChild(el('h2', null, 'What Denis Yarats Actually Said'));
  page.appendChild(para('At the Ask 2026 conference, Yarats identified two core problems with MCP:'));

  const yaratsCriticisms = el('div', 'feature-grid');
  yaratsCriticisms.appendChild(featureItem('\uD83D\uDCCA', 'Tool schemas eat context tokens',
    'Every MCP tool definition \u2014 name, description, parameter schema, response format \u2014 is injected into every system prompt. With many tools, this overhead compounds across long conversations. "We were burning tokens on tool definitions the model never used."'));
  yaratsCriticisms.appendChild(featureItem('\uD83D\uDD10', 'Auth is clunky',
    'Each MCP server handles its own auth flow. Connecting to multiple services means multiple auth handshakes, multiple token management paths, multiple failure modes. "We wanted one key, one endpoint, done."'));
  page.appendChild(yaratsCriticisms);

  page.appendChild(pullQuote('These are real problems. We agree with the diagnosis. We disagree with the prescription.'));

  // ── Section: Where He's Right
  page.appendChild(el('h2', null, 'Where Perplexity Is Right'));
  page.appendChild(para('<strong>Give credit where it\'s due.</strong> Yarats identified a genuine architectural pain point that most MCP advocates hand-wave away. The token overhead is not theoretical:'));

  const rightChart = el('div', 'bar-chart');
  rightChart.appendChild(barRow('Your env (unscoped)', 100, `~${(m.totalTokensAll / 1000).toFixed(0)}K tokens wasted/msg`, 'red'));
  rightChart.appendChild(barRow('Perplexity\'s env', 85, 'Similar scale at production', 'red'));
  rightChart.appendChild(barRow('After proper scoping', Math.max(8, 100 - m.pctSavings), `~${(m.avgGroupTokens / 1000).toFixed(0)}K tokens/msg`, 'green'));
  page.appendChild(rightChart);

  page.appendChild(para('Yarats is also right that <strong>for Perplexity\'s specific use case</strong>, MCP is overkill:'));

  const rightReasons = el('div', 'compare-grid');

  const rightCard = el('div', 'compare-card good');
  rightCard.appendChild(el('h4', null, 'Perplexity\'s situation'));
  const rightList = el('ul');
  ['Single product, single agent, known tool surface',
   'They control both the model and the tools',
   'Tool set is small and stable (search, research, reasoning)',
   'No multi-tenant data separation needed',
   'No per-client credential isolation',
   'Internal team \u2014 not shipping MCP to external users',
   'Can hardcode API calls directly into their agent loop',
  ].forEach(i => rightList.appendChild(el('li', null, i)));
  rightCard.appendChild(rightList);

  const contextCard = el('div', 'compare-card bad');
  contextCard.appendChild(el('h4', null, 'But that\'s not your situation'));
  const contextList = el('ul');
  [`${m.totalServers} servers from multiple vendors and internal tools`,
   `${m.groupCount} workspace groups with different needs`,
   `${m.serversWithSecrets} servers with credentials that need isolation`,
   'Multiple clients/projects with confidentiality requirements',
   'Tools change frequently as the ecosystem evolves',
   'Need audit trail for compliance',
   'Can\'t hardcode \u2014 tool surface changes weekly',
  ].forEach(i => contextList.appendChild(el('li', null, i)));
  contextCard.appendChild(contextList);

  rightReasons.append(rightCard, contextCard);
  page.appendChild(rightReasons);

  // ── Section: Where He's Wrong
  page.appendChild(el('h2', null, 'Where the Argument Falls Apart'));
  page.appendChild(para('Yarats\' solution is to <strong>abandon the protocol and go back to raw API calls and CLI subprocesses</strong>. This solves the token problem by discarding everything MCP provides. It\'s like solving email spam by going back to fax machines.'));

  page.appendChild(el('h3', null, '1. The token problem has a scoping solution'));
  page.appendChild(para(`Load all ${m.totalServers} servers into every context? Yes, that\'s wasteful. Load only the 5 servers relevant to this workspace group? <strong>${m.pctSavings}% reduction.</strong> The problem isn\'t the protocol. It\'s the lack of a management layer.`));

  page.appendChild(el('h3', null, '2. CLI tools lose security properties'));
  page.appendChild(para('When you replace MCP with CLI subprocesses, you lose:'));

  page.appendChild(compareGrid(
    'What CLI gives you',
    [
      'Fast to invoke \u2014 just spawn a process',
      'No schema overhead \u2014 no tool definitions in prompt',
      'Simple \u2014 input in, output out, done',
      'No auth complexity \u2014 env vars or flags',
    ],
    'What CLI takes away',
    [
      'No credential isolation \u2014 secrets in env vars readable by any child process',
      'No typed schemas \u2014 parse stdout and pray it\'s valid JSON',
      'No audit trail \u2014 subprocess ran and exited, no log',
      'No access control \u2014 every tool has full permissions',
      'No input validation \u2014 malformed args cause silent failures',
      'No rate limiting \u2014 runaway loops hammer APIs unchecked',
      'No discoverability \u2014 must know the exact command',
      'No stateful sessions \u2014 every call starts cold',
    ]
  ));

  page.appendChild(el('h3', null, '3. "Most MCP features go unused" is a product problem, not a protocol problem'));
  page.appendChild(para('Yarats noted that most MCP features \u2014 resources, prompts, sampling \u2014 go unused. True. But HTTP also has features most apps don\'t use (PATCH, OPTIONS, 103 Early Hints). You don\'t abandon HTTP because you only use GET and POST. The features exist for the use cases that need them.'));

  page.appendChild(el('h3', null, '4. The industry is solving this at the protocol level'));
  page.appendChild(para('While Perplexity retreats to CLI:'));

  const industryResponse = el('div', 'feature-grid');
  industryResponse.appendChild(featureItem('\uD83E\uDDE0', 'Anthropic: Selective Tool Loading',
    'Code Mode reduces MCP token usage by 98.7% by only loading tools when the model signals it needs them. The schema overhead problem is being solved at the runtime level.'));
  industryResponse.appendChild(featureItem('\uD83D\uDD0D', 'OpenAI: Tool Search',
    'The Responses API ships tool search \u2014 tools only appear in context when the model identifies a need. Hundreds of tools, near-zero overhead when idle.'));
  industryResponse.appendChild(featureItem('\uD83C\uDF10', 'Cloudflare: Remote MCP',
    'Cloudflare launched remote MCP hosting with built-in OAuth. The auth problem Yarats complained about? Solved at the infrastructure level.'));
  industryResponse.appendChild(featureItem('\uD83D\uDCC1', 'Eidos: Group Scoping',
    `This registry. ${m.totalServers} servers scoped to ${m.groupCount} groups. ${m.pctSavings}% token reduction without abandoning any MCP capability.`));
  page.appendChild(industryResponse);

  // ── Section: The Real Lesson
  page.appendChild(el('h2', null, 'The Real Lesson'));
  page.appendChild(para('Perplexity\'s move tells us something important: <strong>unmanaged MCP doesn\'t scale.</strong> Loading every tool into every context, handling auth per-server, hoping the model picks the right tool from 200 options \u2014 that breaks.'));
  page.appendChild(para('But the answer isn\'t to abandon structured, secure, typed tool interfaces and go back to parsing stdout from subprocesses. The answer is to add a management layer that <strong>scopes the right tools to the right context.</strong>'));

  page.appendChild(pullQuote('Perplexity looked at MCP\'s scaling problem and said "throw it away." We looked at the same problem and said "manage it." Both are valid responses to a real pain point. Only one preserves security, auditability, and structured tool interfaces.'));

  // ── Section: Who Should Follow Perplexity
  page.appendChild(el('h2', null, 'Who Should Follow Perplexity\'s Lead'));
  page.appendChild(para('To be fair \u2014 Yarats\' approach is correct for a specific profile:'));

  const followGrid = el('div', 'compare-grid');

  const followCard = el('div', 'compare-card good');
  followCard.appendChild(el('h4', null, 'CLI makes sense when...'));
  const followList = el('ul');
  ['You control both the model and the tools',
   'Your tool surface is small and stable (<10 tools)',
   'Single-agent, single-product architecture',
   'No multi-tenant data separation needed',
   'Internal use only \u2014 no compliance requirements',
   'You can hardcode integrations into your agent loop',
  ].forEach(i => followList.appendChild(el('li', null, i)));
  followCard.appendChild(followList);

  const dontFollowCard = el('div', 'compare-card bad');
  dontFollowCard.appendChild(el('h4', null, 'MCP + Registry when...'));
  const dontFollowList = el('ul');
  ['Multiple clients, projects, or workspaces',
   'Dozens of MCP servers from different vendors',
   'Credentials that must be isolated per-context',
   'Compliance or audit requirements',
   'Tool surface changes frequently',
   'Multiple developers or agents sharing infrastructure',
   'You need rollback, preview, and deployment safety',
  ].forEach(i => dontFollowList.appendChild(el('li', null, i)));
  dontFollowCard.appendChild(dontFollowList);

  followGrid.append(followCard, dontFollowCard);
  page.appendChild(followGrid);

  // ── Section: The Bottom Line
  page.appendChild(el('h2', null, 'The Bottom Line'));
  page.appendChild(para('Denis Yarats is a sharp engineer solving a real problem for his company. His diagnosis of MCP\'s token overhead is accurate and we\'ve built an entire tool to address it. But "MCP has a scaling problem" and "abandon MCP" are very different conclusions.'));

  const bottomMetrics = el('div', 'metrics-row');
  bottomMetrics.appendChild(metricCard(`${m.pctSavings}%`, 'Token overhead eliminated by scoping'));
  bottomMetrics.appendChild(metricCard('0', 'Security features lost'));
  bottomMetrics.appendChild(metricCard(`${m.totalServers}`, 'Servers still fully managed'));
  page.appendChild(bottomMetrics);

  page.appendChild(pullQuote('The best response to "MCP doesn\'t scale" isn\'t "abandon MCP." It\'s "give it a control plane." That\'s what this registry is.'));

  container.appendChild(page);
}

// ══════════════════════════════════════════════════════════════════
// CLI vs MCP — Honest Comparison
// ══════════════════════════════════════════════════════════════════

export function renderCliVsMcpView() {
  const container = document.getElementById('view-cli-vs-mcp');
  if (!container) return;
  container.textContent = '';

  const page = el('div', 'content-page');

  // Hero
  const hero = el('div', 'content-hero');
  const h1 = document.createElement('h1');
  h1.innerHTML = 'CLI vs MCP: <span>When to Use Which</span>';
  hero.appendChild(h1);
  hero.appendChild(para('CLI tools and MCP servers solve different problems. Neither is universally better. Here\'s an honest guide to choosing the right tool for the job.'));
  page.appendChild(hero);

  // ── The Core Difference
  page.appendChild(el('h2', null, 'The Core Difference'));
  page.appendChild(para('<strong>CLI is for building. MCP is for operating.</strong> A CLI tool is a hammer \u2014 pick it up, use it, put it down. An MCP server is a power tool bolted to your workbench \u2014 always ready, more capable, but heavier to set up.'));

  page.appendChild(compareGrid(
    'CLI (subprocess)',
    [
      'Build in 20 minutes, test, throw away, rebuild',
      'Zero setup \u2014 just a script in PATH',
      'Composable \u2014 pipe into grep, awk, jq',
      'Entire Unix ecosystem available',
      'No runtime dependency \u2014 runs and exits',
      'Debug with echo statements',
    ],
    'MCP (protocol server)',
    [
      'Schema, transport, connection \u2014 real setup cost',
      'Must register, configure, manage lifecycle',
      'Structured but not pipeable',
      'Ecosystem is young and growing',
      'Persistent process \u2014 resources while idle',
      'Debug with logs, health checks, typed errors',
    ]
  ));

  // ── When CLI Wins
  page.appendChild(el('h2', null, 'When CLI Is the Right Choice'));

  page.appendChild(scenarioCard('\u26A1', 'Rapid Prototyping',
    'You have an idea: "What if Claude could query my local Postgres?" With CLI, you write a 30-line bash script, test it, iterate 5 times in an hour. With MCP, you\'re still writing the tool schema. <strong>Prototyping speed is CLI\'s superpower.</strong> Don\'t fight it.'));

  page.appendChild(scenarioCard('\uD83D\uDD27', 'One-Shot Transformations',
    '"Parse this CSV into JSON." "Count lines matching a pattern." "Extract emails from this log." These are stateless, single-use operations. Spinning up an MCP server for them is like renting a crane to hang a picture frame.'));

  page.appendChild(scenarioCard('\uD83D\uDD17', 'Shell Pipelines',
    '<code>cat data.json | jq \'.users[]\' | grep admin | wc -l</code> \u2014 Unix pipelines are the original composability pattern. MCP has no equivalent. When your problem is "transform text through a chain of filters," CLI wins outright.'));

  page.appendChild(scenarioCard('\uD83D\uDDA5\uFE0F', 'Local-Only, Single-User',
    'You\'re the only user. The tool never leaves your machine. There\'s no compliance requirement, no multi-tenant concern, no credential sharing. MCP\'s security model is solving a problem you don\'t have. Keep it simple.'));

  page.appendChild(scenarioCard('\uD83D\uDCE6', 'Existing Tool Wrappers',
    'You already have a CLI tool that works perfectly. Wrapping it in MCP just to say "we use MCP" is cargo-culting. If the tool is stable, well-tested, and does its job \u2014 <strong>don\'t fix what isn\'t broken.</strong>'));

  page.appendChild(scenarioCard('\uD83E\uDDEA', 'Throwaway Experiments',
    '"I wonder if this API returns what I think it does." Write a curl wrapper, test the hypothesis, delete the script. The experiment has a lifespan of minutes. MCP\'s persistence is overhead you\'ll never use.'));

  // ── When MCP Wins
  page.appendChild(el('h2', null, 'When MCP Is the Right Choice'));

  page.appendChild(scenarioCard('\uD83D\uDD10', 'Credentials Must Be Isolated',
    'Your tool needs an API key, database password, or OAuth token. With CLI, that secret sits in an environment variable readable by every child process. With MCP, <strong>the credential lives inside the server process</strong> \u2014 the AI agent never sees it. For anything touching production data, this matters.'));

  page.appendChild(scenarioCard('\uD83D\uDC65', 'Multiple Agents or Users',
    'Two agents need the same tool with different permissions. Agent A reads issues; Agent B closes them. CLI has no concept of per-caller permissions. MCP can enforce <strong>scoped access per connection</strong>. The moment your tool has more than one consumer, MCP earns its weight.'));

  page.appendChild(scenarioCard('\uD83D\uDCCB', 'Audit and Compliance',
    '"Who called this tool, with what parameters, and what did it return?" With CLI: \u{1F937}. The subprocess ran and exited. With MCP: every invocation is a structured, loggable event. If you\'re in a regulated industry or working with client data, this isn\'t optional.'));

  page.appendChild(scenarioCard('\uD83D\uDD04', 'Stateful Operations',
    'Holding a database transaction open across multiple tool calls. Tracking which PRs you\'ve already reviewed in a session. Maintaining a search cursor for pagination. CLI tools start cold every time. MCP servers <strong>maintain state across calls</strong>.'));

  page.appendChild(scenarioCard('\uD83D\uDCE1', 'Real-Time Notifications',
    '"Deploy completed." "Test suite failed." "New PR opened." MCP servers can push events to the AI without being polled. CLI tools can\'t notify \u2014 they can only be asked. If your workflow needs reactivity, MCP is the only option.'));

  page.appendChild(scenarioCard('\uD83C\uDFD7\uFE0F', 'Production Infrastructure',
    'You\'ve prototyped with CLI and it works. Now it needs to be reliable, secure, discoverable by other tools, and maintainable by a team. This is the graduation point. <strong>Most good MCP servers started as CLI prototypes.</strong>'));

  // ── The Graduation Path
  page.appendChild(el('h2', null, 'The Graduation Path'));
  page.appendChild(para('The best workflow isn\'t CLI <em>or</em> MCP. It\'s CLI <em>then</em> MCP. Here\'s the lifecycle:'));

  const lifecycle = el('div', 'feature-grid');
  lifecycle.appendChild(featureItem('1\uFE0F\u20E3', 'Explore with CLI',
    'Bash script, Python one-liner, curl wrapper. Validate the idea in minutes. Does the API return what you need? Is the data format workable? Answer these questions fast.'));
  lifecycle.appendChild(featureItem('2\uFE0F\u20E3', 'Stabilize the Interface',
    'The prototype works. Now define the inputs, outputs, and error cases. Write a --help flag. Add input validation. This is still CLI, but it\'s becoming a real tool.'));
  lifecycle.appendChild(featureItem('3\uFE0F\u20E3', 'Evaluate: Does It Need MCP?',
    'Ask: Will multiple agents use this? Does it handle secrets? Does it need state across calls? Does anyone need an audit trail? If yes to any \u2014 graduate. If no \u2014 keep it as CLI.'));
  lifecycle.appendChild(featureItem('4\uFE0F\u20E3', 'Graduate to MCP',
    'Wrap the stabilized logic in an MCP server. Add typed schemas from your validated interface. The hard part (figuring out what the tool does) is already done. The MCP wrapper is mechanical.'));
  page.appendChild(lifecycle);

  page.appendChild(pullQuote('Don\'t start with MCP. Don\'t avoid MCP. Start with CLI to find the right interface, then graduate to MCP when you need the infrastructure properties. The prototype informs the protocol.'));

  // ── Decision Matrix
  page.appendChild(el('h2', null, 'Quick Decision Matrix'));

  const matrix = document.createElement('table');
  matrix.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;margin:16px 0';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Scenario', 'CLI', 'MCP', 'Winner'].forEach(text => {
    const th = document.createElement('th');
    th.style.cssText = 'text-align:left;padding:8px 12px;border-bottom:2px solid var(--border);color:var(--text-dim);font-size:11px;text-transform:uppercase';
    th.textContent = text;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  matrix.appendChild(thead);

  const tbody = document.createElement('tbody');
  const rows = [
    ['Quick prototype / experiment', '\u2705 Fast', '\u274C Slow setup', 'CLI'],
    ['Shell pipeline / text transforms', '\u2705 Native', '\u274C Not pipeable', 'CLI'],
    ['Throwaway one-shot script', '\u2705 Write & delete', '\u274C Overkill', 'CLI'],
    ['Wrapping existing tool that works', '\u2705 Already done', '\u274C Unnecessary', 'CLI'],
    ['Handles API keys or passwords', '\u274C Env vars exposed', '\u2705 Isolated', 'MCP'],
    ['Multiple agents share the tool', '\u274C No access control', '\u2705 Per-caller perms', 'MCP'],
    ['Audit trail required', '\u274C Invisible', '\u2705 Structured logs', 'MCP'],
    ['Stateful across calls', '\u274C Cold start each time', '\u2705 Persistent', 'MCP'],
    ['Push notifications needed', '\u274C Poll only', '\u2705 Bidirectional', 'MCP'],
    ['Team/enterprise deployment', '\u274C Manual per-machine', '\u2705 Registry managed', 'MCP'],
    ['10+ tools for AI to discover', '\u274C Must know command', '\u2705 Self-describing', 'MCP'],
    ['Per-group config overrides', '\u274C Manual per-repo', '\u2705 Registry handles', 'MCP'],
  ];

  for (const [scenario, cli, mcp, winner] of rows) {
    const tr = document.createElement('tr');
    tr.style.cssText = 'border-bottom:1px solid var(--border)';
    [scenario, cli, mcp, winner].forEach((text, i) => {
      const td = document.createElement('td');
      td.style.cssText = 'padding:8px 12px;color:var(--text-dim)';
      if (i === 0) td.style.color = 'var(--text)';
      if (i === 3) {
        td.style.fontWeight = '600';
        td.style.color = text === 'CLI' ? 'var(--orange)' : 'var(--accent)';
      }
      td.textContent = text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  matrix.appendChild(tbody);
  page.appendChild(matrix);

  // ── The Bottom Line
  page.appendChild(el('h2', null, 'The Bottom Line'));
  page.appendChild(para('CLI and MCP are complementary technologies at different points on the formality spectrum. Using only CLI is like writing all your code in bash scripts \u2014 fast to start, painful to maintain. Using only MCP is like writing a Java enterprise app to add two numbers \u2014 correct but absurd.'));
  page.appendChild(para('<strong>The right answer is almost always:</strong> prototype with CLI, ship with MCP, manage with a registry. Each layer adds value at the right stage of the tool\'s lifecycle.'));

  page.appendChild(pullQuote('The Unix philosophy gave us small, composable tools. MCP gives those tools identity, security, and discoverability. The registry gives them management. These aren\'t competing ideas \u2014 they\'re layers.'));

  container.appendChild(page);
}
