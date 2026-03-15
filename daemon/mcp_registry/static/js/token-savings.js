/**
 * Token Savings page — live calculations showing the cost of unscoped vs scoped MCP.
 * Shows per-server tokens, per-group budgets, snowball effect across a session,
 * and speed-to-value impact on a 4-hour coding session.
 *
 * Note: All content rendered via trusted data from our own API.
 * No external/user-supplied content is rendered.
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

function barRow(label, pct, text, color) {
  const row = el('div', 'display:flex;align-items:center;gap:12px;margin-bottom:8px');
  row.appendChild(el('span', 'width:160px;font-size:12px;color:var(--text-dim);text-align:right;flex-shrink:0', label));
  const track = el('div', 'flex:1;height:24px;background:var(--bg);border-radius:4px;overflow:hidden');
  const fill = el('div', `height:100%;width:${pct}%;background:${color};border-radius:4px;display:flex;align-items:center;padding:0 8px;font-size:11px;font-weight:600;color:#fff;white-space:nowrap;transition:width 0.8s`);
  fill.textContent = text;
  track.appendChild(fill);
  row.appendChild(track);
  return row;
}

function sectionTitle(text) {
  return el('h2', 'font-size:20px;font-weight:700;color:var(--text);margin:28px 0 8px', text);
}

function richPara(parts) {
  const p = el('p', 'font-size:14px;color:var(--text-dim);line-height:1.7;margin-bottom:12px');
  for (const part of parts) {
    if (typeof part === 'string') {
      p.appendChild(document.createTextNode(part));
    } else {
      const s = document.createElement('strong');
      s.style.color = 'var(--text)';
      s.textContent = part.bold;
      p.appendChild(s);
    }
  }
  return p;
}

export async function renderTokenSavingsView() {
  const container = document.getElementById('view-token-savings');
  if (!container) return;
  container.textContent = '';

  const page = el('div', 'max-width:900px;padding:0 20px 40px');
  const loading = el('div', 'padding:40px;text-align:center;color:var(--text-dim)', 'Computing token budgets...');
  page.appendChild(loading);
  container.appendChild(page);

  let data;
  try {
    data = await api.get('/token-budget');
  } catch {
    loading.textContent = 'Failed to load token data';
    return;
  }
  page.removeChild(loading);

  const u = data.unscoped;
  const g = data.global;
  const s = data.savings;
  const groups = data.groups;
  const servers = data.servers;

  // Hero
  const hero = el('div', 'padding:32px 0;border-bottom:1px solid var(--border);margin-bottom:24px');
  const h1 = el('h1', 'font-size:32px;font-weight:700;line-height:1.2;margin-bottom:12px');
  h1.appendChild(document.createTextNode("You're saving "));
  h1.appendChild(el('span', 'color:var(--green)', `${s.pct}%`));
  h1.appendChild(document.createTextNode(' of your token budget'));
  hero.appendChild(h1);
  hero.appendChild(richPara([
    'By scoping ', {bold: `${u.servers} MCP servers`}, ' into groups instead of loading all ',
    {bold: `${u.tools} tools`}, ' everywhere, you save ',
    {bold: `${s.tokens_per_msg.toLocaleString()} tokens per message`}, ' and ',
    {bold: `~$${s.monthly_usd}/month`}, '.'
  ]));
  page.appendChild(hero);

  // Top-line metrics
  const metrics = el('div', 'display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px');
  metrics.appendChild(metricCard(`${u.tools}`, 'Tools (unscoped)', 'var(--red)'));
  metrics.appendChild(metricCard(`${data.scoped_average.tools}`, 'Tools (avg scoped)', 'var(--green)'));
  metrics.appendChild(metricCard(`${s.pct}%`, 'Reduction', 'var(--green)'));
  metrics.appendChild(metricCard(`$${s.monthly_usd}`, 'Monthly savings', 'var(--accent)'));
  page.appendChild(metrics);

  // ── Per-Server Token Table
  page.appendChild(sectionTitle('Token Cost Per Server'));
  page.appendChild(el('p', 'font-size:14px;color:var(--text-dim);line-height:1.7;margin-bottom:12px',
    'Each MCP server injects its tool schemas into every system prompt. The bigger the server, the more tokens consumed before your conversation even starts.'));

  const sorted = Object.entries(servers).sort((a, b) => b[1].tokens - a[1].tokens);
  for (const [name, info] of sorted) {
    const pct = Math.max(2, (info.tokens / u.tokens) * 100);
    const row = el('div', 'display:flex;align-items:center;gap:8px;margin-bottom:4px');
    row.appendChild(el('span', 'width:160px;font-size:11px;color:var(--text-dim);text-align:right;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', name));
    const track = el('div', 'flex:1;height:18px;background:var(--bg);border-radius:3px;overflow:hidden');
    const fill = el('div', `height:100%;width:${pct}%;background:var(--accent);border-radius:3px;display:flex;align-items:center;padding:0 6px;font-size:10px;font-weight:600;color:#fff;white-space:nowrap;min-width:fit-content`);
    fill.textContent = `${info.tools} tools \u00B7 ${info.tokens.toLocaleString()} tokens`;
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('span', 'font-size:10px;color:var(--text-dim);width:60px;text-align:right;flex-shrink:0', `$${info.cost_per_msg}/msg`));
    page.appendChild(row);
  }

  // ── Global Floor
  page.appendChild(sectionTitle('The Global Floor'));
  page.appendChild(richPara([
    'Your ', {bold: `${g.servers} global servers`}, ' consume ',
    {bold: `${g.tokens.toLocaleString()} tokens`}, ` (${g.tools} tools). This is the minimum every group pays. The biggest contributors:`
  ]));

  const globalSorted = g.server_list
    .map(name => ({ name, ...(servers[name] || { tools: 5, tokens: 1250 }) }))
    .sort((a, b) => b.tokens - a.tokens);

  for (const srv of globalSorted.slice(0, 5)) {
    const pct = (srv.tokens / g.tokens) * 100;
    page.appendChild(barRow(srv.name, pct, `${srv.tools} tools \u00B7 ${srv.tokens.toLocaleString()} tokens`, 'var(--orange)'));
  }

  page.appendChild(richPara([
    {bold: 'Question:'}, ` Do all ${g.servers} global servers need to be global? Moving taskr (${servers.taskr?.tools || '?'} tools) or railguey (${servers.railguey?.tools || '?'} tools) to per-group would lower the floor significantly.`
  ]));

  // ── Per-Group Budgets
  page.appendChild(sectionTitle('Token Budget Per Group'));
  page.appendChild(el('p', 'font-size:14px;color:var(--text-dim);line-height:1.7;margin-bottom:12px',
    "Each group's budget = its own servers + the global floor. Lower is better."));

  page.appendChild(barRow('ALL (unscoped)', 100, `${u.tools} tools \u00B7 ${u.tokens.toLocaleString()} tokens \u00B7 $${u.cost_per_msg}/msg`, 'var(--red)'));

  const groupEntries = Object.entries(groups).filter(([, v]) => v.own_servers > 0).sort((a, b) => a[1].total_tokens - b[1].total_tokens);
  for (const [, group] of groupEntries) {
    const pct = (group.total_tokens / u.tokens) * 100;
    page.appendChild(barRow(
      `${group.label} (${group.total_servers} srv)`,
      pct,
      `${group.total_tools} tools \u00B7 ${group.total_tokens.toLocaleString()} tokens \u00B7 $${group.cost_per_msg}/msg`,
      'var(--green)'
    ));
  }

  // ── The Snowball Effect
  page.appendChild(sectionTitle('The Snowball Effect'));
  page.appendChild(el('p', 'font-size:14px;color:var(--text-dim);line-height:1.7;margin-bottom:12px',
    "Tool schemas aren't a one-time cost. They compound across every message in a session. Here's how context fills up:"));

  const contextLimit = 200000;
  const avgMsgTokens = 2500;
  const checkpoints = [1, 10, 25, 50, 75, 100];

  const simHeader = el('div', 'display:grid;grid-template-columns:80px 1fr 1fr 1fr;gap:8px;padding:8px 0;border-bottom:2px solid var(--border);font-size:11px;color:var(--text-dim);text-transform:uppercase');
  simHeader.appendChild(el('span', '', 'Message'));
  simHeader.appendChild(el('span', '', 'Unscoped context'));
  simHeader.appendChild(el('span', '', 'Scoped context'));
  simHeader.appendChild(el('span', '', 'Savings'));
  page.appendChild(simHeader);

  let unscopedCompressAt = 0;
  let scopedCompressAt = 0;

  for (const msgNum of checkpoints) {
    const conversation = msgNum * avgMsgTokens;
    const unscopedTotal = u.tokens + conversation;
    const scopedTotal = data.scoped_average.tokens + conversation;
    const unscopedPct = Math.min(100, (unscopedTotal / contextLimit) * 100);
    const scopedPct = Math.min(100, (scopedTotal / contextLimit) * 100);
    const unscopedFull = unscopedTotal > contextLimit;
    const scopedFull = scopedTotal > contextLimit;
    if (unscopedFull && !unscopedCompressAt) unscopedCompressAt = msgNum;
    if (scopedFull && !scopedCompressAt) scopedCompressAt = msgNum;

    const row = el('div', `display:grid;grid-template-columns:80px 1fr 1fr 1fr;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;${unscopedFull ? 'background:rgba(248,81,73,0.05)' : ''}`);
    row.appendChild(el('span', 'font-weight:600;color:var(--text)', `#${msgNum}`));
    row.appendChild(el('span', `color:${unscopedFull ? 'var(--red)' : 'var(--text-dim)'}`,
      `${(unscopedTotal / 1000).toFixed(0)}K / ${(contextLimit / 1000).toFixed(0)}K (${unscopedPct.toFixed(0)}%)${unscopedFull ? ' COMPRESSED' : ''}`));
    row.appendChild(el('span', `color:${scopedFull ? 'var(--red)' : 'var(--green)'}`,
      `${(scopedTotal / 1000).toFixed(0)}K / ${(contextLimit / 1000).toFixed(0)}K (${scopedPct.toFixed(0)}%)${scopedFull ? ' COMPRESSED' : ''}`));
    row.appendChild(el('span', 'color:var(--accent);font-weight:500', `${((unscopedTotal - scopedTotal) / 1000).toFixed(0)}K saved`));
    page.appendChild(row);
  }

  if (unscopedCompressAt) {
    page.appendChild(richPara([
      {bold: `Context compression starts at message #${unscopedCompressAt} (unscoped)`},
      ` vs ${scopedCompressAt ? `#${scopedCompressAt}` : 'never'} (scoped). After compression, the agent loses earlier conversation — it forgets what you discussed, repeats questions, and makes decisions without full history.`
    ]));
  }

  // ── Speed to Value: 4-Hour Session
  page.appendChild(sectionTitle('Speed to Value: 4-Hour Session'));

  const totalMsgs = 100;
  const totalUnscopedTokens = totalMsgs * u.tokens;
  const totalScopedTokens = totalMsgs * data.scoped_average.tokens;
  const totalSavedTokens = totalUnscopedTokens - totalScopedTokens;
  const totalUnscopedCost = totalUnscopedTokens / 1_000_000 * 3;
  const totalScopedCost = totalScopedTokens / 1_000_000 * 3;
  const extraSecondsPerMsg = (u.tokens - data.scoped_average.tokens) / 5000;
  const totalExtraMinutes = Math.round(extraSecondsPerMsg * totalMsgs / 60);

  page.appendChild(richPara([
    `In a 4-hour coding session (~${totalMsgs} messages), the tool schema overhead alone accounts for:`
  ]));

  const sessionMetrics = el('div', 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0');
  sessionMetrics.appendChild(metricCard(`${(totalSavedTokens / 1_000_000).toFixed(1)}M`, 'Tokens saved per session', 'var(--green)'));
  sessionMetrics.appendChild(metricCard(`$${(totalUnscopedCost - totalScopedCost).toFixed(2)}`, 'Cost saved per session', 'var(--green)'));
  sessionMetrics.appendChild(metricCard(`~${totalExtraMinutes} min`, 'Time recovered per session', 'var(--accent)'));
  page.appendChild(sessionMetrics);

  page.appendChild(barRow('Unscoped session', 100, `${(totalUnscopedTokens / 1_000_000).toFixed(1)}M tokens \u00B7 $${totalUnscopedCost.toFixed(2)}`, 'var(--red)'));
  page.appendChild(barRow('Scoped session', Math.round(totalScopedTokens / totalUnscopedTokens * 100), `${(totalScopedTokens / 1_000_000).toFixed(1)}M tokens \u00B7 $${totalScopedCost.toFixed(2)}`, 'var(--green)'));

  page.appendChild(richPara([
    {bold: 'The compounding reality:'}, ` Over ${totalMsgs} messages, you save ${s.tokens_per_msg.toLocaleString()} tokens `,
    {bold: `${totalMsgs} times`}, `. That's `, {bold: `${totalSavedTokens.toLocaleString()} fewer tokens`},
    ` processed, meaning faster responses, later compression, and more room for actual code.`
  ]));

  // ── Yearly Projection
  page.appendChild(sectionTitle('Projected Savings'));

  const projections = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0');

  const monthCard = el('div', 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px');
  monthCard.appendChild(el('div', 'font-size:12px;font-weight:600;color:var(--text-dim);text-transform:uppercase;margin-bottom:10px', 'Monthly (2 sessions/day, 22 work days)'));
  const mTokens = totalSavedTokens * 2 * 22;
  const mCost = (totalUnscopedCost - totalScopedCost) * 2 * 22;
  const mTime = totalExtraMinutes * 2 * 22;
  monthCard.appendChild(el('div', 'font-size:13px;color:var(--text);padding:4px 0', `Tokens saved: ${(mTokens / 1_000_000).toFixed(0)}M`));
  monthCard.appendChild(el('div', 'font-size:13px;color:var(--green);padding:4px 0;font-weight:600', `Cost saved: $${mCost.toFixed(0)}`));
  monthCard.appendChild(el('div', 'font-size:13px;color:var(--accent);padding:4px 0', `Time recovered: ${Math.round(mTime / 60)} hours`));
  projections.appendChild(monthCard);

  const yearCard = el('div', 'background:var(--bg-card);border:1px solid var(--green);border-radius:var(--radius);padding:16px');
  yearCard.appendChild(el('div', 'font-size:12px;font-weight:600;color:var(--green);text-transform:uppercase;margin-bottom:10px', 'Yearly'));
  yearCard.appendChild(el('div', 'font-size:13px;color:var(--text);padding:4px 0', `Tokens saved: ${(mTokens * 12 / 1_000_000_000).toFixed(1)}B`));
  yearCard.appendChild(el('div', 'font-size:20px;color:var(--green);padding:4px 0;font-weight:700', `$${(mCost * 12).toFixed(0)} saved`));
  yearCard.appendChild(el('div', 'font-size:13px;color:var(--accent);padding:4px 0', `${Math.round(mTime * 12 / 60)} hours recovered`));
  projections.appendChild(yearCard);

  page.appendChild(projections);

  // Pull quote
  const quote = el('div', 'border-left:3px solid var(--accent);padding:12px 20px;margin:24px 0;font-size:15px;font-style:italic;color:var(--text);background:var(--bg-card);border-radius:0 var(--radius) var(--radius) 0',
    "Every unscoped tool is a tax on every message. The tax is small per message but devastating across a session. Scoping doesn't make your tools better \u2014 it stops them from making everything else worse.");
  page.appendChild(quote);

  container.appendChild(page);
}
