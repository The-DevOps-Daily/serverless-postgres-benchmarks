const NS = "http://www.w3.org/2000/svg";
const COLORS = { neon: "var(--neon)", supabase: "var(--supabase)" };
const AMBER = "var(--amber)";

async function loadAll() {
  // snapshot.html embeds the data so the page also works without a server
  const files = window.__BENCH_DATA__
    ? window.__BENCH_DATA__
    : await (async () => {
        const manifest = await (await fetch("../results/manifest.json")).json();
        return Promise.all(
          manifest.files.map(async (f) => ({ file: f, data: await (await fetch(`../results/${f}`)).json() })),
        );
      })();
  // Newest file wins per provider+op
  const byKey = new Map();
  for (const { data } of files.sort((a, b) => a.file.localeCompare(b.file))) {
    for (const r of data.results) {
      byKey.set(`${r.provider}/${r.op}`, { ...r, env: data.environment, generatedAt: data.generatedAt });
    }
  }
  return byKey;
}

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function fmtMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)}s` : `${Math.round(ms)}ms`;
}

/* Horizontal median bars with a p95 tick */
function barChart(container, rows, { width = 980 } = {}) {
  const rowH = 44, labelW = 235, pad = 8, valueW = 150;
  const height = rows.length * rowH + pad * 2;
  const max = Math.max(...rows.map((r) => r.p95)) * 1.08;
  const scale = (v) => (v / max) * (width - labelW - valueW);
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%" });

  rows.forEach((r, i) => {
    const y = pad + i * rowH;
    const cy = y + rowH / 2;
    el("text", { x: 0, y: cy + 4, fill: "var(--text-dim)", "font-size": 12.5 }, svg).textContent = r.label;
    // baseline hairline
    el("line", { x1: labelW, y1: cy, x2: width - valueW, y2: cy, stroke: "rgba(255,255,255,0.06)" }, svg);
    // median bar
    el("rect", {
      x: labelW, y: cy - 7, width: Math.max(2, scale(r.median)), height: 14, rx: 4, fill: r.color, "fill-opacity": 0.85,
    }, svg);
    // p95 tick
    el("line", {
      x1: labelW + scale(r.p95), y1: cy - 11, x2: labelW + scale(r.p95), y2: cy + 11,
      stroke: AMBER, "stroke-width": 2,
    }, svg);
    const value = el("text", { x: width - valueW + 14, y: cy + 4, fill: "var(--text)", "font-size": 12.5 }, svg);
    value.textContent = `${fmtMs(r.median)}`;
    const p95 = el("text", { x: width - valueW + 76, y: cy + 4, fill: "var(--text-faint)", "font-size": 11.5 }, svg);
    p95.textContent = `p95 ${fmtMs(r.p95)}`;
  });
  container.appendChild(svg);
}

/* Strip plot: one row per series, a dot per sample, amber median line */
function stripPlot(container, series, { width = 980, unit = "s" } = {}) {
  const rowH = 64, labelH = 26, padX = 8;
  const height = series.length * rowH + labelH;
  const all = series.flatMap((s) => s.samples);
  const min = Math.min(...all) * 0.94;
  const max = Math.max(...all) * 1.04;
  const scale = (v) => padX + ((v - min) / (max - min)) * (width - padX * 2);
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%" });

  // x axis ticks
  const ticks = 5;
  for (let t = 0; t <= ticks; t++) {
    const v = min + ((max - min) * t) / ticks;
    const x = scale(v);
    el("line", { x1: x, y1: 0, x2: x, y2: height - labelH, stroke: "rgba(255,255,255,0.04)" }, svg);
    const txt = el("text", { x, y: height - 8, fill: "var(--text-faint)", "font-size": 11, "text-anchor": "middle" }, svg);
    txt.textContent = unit === "s" ? `${(v / 1000).toFixed(1)}s` : fmtMs(v);
  }

  series.forEach((s, i) => {
    const cy = i * rowH + rowH / 2;
    if (s.label) {
      el("text", { x: padX, y: i * rowH + 16, fill: "var(--text-dim)", "font-size": 12.5 }, svg).textContent = s.label;
    }
    for (const v of s.samples) {
      el("circle", { cx: scale(v), cy: cy + 8, r: 5, fill: s.color, "fill-opacity": 0.55 }, svg);
    }
    const mx = scale(s.median);
    el("line", { x1: mx, y1: cy - 8, x2: mx, y2: cy + 24, stroke: AMBER, "stroke-width": 2.5 }, svg);
    const lbl = el("text", { x: mx + 9, y: cy - 1, fill: AMBER, "font-size": 12 }, svg);
    lbl.textContent = fmtMs(s.median);
  });
  container.appendChild(svg);
}

function legend(container, items) {
  const div = document.createElement("div");
  div.className = "legend";
  div.innerHTML = items
    .map((i) => `<span><span class="sw" style="background:${i.color}"></span>${i.label}</span>`)
    .join("");
  container.appendChild(div);
}

function statCard(k, v, d) {
  return `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
}

