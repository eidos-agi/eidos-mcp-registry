/**
 * Lazy Loading — the endgame for MCP token optimization.
 *
 * Instead of loading all tool schemas into every system prompt,
 * the registry becomes an MCP server itself with a single lookup tool.
 * Claude discovers tools on demand, loading only what it needs.
 */

import { api } from './registry.js';

function el(tag, css, text) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

function metricCard(value, label, color) {
  const card = el('div', 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;text-align:center');
  card.appendChild(el('div', `font-size:28px;font-weight:700;color:${color || 'var(--accent)'}`, value));
  card.appendChild(el('div', 'font-size:12px;color:var(--text-dim);margin-top:4px', label));
  return card;
}

function richPara(parts) {
  const p = el('p', 'font-size:14px;color:var(--text-dim);line-height:1.7;margin-bottom:12px');
  for (const part of parts) {
    if (typeof part === 'string') p.appendChild(document.createTextNode(part));
    else { const s = document.createElement('strong'); s.style.color = 'var(--text)'; s.textContent = part.bold; p.appendChild(s); }
  }
  return p;
}

export async function renderLazyLoadingView() {
  const container = document.getElementById('view-lazy-loading');
  if (!container) return;
  container.textContent = '';

  let data;
  try { data = await api.get('/token-budget'); } catch(e) { data = null; }

  const page = el('div', 'max-width:800px;padding:0 20px 40px');

  // Hero
  const hero = el('div', 'padding:32px 0;border-bottom:1px solid var(--border);margin-bottom:24px');
  const h1 = el('h1', 'font-size:32px;font-weight:700;line-height:1.2;margin-bottom:12px');
  h1.appendChild(document.createTextNode('Lazy Tool Loading: '));
  h1.appendChild(el('span', 'color:var(--accent)', 'The 98% Solution'));
  hero.appendChild(h1);
  hero.appendChild(richPara([
    'What if Claude only loaded tool schemas ', {bold: 'when it actually needed them'}, '? Instead of 469 tool definitions in every system prompt, load 1 lookup tool. Discover the rest on demand.'
  ]));
  page.appendChild(hero);

  // The concept
  page.appendChild(el('h2', 'font-size:20px;font-weight:700;color:var(--text);margin:28px 0 8px', 'The Concept'));
  page.appendChild(richPara([
    'The Eidos Registry becomes an MCP server itself. It exposes a single tool: ',
    {bold: 'find_tool(query)'}, '. Instead of injecting all 469 tool schemas into the system prompt, Claude loads only the registry lookup tool (~500 tokens). When it needs to do something, it asks the registry:'
  ]));

  // Example flow
  const flow = el('div', 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin:16px 0;font-family:"SF Mono",Monaco,monospace;font-size:13px;line-height:2');

  const steps = [
    ['User', 'var(--text)', '"Find all open tasks in the greenmark project"'],
    ['Claude thinks', 'var(--text-dim)', 'I need a task management tool. Let me look it up.'],
    ['Claude calls', 'var(--accent)', 'registry.find_tool("search tasks project management")'],
    ['Registry returns', 'var(--green)', 'wrike.search_tasks {name, description, parameters} + wrike.list_tasks {name, description, parameters}'],
    ['Claude calls', 'var(--accent)', 'wrike.search_tasks({query: "greenmark", status: "open"})'],
    ['Result', 'var(--green)', '12 open tasks returned'],
  ];

  for (const [label, color, text] of steps) {
    const step = el('div', 'display:flex;gap:12px;padding:4px 0');
    step.appendChild(el('span', `color:${color};font-weight:600;width:120px;flex-shrink:0;text-align:right`, label));
    step.appendChild(el('span', `color:${color}`, text));
    flow.appendChild(step);
  }
  page.appendChild(flow);

  // Token impact
  page.appendChild(el('h2', 'font-size:20px;font-weight:700;color:var(--text);margin:28px 0 8px', 'Token Impact'));

  if (data) {
    const u = data.unscoped;
    const lazyTokens = 500; // just the registry lookup tool
    const avgToolsPerSession = 8; // typical tools actually used
    const lazySessionTokens = lazyTokens + avgToolsPerSession * 250; // lookup + loaded schemas
    const reduction = Math.round((1 - lazySessionTokens / u.tokens) * 100);

    const metrics = el('div', 'display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0');
    metrics.appendChild(metricCard(`${u.tokens.toLocaleString()}`, 'Current: all tools loaded', 'var(--red)'));
    metrics.appendChild(metricCard(`${data.scoped_average.tokens.toLocaleString()}`, 'With scoping', 'var(--orange)'));
    metrics.appendChild(metricCard(`${lazySessionTokens.toLocaleString()}`, 'With lazy loading', 'var(--green)'));
    metrics.appendChild(metricCard(`${reduction}%`, 'Reduction vs unscoped', 'var(--green)'));
    page.appendChild(metrics);

    // Comparison bars
    const bars = el('div', 'margin:16px 0');
    function bar(label, tokens, maxTokens, color) {
      const row = el('div', 'display:flex;align-items:center;gap:12px;margin-bottom:8px');
      row.appendChild(el('span', 'width:140px;font-size:12px;color:var(--text-dim);text-align:right;flex-shrink:0', label));
      const track = el('div', 'flex:1;height:24px;background:var(--bg);border-radius:4px;overflow:hidden');
      const pct = Math.max(1, (tokens / maxTokens) * 100);
      const fill = el('div', `height:100%;width:${pct}%;background:${color};border-radius:4px;display:flex;align-items:center;padding:0 8px;font-size:11px;font-weight:600;color:#fff;white-space:nowrap`);
      fill.textContent = `${tokens.toLocaleString()} tokens`;
      track.appendChild(fill);
      row.appendChild(track);
      bars.appendChild(row);
    }
    bar('All tools (current)', u.tokens, u.tokens, 'var(--red)');
    bar('Scoped (current)', data.scoped_average.tokens, u.tokens, 'var(--orange)');
    bar('Lazy loading', lazySessionTokens, u.tokens, 'var(--green)');
    page.appendChild(bars);

    // Per-session savings
    const totalMsgs = 100;
    const currentCost = totalMsgs * u.tokens;
    const scopedCost = totalMsgs * data.scoped_average.tokens;
    const lazyCost = totalMsgs * lazySessionTokens;

    page.appendChild(richPara([
      'Over a 100-message session: unscoped = ', {bold: `${(currentCost / 1_000_000).toFixed(1)}M tokens`},
      ', scoped = ', {bold: `${(scopedCost / 1_000_000).toFixed(1)}M`},
      ', lazy = ', {bold: `${(lazyCost / 1_000_000).toFixed(1)}M`},
      '. Lazy loading saves ', {bold: `${((currentCost - lazyCost) / 1_000_000).toFixed(1)}M tokens`},
      ` per session \u2014 $${((currentCost - lazyCost) / 1_000_000 * 3).toFixed(2)} saved.`
    ]));
  }

  // How it works architecturally
  page.appendChild(el('h2', 'font-size:20px;font-weight:700;color:var(--text);margin:28px 0 8px', 'Architecture'));

  const archSteps = [
    ['\uD83D\uDD0D', 'Registry MCP Server', 'The registry runs as an MCP server exposing find_tool(query). It searches the catalog by tool name, description, and server. Returns full tool schemas for matching tools.'],
    ['\uD83D\uDCCB', 'Catalog as Index', 'The server catalog (27 servers, 469 tools) becomes a searchable index. Tool descriptions, parameter schemas, and server metadata are all queryable.'],
    ['\u26A1', 'On-Demand Loading', 'When find_tool returns a match, Claude receives the full tool schema for just those tools. It can then call them directly \u2014 the MCP servers are still running, the registry just brokers discovery.'],
    ['\uD83E\uDDE0', 'Semantic Matching', 'The query doesn\'t need to be an exact tool name. "send an email" matches eidos-mail.send_email. "check deploy status" matches railguey.railguey_status. The registry understands intent.'],
    ['\uD83D\uDD12', 'Scoping Still Applies', 'find_tool respects group scoping. If you\'re in a Greenmark repo, it only returns tools from Greenmark-scoped servers + globals. The lazy loading layer sits on top of the scoping layer.'],
  ];

  for (const [icon, title, desc] of archSteps) {
    const item = el('div', 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:8px');
    const header = el('div', 'display:flex;align-items:center;gap:10px;margin-bottom:6px');
    header.appendChild(el('span', 'font-size:18px', icon));
    header.appendChild(el('span', 'font-size:14px;font-weight:600;color:var(--text)', title));
    item.appendChild(header);
    item.appendChild(el('div', 'font-size:13px;color:var(--text-dim);line-height:1.6', desc));
    page.appendChild(item);
  }

  // Challenges
  page.appendChild(el('h2', 'font-size:20px;font-weight:700;color:var(--text);margin:28px 0 8px', 'Challenges'));

  const challenges = [
    ['Claude Code requires tool schemas upfront', 'The current MCP protocol sends all tool definitions at connection time. Lazy loading would require either: (a) a protocol extension for deferred tool loading, (b) a wrapper that intercepts tool calls, or (c) running the registry as the only MCP server and proxying all tool calls through it.'],
    ['Extra round-trip per tool discovery', 'Each find_tool call adds ~1 second of latency before the actual tool call. For sessions that use 3-5 tools, this is negligible. For tool-heavy sessions, it could add up.'],
    ['Cache invalidation', 'Once Claude loads a tool schema, does it stay loaded for the session? If yes, the per-message overhead drops to near zero after the first few messages. If no, every message re-discovers.'],
    ['Anthropic is already working on this', 'Code Mode (98.7% reduction) and OpenAI\'s tool search suggest the platforms will solve this natively. The question is timeline \u2014 and whether the registry\'s implementation ships first.'],
  ];

  for (const [title, desc] of challenges) {
    const item = el('div', 'margin-bottom:12px');
    item.appendChild(el('div', 'font-size:13px;font-weight:600;color:var(--orange);margin-bottom:4px', '\u26A0 ' + title));
    item.appendChild(el('div', 'font-size:13px;color:var(--text-dim);line-height:1.6', desc));
    page.appendChild(item);
  }

  // Status
  page.appendChild(el('h2', 'font-size:20px;font-weight:700;color:var(--text);margin:28px 0 8px', 'Status'));

  const status = el('div', 'background:var(--bg-card);border:1px solid var(--accent);border-radius:var(--radius);padding:20px;margin:16px 0');
  status.appendChild(el('div', 'font-size:16px;font-weight:700;color:var(--accent);margin-bottom:8px', 'Planned'));
  status.appendChild(el('div', 'font-size:14px;color:var(--text-dim);line-height:1.7',
    'The registry already has the catalog, the tool metadata, and the search infrastructure. The missing piece is the MCP server wrapper that exposes find_tool and proxies discovered tool calls. This is the next major feature.'));

  const roadmap = el('div', 'margin-top:12px;padding-top:12px;border-top:1px solid var(--border)');
  const items = [
    [true, 'Server catalog with tool metadata'],
    [true, 'Completeness scoring and auto-enrichment'],
    [true, 'Group-based scoping (43% reduction)'],
    [true, 'Token budget analysis'],
    [false, 'Registry as MCP server with find_tool'],
    [false, 'Semantic tool matching'],
    [false, 'Tool call proxying'],
    [false, 'Session-level tool caching'],
  ];
  for (const [done, text] of items) {
    const item = el('div', 'display:flex;align-items:center;gap:8px;padding:3px 0;font-size:13px');
    item.appendChild(el('span', `color:${done ? 'var(--green)' : 'var(--text-dim)'}`, done ? '\u2713' : '\u25CB'));
    item.appendChild(el('span', `color:${done ? 'var(--text)' : 'var(--text-dim)'}`, text));
    roadmap.appendChild(item);
  }
  status.appendChild(roadmap);
  page.appendChild(status);

  // Pull quote
  page.appendChild(el('div', 'border-left:3px solid var(--accent);padding:12px 20px;margin:24px 0;font-size:15px;font-style:italic;color:var(--text);background:var(--bg-card);border-radius:0 var(--radius) var(--radius) 0',
    'Scoping reduces tool overhead by 43%. Lazy loading would reduce it by 98%. The difference is the difference between managing tools and eliminating the management problem entirely.'));

  container.appendChild(page);
}
