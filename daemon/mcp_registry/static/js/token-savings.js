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
  } catch(e) {
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
  page.appendChild(richPara([
    'Tool schemas are re-sent in ', {bold: 'every single API call'}, '. Message #50 doesn\'t pay the tool tax once \u2014 it\'s the ',
    {bold: '50th time'}, ' you\'ve paid it. The cumulative cost is multiplicative, not additive.'
  ]));

  const avgMsgTokens = 2500; // avg conversation per turn (user + assistant)
  const contextLimit = 200000;
  const checkpoints = [1, 10, 25, 50, 75, 100];
  const unscopedToolTokens = u.tokens;
  const scopedToolTokens = data.scoped_average.tokens;
  const inputPricePerM = 3; // Sonnet input $/MTok

  // ── Chart rendering utilities
  const CHART_W = 800;
  const CHART_H = 300;
  const PAD = { top: 30, right: 20, bottom: 50, left: 70 };
  const COLORS = { red: '#f85149', green: '#3fb950', orange: '#d29922', blue: '#58a6ff', gray: '#8b949e', grid: '#30363d', bg: '#161b22', label: '#8b949e' };

  function createCanvas(title) {
    const wrap = el('div', 'margin:24px 0');
    wrap.appendChild(el('div', 'font-size:14px;font-weight:600;color:var(--accent);margin-bottom:8px', title));
    const canvas = document.createElement('canvas');
    canvas.width = CHART_W;
    canvas.height = CHART_H;
    canvas.style.cssText = 'width:100%;max-width:800px;height:auto;border-radius:6px;background:#161b22';
    wrap.appendChild(canvas);
    return { wrap, canvas };
  }

  function drawLineChart(canvas, config) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const plotW = w - PAD.left - PAD.right;
    const plotH = h - PAD.top - PAD.bottom;

    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    // Axis ranges
    const xMin = config.xMin || 0;
    const xMax = config.xMax;
    const yMin = config.yMin || 0;
    const yMax = config.yMax;

    function toX(v) { return PAD.left + ((v - xMin) / (xMax - xMin)) * plotW; }
    function toY(v) { return PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH; }

    // Grid lines (horizontal)
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const yTicks = config.yTicks || 5;
    for (let i = 0; i <= yTicks; i++) {
      const v = yMin + (yMax - yMin) * i / yTicks;
      const y = toY(v);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(w - PAD.right, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.label;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(config.yFormat(v), PAD.left - 8, y);
    }

    // X axis labels
    const xLabelStep = config.xLabelStep || 20;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let x = xMin; x <= xMax; x += xLabelStep) {
      ctx.fillStyle = COLORS.label;
      ctx.fillText(String(x), toX(x), h - PAD.bottom + 8);
    }

    // X axis label
    if (config.xLabel) {
      ctx.fillStyle = COLORS.label;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(config.xLabel, PAD.left + plotW / 2, h - 6);
    }

    // Horizontal dashed reference lines
    if (config.hLines) {
      for (const hl of config.hLines) {
        ctx.save();
        ctx.strokeStyle = hl.color || COLORS.gray;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        const y = toY(hl.value);
        if (y >= PAD.top && y <= PAD.top + plotH) {
          ctx.beginPath();
          ctx.moveTo(PAD.left, y);
          ctx.lineTo(w - PAD.right, y);
          ctx.stroke();
          ctx.fillStyle = hl.color || COLORS.gray;
          ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(hl.label, PAD.left + 4, y - 3);
        }
        ctx.restore();
      }
    }

    // Draw lines
    for (const series of config.series) {
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < series.data.length; i++) {
        const px = toX(series.data[i][0]);
        const py = toY(Math.min(series.data[i][1], yMax));
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Markers (optional)
      if (series.markers) {
        for (const m of series.markers) {
          const mx = toX(m.x);
          const my = toY(Math.min(m.y, yMax));
          ctx.fillStyle = series.color;
          ctx.beginPath();
          ctx.arc(mx, my, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = COLORS.label;
          ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = m.align || 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(m.label, mx + (m.align === 'right' ? -6 : 6), my - 6);
        }
      }
    }

    // Legend
    if (config.legend) {
      const legendY = 12;
      let legendX = PAD.left + 10;
      ctx.font = '11px system-ui, sans-serif';
      for (const item of config.legend) {
        ctx.fillStyle = item.color;
        ctx.fillRect(legendX, legendY - 4, 14, 3);
        legendX += 18;
        ctx.fillStyle = COLORS.label;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label, legendX, legendY);
        legendX += ctx.measureText(item.label).width + 20;
      }
    }
  }

  function drawBarChart(canvas, config) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const plotW = w - PAD.left - PAD.right;
    const plotH = h - PAD.top - PAD.bottom;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    const yMin = 0;
    const yMax = config.yMax;
    function toY(v) { return PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH; }

    // Y grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const yTicks = config.yTicks || 5;
    for (let i = 0; i <= yTicks; i++) {
      const v = yMax * i / yTicks;
      const y = toY(v);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(w - PAD.right, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.label;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(config.yFormat(v), PAD.left - 8, y);
    }

    // Draw groups
    const groups = config.groups;
    const groupWidth = plotW / groups.length;
    const barWidth = groupWidth / (groups[0].bars.length + 1);

    for (let gi = 0; gi < groups.length; gi++) {
      const gx = PAD.left + gi * groupWidth;
      // Group label
      ctx.fillStyle = COLORS.label;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(groups[gi].label, gx + groupWidth / 2, h - PAD.bottom + 8);

      for (let bi = 0; bi < groups[gi].bars.length; bi++) {
        const bar = groups[gi].bars[bi];
        const bx = gx + (bi + 0.5) * barWidth;
        const by = toY(bar.value);
        const bh = toY(0) - by;
        ctx.fillStyle = bar.color;
        ctx.fillRect(bx, by, barWidth * 0.8, bh);

        // Value label on bar
        ctx.fillStyle = '#fff';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(bar.label, bx + barWidth * 0.4, by - 4);
      }
    }

    // Legend
    if (config.legend) {
      let legendX = PAD.left + 10;
      const legendY = 14;
      ctx.font = '11px system-ui, sans-serif';
      for (const item of config.legend) {
        ctx.fillStyle = item.color;
        ctx.fillRect(legendX, legendY - 5, 12, 10);
        legendX += 16;
        ctx.fillStyle = COLORS.label;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label, legendX, legendY);
        legendX += ctx.measureText(item.label).width + 20;
      }
    }
  }

  // ── Generate data series (messages 1..100)
  const msgPoints = [];
  for (let n = 1; n <= 100; n++) msgPoints.push(n);

  // Context window at message N = tools + N * avgMsgTokens
  const unscopedCtxData = msgPoints.map(n => [n, unscopedToolTokens + n * avgMsgTokens]);
  const scopedCtxData = msgPoints.map(n => [n, scopedToolTokens + n * avgMsgTokens]);

  // Find compression points
  let unscopedCompressAt = 0;
  let scopedCompressAt = 0;
  for (const n of msgPoints) {
    if (!unscopedCompressAt && unscopedToolTokens + n * avgMsgTokens > contextLimit) unscopedCompressAt = n;
    if (!scopedCompressAt && scopedToolTokens + n * avgMsgTokens > contextLimit) scopedCompressAt = n;
  }

  // Cumulative billed = N * tools + avgMsg * N*(N+1)/2
  const unscopedBilledData = msgPoints.map(n => [n, n * unscopedToolTokens + avgMsgTokens * n * (n + 1) / 2]);
  const scopedBilledData = msgPoints.map(n => [n, n * scopedToolTokens + avgMsgTokens * n * (n + 1) / 2]);
  const toolTaxOnlyData = msgPoints.map(n => [n, n * unscopedToolTokens]);
  const convOnlyData = msgPoints.map(n => [n, avgMsgTokens * n * (n + 1) / 2]);

  // Cumulative cost
  const unscopedCostData = msgPoints.map(n => {
    const billed = n * unscopedToolTokens + avgMsgTokens * n * (n + 1) / 2;
    return [n, billed / 1_000_000 * inputPricePerM];
  });
  const scopedCostData = msgPoints.map(n => {
    const billed = n * scopedToolTokens + avgMsgTokens * n * (n + 1) / 2;
    return [n, billed / 1_000_000 * inputPricePerM];
  });

  // ── Chart 1: Context Window Size Over Session
  const chart1 = createCanvas('Context Window Size Over Session');
  const ctxYMax = Math.max(unscopedCtxData[99][1], contextLimit) * 1.1;
  const unscopedMarkers = [];
  const scopedMarkers = [];
  if (unscopedCompressAt) unscopedMarkers.push({ x: unscopedCompressAt, y: contextLimit, label: `Compress #${unscopedCompressAt}`, align: 'right' });
  if (scopedCompressAt) scopedMarkers.push({ x: scopedCompressAt, y: contextLimit, label: `Compress #${scopedCompressAt}`, align: 'left' });

  drawLineChart(chart1.canvas, {
    xMin: 1, xMax: 100, xLabelStep: 10,
    yMin: 0, yMax: ctxYMax, yTicks: 5,
    xLabel: 'Message Number',
    yFormat: v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(Math.round(v)),
    hLines: [{ value: contextLimit, label: '200K Context Limit', color: COLORS.orange }],
    series: [
      { color: COLORS.red, data: unscopedCtxData, markers: unscopedMarkers },
      { color: COLORS.green, data: scopedCtxData, markers: scopedMarkers }
    ],
    legend: [
      { label: 'Unscoped', color: COLORS.red },
      { label: 'Scoped', color: COLORS.green }
    ]
  });

  // Add annotation below chart 1
  const gap1Note = el('p', 'font-size:12px;color:var(--text-dim);margin-top:6px;margin-bottom:0');
  gap1Note.appendChild(document.createTextNode('The gap between lines = '));
  const gapBold = document.createElement('strong');
  gapBold.style.color = 'var(--text)';
  gapBold.textContent = `${((unscopedToolTokens - scopedToolTokens) / 1000).toFixed(0)}K tokens`;
  gap1Note.appendChild(gapBold);
  gap1Note.appendChild(document.createTextNode(' of tool schema overhead on every single message.'));
  chart1.wrap.appendChild(gap1Note);
  page.appendChild(chart1.wrap);

  // ── Chart 2: Cumulative Input Tokens Billed
  const chart2 = createCanvas('Cumulative Input Tokens Billed');
  const billedYMax = unscopedBilledData[99][1] * 1.1;

  drawLineChart(chart2.canvas, {
    xMin: 1, xMax: 100, xLabelStep: 10,
    yMin: 0, yMax: billedYMax, yTicks: 5,
    xLabel: 'Message Number',
    yFormat: v => `${(v / 1_000_000).toFixed(1)}M`,
    series: [
      { color: COLORS.red, data: unscopedBilledData },
      { color: COLORS.green, data: scopedBilledData },
      { color: COLORS.orange, data: toolTaxOnlyData },
      { color: COLORS.gray, data: convOnlyData }
    ],
    legend: [
      { label: 'Total Unscoped', color: COLORS.red },
      { label: 'Total Scoped', color: COLORS.green },
      { label: 'Tool Tax Only', color: COLORS.orange },
      { label: 'Conversation Only', color: COLORS.gray }
    ]
  });

  const waste2Note = el('p', 'font-size:12px;color:var(--text-dim);margin-top:6px;margin-bottom:0');
  waste2Note.appendChild(document.createTextNode('The area between red and green = tokens wasted on unscoped tool schemas the model never used.'));
  chart2.wrap.appendChild(waste2Note);
  page.appendChild(chart2.wrap);

  // ── Chart 3: Cumulative Cost
  const chart3 = createCanvas('Cumulative Cost ($)');
  const costYMax = unscopedCostData[99][1] * 1.1;

  drawLineChart(chart3.canvas, {
    xMin: 1, xMax: 100, xLabelStep: 10,
    yMin: 0, yMax: costYMax, yTicks: 5,
    xLabel: 'Message Number',
    yFormat: v => `$${v.toFixed(2)}`,
    series: [
      { color: COLORS.red, data: unscopedCostData, markers: [
        { x: 100, y: unscopedCostData[99][1], label: `$${unscopedCostData[99][1].toFixed(2)}`, align: 'right' }
      ]},
      { color: COLORS.green, data: scopedCostData, markers: [
        { x: 100, y: scopedCostData[99][1], label: `$${scopedCostData[99][1].toFixed(2)}`, align: 'right' }
      ]}
    ],
    legend: [
      { label: 'Unscoped', color: COLORS.red },
      { label: 'Scoped', color: COLORS.green }
    ]
  });

  const costGap = unscopedCostData[99][1] - scopedCostData[99][1];
  const cost3Note = el('p', 'font-size:12px;color:var(--text-dim);margin-top:6px;margin-bottom:0');
  cost3Note.appendChild(document.createTextNode('After 100 messages: '));
  const costBold = document.createElement('strong');
  costBold.style.color = 'var(--green)';
  costBold.textContent = `$${costGap.toFixed(2)} saved`;
  cost3Note.appendChild(costBold);
  cost3Note.appendChild(document.createTextNode(` \u2014 and the gap keeps growing with every message.`));
  chart3.wrap.appendChild(cost3Note);
  page.appendChild(chart3.wrap);

  // ── Chart 4: Snowball Model vs Simple Model (bar chart)
  const chart4 = createCanvas('Snowball Model vs Simple Model');

  // Simple model: 100 msgs, just multiply
  const simpleUnscopedCost = 100 * unscopedToolTokens / 1_000_000 * inputPricePerM;
  const simpleScopedCost = 100 * scopedToolTokens / 1_000_000 * inputPricePerM;
  // Snowball model: unscoped 120 msgs (20% penalty), scoped 105 (5% penalty)
  const snowballUnscopedMsgs = 120;
  const snowballScopedMsgs = 105;
  const snowballUnscopedCost = (snowballUnscopedMsgs * unscopedToolTokens + avgMsgTokens * snowballUnscopedMsgs * (snowballUnscopedMsgs + 1) / 2) / 1_000_000 * inputPricePerM;
  const snowballScopedCost = (snowballScopedMsgs * scopedToolTokens + avgMsgTokens * snowballScopedMsgs * (snowballScopedMsgs + 1) / 2) / 1_000_000 * inputPricePerM;

  const barYMax = Math.max(simpleUnscopedCost, snowballUnscopedCost) * 1.2;

  drawBarChart(chart4.canvas, {
    yMax: barYMax, yTicks: 5,
    yFormat: v => `$${v.toFixed(2)}`,
    groups: [
      {
        label: 'Simple (100 msgs)',
        bars: [
          { value: simpleUnscopedCost, color: COLORS.red, label: `$${simpleUnscopedCost.toFixed(2)}` },
          { value: simpleScopedCost, color: COLORS.green, label: `$${simpleScopedCost.toFixed(2)}` }
        ]
      },
      {
        label: `Snowball (${snowballUnscopedMsgs} vs ${snowballScopedMsgs} msgs)`,
        bars: [
          { value: snowballUnscopedCost, color: COLORS.red, label: `$${snowballUnscopedCost.toFixed(2)}` },
          { value: snowballScopedCost, color: COLORS.green, label: `$${snowballScopedCost.toFixed(2)}` }
        ]
      }
    ],
    legend: [
      { label: 'Unscoped', color: COLORS.red },
      { label: 'Scoped', color: COLORS.green }
    ]
  });

  const simpleSavings = simpleUnscopedCost - simpleScopedCost;
  const snowballSavings = snowballUnscopedCost - snowballScopedCost;
  const bar4Note = el('p', 'font-size:12px;color:var(--text-dim);margin-top:6px;margin-bottom:0');
  bar4Note.appendChild(document.createTextNode(`Simple model savings: $${simpleSavings.toFixed(2)}. Snowball model savings: `));
  const snowBold = document.createElement('strong');
  snowBold.style.color = 'var(--green)';
  snowBold.textContent = `$${snowballSavings.toFixed(2)}`;
  bar4Note.appendChild(snowBold);
  bar4Note.appendChild(document.createTextNode(` \u2014 ${(snowballSavings / simpleSavings).toFixed(1)}x more savings when you account for re-sending context.`));
  chart4.wrap.appendChild(bar4Note);
  page.appendChild(chart4.wrap);

  // ── Data table: key data points
  page.appendChild(el('div', 'font-size:13px;font-weight:600;color:var(--accent);margin:24px 0 8px', 'Key Data Points'));
  const tableCols = ['Msg', 'Conversation', 'Tool Tax', 'Unscoped Total', 'Scoped Total', 'Waste', 'Tool % of Total'];
  const tblHeader = el('div', 'display:grid;grid-template-columns:50px repeat(6,1fr);gap:4px;padding:8px 0;border-bottom:2px solid var(--border);font-size:10px;color:var(--text-dim);text-transform:uppercase');
  for (const t of tableCols) tblHeader.appendChild(el('span', 'text-align:right', t));
  page.appendChild(tblHeader);

  for (const n of checkpoints) {
    const convAccum = avgMsgTokens * n * (n + 1) / 2;
    const toolTax = n * unscopedToolTokens;
    const unscopedTotal = toolTax + convAccum;
    const scopedTotal = n * scopedToolTokens + convAccum;
    const waste = unscopedTotal - scopedTotal;
    const toolPct = Math.round((toolTax / unscopedTotal) * 100);

    const row = el('div', 'display:grid;grid-template-columns:50px repeat(6,1fr);gap:4px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px');
    row.appendChild(el('span', 'font-weight:600;color:var(--text);text-align:right', `#${n}`));
    row.appendChild(el('span', 'color:var(--text-dim);text-align:right', `${(convAccum / 1_000_000).toFixed(2)}M`));
    row.appendChild(el('span', 'color:var(--orange);text-align:right', `${(toolTax / 1_000_000).toFixed(2)}M`));
    row.appendChild(el('span', 'color:var(--red);text-align:right', `${(unscopedTotal / 1_000_000).toFixed(2)}M`));
    row.appendChild(el('span', 'color:var(--green);text-align:right', `${(scopedTotal / 1_000_000).toFixed(2)}M`));
    row.appendChild(el('span', 'color:var(--accent);text-align:right', `${(waste / 1_000_000).toFixed(2)}M`));
    row.appendChild(el('span', 'color:var(--text-dim);text-align:right', `${toolPct}%`));
    page.appendChild(row);
  }

  // Highlight totals
  const finalUnscoped = 100 * unscopedToolTokens + avgMsgTokens * 100 * 101 / 2;
  const finalScoped = 100 * scopedToolTokens + avgMsgTokens * 100 * 101 / 2;
  const finalWaste = finalUnscoped - finalScoped;

  page.appendChild(richPara([
    'After 100 messages: ', {bold: `${(finalUnscoped / 1_000_000).toFixed(1)}M total input tokens billed (unscoped)`},
    ' vs ', {bold: `${(finalScoped / 1_000_000).toFixed(1)}M (scoped)`},
    '. That\'s ', {bold: `${(finalWaste / 1_000_000).toFixed(1)}M tokens of pure waste`},
    ` \u2014 $${(finalWaste / 1_000_000 * inputPricePerM).toFixed(2)} burned on tool definitions the model never used.`
  ]));

  // ── Context Window Pressure table (reformatted)
  page.appendChild(el('div', 'font-size:13px;font-weight:600;color:var(--accent);margin:24px 0 8px', 'Context Window Pressure'));
  page.appendChild(el('p', 'font-size:12px;color:var(--text-dim);margin-bottom:8px',
    'How fast the context window fills up. When it hits 100%, Claude compresses prior messages \u2014 you lose conversation history.'));

  const ctxCols = ['Msg', 'Unscoped', 'Capacity', 'Scoped', 'Capacity', 'Extra Room'];
  const ctxHeader = el('div', 'display:grid;grid-template-columns:50px 1fr 70px 1fr 70px 1fr;gap:4px;padding:8px 0;border-bottom:2px solid var(--border);font-size:10px;color:var(--text-dim);text-transform:uppercase');
  for (const t of ctxCols) ctxHeader.appendChild(el('span', 'text-align:right', t));
  page.appendChild(ctxHeader);

  for (const n of checkpoints) {
    const conversation = n * avgMsgTokens;
    const unscopedCtx = unscopedToolTokens + conversation;
    const scopedCtx = scopedToolTokens + conversation;
    const unscopedPct = Math.min(100, (unscopedCtx / contextLimit) * 100);
    const scopedPct = Math.min(100, (scopedCtx / contextLimit) * 100);
    const unscopedFull = unscopedCtx > contextLimit;
    const scopedFull = scopedCtx > contextLimit;
    const extraRoom = unscopedCtx - scopedCtx;

    const row = el('div', `display:grid;grid-template-columns:50px 1fr 70px 1fr 70px 1fr;gap:4px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;${unscopedFull ? 'background:rgba(248,81,73,0.05)' : ''}`);
    row.appendChild(el('span', 'font-weight:600;color:var(--text);text-align:right', `#${n}`));
    row.appendChild(el('span', `color:${unscopedFull ? 'var(--red)' : 'var(--text-dim)'};text-align:right`,
      `${(unscopedCtx / 1000).toFixed(0)}K${unscopedFull ? ' \u26A0' : ''}`));
    row.appendChild(el('span', `color:${unscopedFull ? 'var(--red)' : 'var(--text-dim)'};text-align:right`, `${unscopedPct.toFixed(0)}%`));
    row.appendChild(el('span', `color:${scopedFull ? 'var(--red)' : 'var(--green)'};text-align:right`,
      `${(scopedCtx / 1000).toFixed(0)}K${scopedFull ? ' \u26A0' : ''}`));
    row.appendChild(el('span', `color:${scopedFull ? 'var(--red)' : 'var(--green)'};text-align:right`, `${scopedPct.toFixed(0)}%`));
    row.appendChild(el('span', 'color:var(--accent);text-align:right', `+${(extraRoom / 1000).toFixed(0)}K`));
    page.appendChild(row);
  }

  if (unscopedCompressAt) {
    page.appendChild(richPara([
      {bold: `Context compression hits at message #${unscopedCompressAt} (unscoped)`},
      ` vs ${scopedCompressAt ? `#${scopedCompressAt}` : 'never'} (scoped). After compression, the agent loses prior conversation \u2014 forgets what you discussed, repeats questions, makes decisions without full context. With scoping, you get `,
      {bold: `${((unscopedToolTokens - scopedToolTokens) / 1000).toFixed(0)}K more tokens`},
      ` of room for actual code and conversation on every message.`
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