function okSamples(r) {
  return r.samples.filter((s) => !s.error);
}

function phaseSamples(r, phase) {
  return okSamples(r).map((s) => s.phases?.[phase] ?? s.durationMs);
}

const data = await loadAll();
const get = (provider, op) => data.get(`${provider}/${op}`);

/* Meta line */
const anyResult = [...data.values()][0];
const totalSamples = [...data.values()].reduce((n, r) => n + r.samples.length, 0);
const metaEl = document.getElementById("meta");
for (const [label, value] of [
  ["region", "aws eu-central-1"],
  ["client", anyResult.env.clientLocation],
  ["plans", "free / free"],
  ["samples", String(totalSamples)],
  ["updated", anyResult.generatedAt.slice(0, 10)],
]) {
  const span = document.createElement("span");
  span.append(`${label} `);
  const b = document.createElement("b");
  b.textContent = value;
  span.append(b);
  metaEl.append(span);
}

/* Stat cards */
const nq = get("neon", "query-latency");
const sq = get("supabase", "query-latency");
const nc = get("neon", "create-project");
const sc = get("supabase", "create-project");
const cold = get("neon", "cold-start");
const branch = get("neon", "branch");
document.getElementById("stat-cards").innerHTML = [
  statCard("query latency", `~${Math.round((nq.stats.medianMs + sq.stats.medianMs) / 2)}<small>ms</small>`, "median, both platforms. A tie."),
  statCard("create: neon", `${(nc.stats.medianMs / 1000).toFixed(1)}<small>s</small>`, `to first query, p95 ${(nc.stats.p95Ms / 1000).toFixed(1)}s`),
  statCard("create: supabase", `${(sc.stats.medianMs / 1000).toFixed(1)}<small>s</small>`, `to first query, p95 ${(sc.stats.p95Ms / 1000).toFixed(1)}s`),
  statCard("neon cold start", `${Math.round(cold.stats.phases.wakeQueryMs.medianMs)}<small>ms</small>`, `wake query, p95 ${(cold.stats.phases.wakeQueryMs.p95Ms / 1000).toFixed(2)}s`),
  statCard("neon branch", `${(branch.stats.medianMs / 1000).toFixed(1)}<small>s</small>`, "writable copy of 100k rows"),
].join("");

/* Latency bars */
const latencyRows = [
  { label: "Neon · pooler", r: get("neon", "pooled-query-latency"), color: COLORS.neon },
  { label: "Neon · direct", r: get("neon", "query-latency"), color: COLORS.neon },
  { label: "Supabase · direct (IPv6)", r: get("supabase", "direct-query-latency"), color: COLORS.supabase },
  { label: "Supabase · session pooler", r: get("supabase", "query-latency"), color: COLORS.supabase },
  { label: "Supabase · transaction pooler", r: get("supabase", "pooled-query-latency"), color: COLORS.supabase },
].map((x) => ({ label: x.label, color: x.color, median: x.r.stats.medianMs, p95: x.r.stats.p95Ms }));
barChart(document.getElementById("chart-latency"), latencyRows);
legend(document.getElementById("chart-latency"), [
  { color: "#34d399", label: "Neon" },
  { color: "#38bdf8", label: "Supabase" },
  { color: "#f59e0b", label: "p95" },
]);
document.getElementById("latency-runs").textContent = `${get("neon", "query-latency").runs} runs each`;

/* Create strip plot */
stripPlot(document.getElementById("chart-create"), [
  { label: "Neon", samples: okSamples(nc).map((s) => s.durationMs), median: nc.stats.medianMs, color: COLORS.neon },
  { label: "Supabase", samples: okSamples(sc).map((s) => s.durationMs), median: sc.stats.medianMs, color: COLORS.supabase },
], { width: 620 });
document.getElementById("create-runs").textContent = `${nc.runs} runs each`;

/* Cold start strip plot (wake phase) */
stripPlot(document.getElementById("chart-cold"), [
  { label: "", samples: phaseSamples(cold, "wakeQueryMs"), median: cold.stats.phases.wakeQueryMs.medianMs, color: COLORS.neon },
], { width: 620, unit: "ms" });
document.getElementById("cold-runs").textContent = `${cold.runs} runs`;

/* Branch strip plot */
stripPlot(document.getElementById("chart-branch"), [
  { label: "", samples: okSamples(branch).map((s) => s.durationMs), median: branch.stats.medianMs, color: COLORS.neon },
]);
document.getElementById("branch-runs").textContent = `${branch.runs} runs`;
