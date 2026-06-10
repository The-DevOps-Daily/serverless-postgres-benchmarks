import { randomBytes } from "node:crypto";
import { BENCH_PREFIX, assertBenchName, config } from "../config.js";
import { pollUntil } from "../timing.js";
import type { BenchProject, Provider } from "../types.js";
import { firstSuccessfulQuery } from "./sql.js";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.supabase.apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.supabase.accessToken()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Supabase API ${init?.method ?? "GET"} ${path} -> ${res.status}: ${body.slice(0, 300)}`,
    );
  }
  // DELETE returns 200 with body; some endpoints return 204
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const supabase: Provider = {
  name: "supabase",

  async createProject(name: string): Promise<BenchProject> {
    assertBenchName(name);
    const dbPass = `Bench_${randomBytes(18).toString("base64url")}`;
    const created = await api<{ id: string; ref?: string }>("/projects", {
      method: "POST",
      body: JSON.stringify({
        name,
        organization_id: config.supabase.orgId(),
        region: config.supabase.region,
        db_pass: dbPass,
      }),
    });
    const ref = created.ref ?? created.id;

    await pollUntil(
      async () => {
        const project = await api<{ status: string }>(`/projects/${ref}`);
        return project.status === "ACTIVE_HEALTHY";
      },
      { timeoutMs: 600_000, intervalMs: 2000 },
    );

    // Free-plan direct connections (db.<ref>.supabase.co) resolve to IPv6
    // only; IPv4 clients reach Postgres through Supavisor. Session mode
    // (port 5432) stands in for a direct connection, transaction mode
    // (port 6543) is the serverless path. The pooler cluster (aws-0, aws-1,
    // ...) varies per project, so read it from the API instead of guessing.
    const pooler = await api<
      Array<{ db_user: string; db_host: string; db_port: number; db_name: string }>
    >(`/projects/${ref}/config/database/pooler`);
    const primary = pooler.find((p) => p.db_port === 6543) ?? pooler[0];
    if (!primary) throw new Error(`Supabase ${ref}: no pooler config returned`);

    const pass = encodeURIComponent(dbPass);
    const base = `${encodeURIComponent(primary.db_user)}:${pass}@${primary.db_host}`;
    const project: BenchProject = {
      id: ref,
      name,
      connectionString: `postgresql://${base}:5432/${primary.db_name}?sslmode=require`,
      pooledConnectionString: `postgresql://${base}:6543/${primary.db_name}?sslmode=require`,
    };
    await firstSuccessfulQuery(project.connectionString, { timeoutMs: 240_000 });
    return project;
  },

  async deleteProject(id: string): Promise<void> {
    const project = await api<{ name: string }>(`/projects/${id}`);
    assertBenchName(project.name);
    await api(`/projects/${id}`, { method: "DELETE" });
  },

  async listBenchProjects() {
    const projects = await api<Array<{ id: string; ref?: string; name: string }>>("/projects");
    return projects
      .filter((p) => p.name.startsWith(BENCH_PREFIX))
      .map((p) => ({ id: p.ref ?? p.id, name: p.name }));
  },

  // Supabase has no compute suspend API on the free plan; cold-start timing
  // there means pausing/unpausing a project, which is a different (and much
  // slower) operation benchmarked separately. Branching requires a paid plan
  // and is implemented when the paid-window runs happen.
};
