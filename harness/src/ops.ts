import { BENCH_PREFIX } from "./config.js";
import { queryOnce, firstSuccessfulQuery, tlsFor } from "./providers/sql.js";
import { sleep, timeOp } from "./timing.js";
import type { OpResult, Provider } from "./types.js";

export type OpName =
  | "create-project"
  | "query-latency"
  | "pooled-query-latency"
  | "direct-query-latency"
  | "cold-start"
  | "branch";

export const ALL_OPS: OpName[] = [
  "create-project",
  "query-latency",
  "pooled-query-latency",
  "direct-query-latency",
  "cold-start",
  "branch",
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
 */
export async function branchOp(provider: Provider, runs: number, seedRows: number): Promise<OpResult> {
  if (!provider.createBranch || !provider.deleteBranch) {
    throw new Error(`${provider.name} branching is not implemented (paid plan required?)`);
  }
  const project = await provider.createProject(uniqueName("brsrc", 0));
  await seed(project.connectionString, seedRows);
  try {
    return await timeOp({ op: "branch", provider: provider.name, runs, pauseMs: 3000 }, async (run) => {
      const t0 = performance.now();
      const branch = await provider.createBranch!(project, uniqueName("br", run));
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
