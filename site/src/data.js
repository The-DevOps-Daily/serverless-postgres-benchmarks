function build(files) {
  const latest = new Map();
  const history = new Map();
  for (const { data } of files.sort((a, b) => a.file.localeCompare(b.file))) {
    if (!Array.isArray(data.results)) continue; // e.g. cost-model files
    const date = data.generatedAt.slice(0, 10);
    for (const r of data.results) {
      // concurrency runs at several client levels; keep them distinct
      const level = r.op === "concurrency" ? r.samples.find((s) => s.phases?.clients)?.phases.clients : null;
      // size-sweep runs (seedRows recorded) keep one key per size; 100k is the default size
      const sized = r.seedRows && r.seedRows !== 100_000;
      const key = `${r.provider}/${r.op}${level ? `-c${level}` : ""}${sized ? `-r${r.seedRows}` : ""}`;
      const entry = { ...r, env: data.environment, generatedAt: data.generatedAt };
      latest.set(key, entry);
      if (r.seedRows && !sized) latest.set(`${r.provider}/${r.op}-r${r.seedRows}`, entry);
      if (!history.has(key)) history.set(key, []);
      const entries = history.get(key);
      const existing = entries.find((e) => e.date === date);
      const point = { date, medianMs: r.stats.medianMs, p95Ms: r.stats.p95Ms };
      if (existing) Object.assign(existing, point);
      else entries.push(point);
    }
  }
  return { latest, history, files };
}

/** Synchronous when snapshot.html has embedded the data (file:// previews). */
export function embeddedResults() {
  return window.__BENCH_DATA__ ? build(window.__BENCH_DATA__) : null;
}

/** Loads every result file; latest result per provider+op plus per-date history. */
export async function loadResults() {
  const manifest = await (await fetch("results/manifest.json")).json();
  const files = await Promise.all(
    manifest.files.map(async (f) => ({ file: f, data: await (await fetch(`results/${f}`)).json() })),
  );
  return build(files);
}

/** The newest cost-model file, when present in the manifest. */
export function costModelFrom(files) {
  const models = files
    .filter(({ data }) => data.kind === "cost-model")
    .sort((a, b) => a.file.localeCompare(b.file));
  return models.length ? models[models.length - 1].data : null;
}

export function fmtMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)}s` : `${Math.round(ms * 10) / 10}ms`;
}

/** Samples as {v, at} points for the strip plots. */
export function samplePoints(result, phase) {
  return result.samples
    .filter((s) => !s.error)
    .map((s) => ({ v: phase ? (s.phases?.[phase] ?? s.durationMs) : s.durationMs, at: s.startedAt }));
}
