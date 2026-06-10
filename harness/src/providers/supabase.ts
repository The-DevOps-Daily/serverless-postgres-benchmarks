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

  async createProject(name: string, options?: { computeSize?: "small" }): Promise<BenchProject> {
    assertBenchName(name);
    const dbPass = `Bench_${randomBytes(18).toString("base64url")}`;
    const created = await api<{ id: string; ref?: string }>("/projects", {
      method: "POST",
      body: JSON.stringify({
        name,
        organization_id: config.supabase.orgId(),
        region: config.supabase.region,
        db_pass: dbPass,
        ...(options?.computeSize ? { desired_instance_size: options.computeSize } : {}),
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

    // No sslmode in the URL: node-postgres lets URL sslmode override the
    // explicit ssl option, which would bypass our CA bundle. queryOnce
    // always dials TLS with verification via tlsFor().
    const pass = encodeURIComponent(dbPass);
    const base = `${encodeURIComponent(primary.db_user)}:${pass}@${primary.db_host}`;
    const project: BenchProject = {
      id: ref,
      name,
      connectionString: `postgresql://${base}:5432/${primary.db_name}`,
      pooledConnectionString: `postgresql://${base}:6543/${primary.db_name}`,
      directConnectionString: `postgresql://postgres:${pass}@db.${ref}.supabase.co:5432/${primary.db_name}`,
      dbPass,
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

  // Supabase has no compute suspend API; cold-start timing there means
  // pausing/unpausing a project, a different (and much slower) operation.

  /* ----- paid-plan (Pro) operations ----- */

  async createBranch(
    project: BenchProject,
    branchName: string,
    { withData = false }: { withData?: boolean } = {},
  ): Promise<BenchProject> {
    assertBenchName(branchName);
    const created = await api<{ id: string; project_ref: string }>(
      `/projects/${project.id}/branches`,
      {
        method: "POST",
        body: JSON.stringify({
          branch_name: branchName,
          desired_instance_size: "micro",
          with_data: withData,
          persistent: false,
        }),
      },
    );

    let detail: { status: string; db_host?: string; db_port?: number; db_user?: string; db_pass?: string } = { status: "" };
    await pollUntil(
      async () => {
        detail = await api(`/branches/${created.id}`);
        if (detail.status === "INIT_FAILED") throw new Error("Supabase branch INIT_FAILED");
        return detail.status === "ACTIVE_HEALTHY" || detail.status === "FUNCTIONS_DEPLOYED";
      },
      { timeoutMs: 600_000, intervalMs: 3000 },
    );

    // Branches are full projects with their own ref; reach them through
    // their own Supavisor config (direct hosts are IPv6-only).
    const pooler = await api<Array<{ db_user: string; db_host: string; db_port: number; db_name: string; connection_string: string }>>(
      `/projects/${created.project_ref}/config/database/pooler`,
    );
    const primary = pooler.find((p) => p.db_port === 6543) ?? pooler[0];
    if (!primary || !detail.db_pass) {
      throw new Error("Supabase branch: missing pooler config or db_pass");
    }
    const pass = encodeURIComponent(detail.db_pass);
    const branch: BenchProject = {
      id: created.id,
      name: branchName,
      connectionString: `postgresql://${encodeURIComponent(primary.db_user)}:${pass}@${primary.db_host}:5432/${primary.db_name}`,
    };
    await firstSuccessfulQuery(branch.connectionString, { timeoutMs: 240_000 });
    return branch;
  },

  async deleteBranch(_project: BenchProject, branchId: string): Promise<void> {
    await api(`/branches/${branchId}`, { method: "DELETE" });
  },

  async resizeCompute(project: BenchProject, direction: "up" | "down"): Promise<void> {
    if (direction === "up") {
      await api(`/projects/${project.id}/billing/addons`, {
        method: "PATCH",
        body: JSON.stringify({ addon_type: "compute_instance", addon_variant: "ci_small" }),
      });
    } else {
      await api(`/projects/${project.id}/billing/addons/ci_small`, { method: "DELETE" });
    }
    await pollUntil(
      async () => {
        const p = await api<{ status: string }>(`/projects/${project.id}`);
        return p.status === "ACTIVE_HEALTHY";
      },
      { timeoutMs: 600_000, intervalMs: 2000 },
    );
  },

  async createReadReplica(project: BenchProject): Promise<{ id: string; connectionString: string }> {
    await api(`/projects/${project.id}/read-replicas/setup`, {
      method: "POST",
      body: JSON.stringify({ read_replica_region: config.supabase.region }),
    });
    let replica: { identifier: string; connection_string: string } | undefined;
    await pollUntil(
      async () => {
        const pooler = await api<Array<{ identifier: string; database_type: string; connection_string: string }>>(
          `/projects/${project.id}/config/database/pooler`,
        );
        replica = pooler.find((p) => p.database_type === "READ_REPLICA") as typeof replica;
        return Boolean(replica);
      },
      { timeoutMs: 1_800_000, intervalMs: 10_000 },
    );
    if (!replica) throw new Error("Supabase replica never appeared");
    // connection_string from the API carries a [YOUR-PASSWORD] placeholder
    const connectionString = replica.connection_string.replace(
      "[YOUR-PASSWORD]",
      encodeURIComponent(project.dbPass ?? ""),
    );
    await firstSuccessfulQuery(connectionString, { timeoutMs: 300_000 });
    return { id: replica.identifier, connectionString };
  },

  async deleteReadReplica(project: BenchProject, replicaId: string): Promise<void> {
    await api(`/projects/${project.id}/read-replicas/remove`, {
      method: "POST",
      body: JSON.stringify({ database_identifier: replicaId }),
    });
  },
};
