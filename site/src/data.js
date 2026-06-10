function buildMap(files) {
  const byKey = new Map();
  for (const { data } of files.sort((a, b) => a.file.localeCompare(b.file))) {
    for (const r of data.results) {
      byKey.set(`${r.provider}/${r.op}`, { ...r, env: data.environment, generatedAt: data.generatedAt });
    }
  }
  return byKey;
}

/** Synchronous when snapshot.html has embedded the data (file:// previews). */
export function embeddedResults() {
  return window.__BENCH_DATA__ ? buildMap(window.__BENCH_DATA__) : null;
}

/** Loads every result file and keeps the newest result per provider+op. */
export async function loadResults() {
  const manifest = await (await fetch("results/manifest.json")).json();
  const files = await Promise.all(
    manifest.files.map(async (f) => ({ file: f, data: await (await fetch(`results/${f}`)).json() })),
  );
  return buildMap(files);
}

export function fmtMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)}s` : `${Math.round(ms)}ms`;
}

export function okSamples(result) {
  return result.samples.filter((s) => !s.error);
}

export function phaseSamples(result, phase) {
  return okSamples(result).map((s) => s.phases?.[phase] ?? s.durationMs);
}
