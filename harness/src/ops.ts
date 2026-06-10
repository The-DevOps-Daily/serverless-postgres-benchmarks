import { BENCH_PREFIX } from "./config.js";
import { queryOnce, firstSuccessfulQuery, tlsFor } from "./providers/sql.js";
import { percentile, sleep, timeOp } from "./timing.js";
import type { OpResult, Provider } from "./types.js";

export type OpName =
  | "create-project"
  | "query-latency"
  | "pooled-query-latency"
  | "direct-query-latency"
  | "cold-start"
  | "branch"
  | "branch-with-data"
  | "resize"
  | "replica"
  | "restore"
  | "concurrency";

export const ALL_OPS: OpName[] = [
  "create-project",
  "query-latency",
  "pooled-query-latency",
  "direct-query-latency",
  "cold-start",
  "branch",
  "branch-with-data",
  "resize",
  "replica",
  "restore",
  "concurrency",
];

export type LatencyTarget = "primary" | "pooled" | "direct";

function uniqueName(op: string, run: number): string {
  const suffix = `${process.pid.toString(36)}${run.toString(36)}${Math.floor(performance.now()).toString(36)}`;
  return `${BENCH_PREFIX}${op}-${suffix}`;
}

/**
 * create-project: time from API call to (a) management API reports ready and
 * (b) first successful SQL query. Project is deleted between runs.
 */
export async function createProjectOp(provider: Provider, runs: number): Promise<OpResult> {
  return timeOp({ op: "create-project", provider: provider.name, runs, pauseMs: 5000 }, async (run) => {
    const t0 = performance.now();
    const project = await provider.createProject(uniqueName("create", run));
    const totalMs = performance.now() - t0;
    try {
      return { readyAndQueryableMs: totalMs };
    } finally {
      await provider.deleteProject(project.id);
    }
  });
}

/**
 * query-latency: one shared project, N cold connections each running
 * `select 1`. Measures connect + auth + query round trip (what a serverless
 * function pays per invocation without a pooler-side warm connection).
 * Targets: primary (provider's default IPv4 path), pooled (transaction
 * pooler), direct (straight to compute, IPv6 on Supabase free).
 */
export async function queryLatencyOp(
  provider: Provider,
  runs: number,
  { target = "primary" }: { target?: LatencyTarget } = {},
): Promise<OpResult> {
  const opName: OpName =
    target === "pooled" ? "pooled-query-latency" : target === "direct" ? "direct-query-latency" : "query-latency";
  const project = await provider.createProject(uniqueName(opName.slice(0, 4), 0));
  const connectionString =
    target === "pooled"
      ? project.pooledConnectionString ?? project.connectionString
      : target === "direct"
        ? project.directConnectionString ?? project.connectionString
        : project.connectionString;
  try {
    // A couple of warm-up queries so the first sample isn't a compute cold start
    await queryOnce(connectionString);
    await queryOnce(connectionString);
    return await timeOp({ op: opName, provider: provider.name, runs, pauseMs: 500 }, async () => {
      await queryOnce(connectionString);
    });
  } finally {
    await provider.deleteProject(project.id);
  }
}

/**
 * cold-start: suspend compute, then time the first query that wakes it.
 * Only meaningful on providers with scale-to-zero (Neon).
 */
export async function coldStartOp(provider: Provider, runs: number): Promise<OpResult> {
  if (!provider.suspend) {
    throw new Error(`${provider.name} has no compute suspend API; cold-start does not apply`);
  }
  const project = await provider.createProject(uniqueName("cold", 0));
  try {
    return await timeOp({ op: "cold-start", provider: provider.name, runs, pauseMs: 3000 }, async () => {
      await provider.suspend!(project);
      await sleep(1000);
      const wakeMs = await queryOnce(project.connectionString);
      return { wakeQueryMs: wakeMs };
    });
  } finally {
    await provider.deleteProject(project.id);
  }
}

/**
 * branch: time creating a database branch until it answers SQL, then delete.
 * The parent project carries seed data so the branch copies something real.
 * withData controls whether the provider is asked to copy the data
 * (Supabase Pro exposes this as a flag; Neon branches always carry data).
 */
export async function branchOp(
  provider: Provider,
  runs: number,
  seedRows: number,
  { withData = false }: { withData?: boolean } = {},
): Promise<OpResult> {
  if (!provider.createBranch || !provider.deleteBranch) {
    throw new Error(`${provider.name} branching is not implemented (paid plan required?)`);
  }
  const project = await provider.createProject(uniqueName("brsrc", 0));
  await seed(project.connectionString, seedRows);
  const opName: OpName = withData ? "branch-with-data" : "branch";
  try {
    return await timeOp({ op: opName, provider: provider.name, runs, pauseMs: 3000 }, async (run) => {
      const t0 = performance.now();
      const branch = await provider.createBranch!(project, uniqueName("br", run), { withData });
      const totalMs = performance.now() - t0;
      try {
        return { branchQueryableMs: totalMs };
      } finally {
        await provider.deleteBranch!(project, branch.id);
      }
    });
  } finally {
    await provider.deleteProject(project.id);
  }
}

/**
 * resize: change compute size up then back down, alternating per run.
 * Measures (a) the management-API completion time and (b) the actual SQL
 * unavailability window, sampled by probing `select 1` every 250ms.
 */
