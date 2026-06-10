import type { OpResult, ProviderName, Sample } from "./types.js";

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    medianMs: round(percentile(sorted, 50)),
    p95Ms: round(percentile(sorted, 95)),
    minMs: round(sorted[0] ?? NaN),
    maxMs: round(sorted[sorted.length - 1] ?? NaN),
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface RunOptions {
  op: string;
  provider: ProviderName;
  runs: number;
  /** Pause between runs so providers aren't hammered (default 2s) */
  pauseMs?: number;
  onProgress?: (run: number, sample: Sample) => void;
}

/**
 * Run one timed operation N times and aggregate. The callback does its own
 * setup/teardown per run and returns sub-phase timings; total duration is
 * measured around the await.
 */
export async function timeOp(
  options: RunOptions,
  fn: (run: number) => Promise<Record<string, number> | void>,
): Promise<OpResult> {
  const samples: Sample[] = [];
  for (let run = 0; run < options.runs; run++) {
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    try {
      const phases = await fn(run);
      const sample: Sample = {
        durationMs: round(performance.now() - t0),
        startedAt,
        ...(phases ? { phases } : {}),
      };
      samples.push(sample);
      options.onProgress?.(run, sample);
    } catch (error) {
      const sample: Sample = {
        durationMs: round(performance.now() - t0),
        startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
      samples.push(sample);
      options.onProgress?.(run, sample);
    }
    if (run < options.runs - 1) {
      await sleep(options.pauseMs ?? 2000);
    }
  }

  const ok = samples.filter((s) => !s.error);
  const phaseKeys = new Set(ok.flatMap((s) => Object.keys(s.phases ?? {})));
  const phases: NonNullable<OpResult["stats"]["phases"]> = {};
  for (const key of phaseKeys) {
    phases[key] = summarize(ok.map((s) => s.phases?.[key]).filter((v): v is number => v != null));
  }

  return {
    op: options.op,
    provider: options.provider,
    runs: options.runs,
    failures: samples.length - ok.length,
    samples,
    stats: {
      ...summarize(ok.map((s) => s.durationMs)),
      ...(phaseKeys.size > 0 ? { phases } : {}),
    },
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll until fn returns truthy or the deadline passes. Returns elapsed ms. */
export async function pollUntil(
  fn: () => Promise<boolean>,
  { timeoutMs = 300_000, intervalMs = 1000 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<number> {
  const t0 = performance.now();
  for (;;) {
    if (await fn()) return performance.now() - t0;
    if (performance.now() - t0 > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
    }
    await sleep(intervalMs);
  }
}