export async function resizeOp(provider: Provider, runs: number): Promise<OpResult> {
  if (!provider.resizeCompute) {
    throw new Error(`${provider.name} compute resize is not implemented`);
  }
  const project = await provider.createProject(uniqueName("rsz", 0));
  try {
    return await timeOp({ op: "resize", provider: provider.name, runs, pauseMs: 8000 }, async (run) => {
      const direction = run % 2 === 0 ? "up" : "down";
      // probe in the background to measure the downtime window
      let firstFailure = 0;
      let lastFailure = 0;
      let probing = true;
      const probe = (async () => {
        while (probing) {
          const at = performance.now();
          try {
            await queryOnce(project.connectionString);
          } catch {
            if (!firstFailure) firstFailure = at;
            lastFailure = performance.now();
          }
          await sleep(250);
        }
      })();

      const t0 = performance.now();
      await provider.resizeCompute!(project, direction);
      const apiMs = performance.now() - t0;
      // keep probing briefly so we catch the tail of any restart
      await sleep(3000);
      probing = false;
      await probe;
      await firstSuccessfulQuery(project.connectionString);
      return {
        apiMs,
        downtimeMs: firstFailure ? Math.max(0, lastFailure - firstFailure) + 250 : 0,
      };
    });
  } finally {
    await provider.deleteProject(project.id);
  }
}

/**
 * replica: time creating a read replica until it answers SQL, then remove it.
 */
export async function replicaOp(provider: Provider, runs: number): Promise<OpResult> {
  if (!provider.createReadReplica || !provider.deleteReadReplica) {
    throw new Error(`${provider.name} read replicas are not implemented`);
  }
  // Supabase gates read replicas behind Small compute or larger
  const project = await provider.createProject(uniqueName("repl", 0), { computeSize: "small" });
  await seed(project.connectionString, 10_000);
  try {
    return await timeOp({ op: "replica", provider: provider.name, runs, pauseMs: 10_000 }, async () => {
      const t0 = performance.now();
      const replica = await provider.createReadReplica!(project);
      const totalMs = performance.now() - t0;
      try {
        return { replicaQueryableMs: totalMs };
      } finally {
        await provider.deleteReadReplica!(project, replica.id);
        await sleep(5000);
      }
    });
  } finally {
    await provider.deleteProject(project.id);
  }
}

/**
 * restore: point-in-time restore of the main branch to ~60s ago, timed until
 * the management API reports completion and SQL answers again.
 */
export async function restoreOp(provider: Provider, runs: number, seedRows: number): Promise<OpResult> {
  if (!provider.restore) {
    throw new Error(`${provider.name} restore is not implemented (or is a paid add-on we skip)`);
  }
  const project = await provider.createProject(uniqueName("rst", 0));
  await seed(project.connectionString, seedRows);
  // let the history accumulate past our restore target
  await sleep(90_000);
  try {
    return await timeOp({ op: "restore", provider: provider.name, runs, pauseMs: 15_000 }, async () => {
      const target = new Date(Date.now() - 60_000).toISOString();
      const t0 = performance.now();
      await provider.restore!(project, target);
      const apiMs = performance.now() - t0;
      const sqlMs = await firstSuccessfulQuery(project.connectionString);
      return { apiMs, sqlReadyMs: apiMs + sqlMs };
    });
  } finally {
    await provider.deleteProject(project.id);
  }
}

/**
 * concurrency: a burst of N simultaneous cold connections through the
 * TRANSACTION pooler, each doing connect + select 1 + disconnect. This is
 * the serverless stampede: N functions waking at once. Reported per wave:
 * total wall time, per-connection median/p95, and refusals (hitting the
 * pooler's client cap is a finding, not an error).
 */
export async function concurrencyOp(provider: Provider, runs: number, clients: number): Promise<OpResult> {
  const project = await provider.createProject(uniqueName("conc", 0));
  const connectionString = project.pooledConnectionString ?? project.connectionString;
  await queryOnce(connectionString);
  await queryOnce(connectionString);
  try {
    return await timeOp(
      { op: "concurrency", provider: provider.name, runs, pauseMs: 8000 },
      async () => {
        const outcomes = await Promise.allSettled(
          Array.from({ length: clients }, () => queryOnce(connectionString)),
        );
        const ok = outcomes
          .filter((o): o is PromiseFulfilledResult<number> => o.status === "fulfilled")
          .map((o) => o.value)
          .sort((a, b) => a - b);
        const refused = outcomes.length - ok.length;
        if (ok.length === 0) throw new Error(`all ${clients} connections failed`);
        return {
          clients,
          refused,
          connMedianMs: Math.round(percentile(ok, 50) * 10) / 10,
          connP95Ms: Math.round(percentile(ok, 95) * 10) / 10,
          connMaxMs: Math.round((ok[ok.length - 1] ?? 0) * 10) / 10,
        };
      },
    );
  } finally {
    await provider.deleteProject(project.id);
  }
}

async function seed(connectionString: string, rows: number): Promise<void> {
  const pg = await import("pg");
  const client = new pg.default.Client({ connectionString, ssl: tlsFor(connectionString) });
  await client.connect();
  try {
    await client.query(`create table if not exists bench_seed (id bigserial primary key, payload text)`);
    await client.query(
      `insert into bench_seed (payload) select md5(g::text) from generate_series(1, $1) g`,
      [rows],
    );
    await firstSuccessfulQuery(connectionString);
  } finally {
    await client.end();
  }
}
