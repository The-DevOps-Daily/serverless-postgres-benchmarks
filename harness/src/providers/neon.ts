import { BENCH_PREFIX, assertBenchName, config } from "../config.js";
import { pollUntil } from "../timing.js";
import type { BenchProject, Provider } from "../types.js";
import { firstSuccessfulQuery } from "./sql.js";

interface NeonEndpoint {
  id: string;
  current_state: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.neon.apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.neon.apiKey()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Neon API ${init?.method ?? "GET"} ${path} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export const neon: Provider = {
  name: "neon",

  async createProject(name: string): Promise<BenchProject> {
    assertBenchName(name);
    const created = await api<{
      project: { id: string };
      connection_uris: Array<{ connection_uri: string; connection_parameters?: { pooler_host?: string } }>;
    }>("/projects", {
      method: "POST",
      body: JSON.stringify({
        project: { name, region_id: config.neon.region },
      }),
    });

    const connectionString = created.connection_uris[0]?.connection_uri;
    if (!connectionString) {
      throw new Error("Neon create returned no connection URI");
    }
    const project: BenchProject = {
      id: created.project.id,
      name,
      connectionString,
      pooledConnectionString: toPooled(connectionString),
    };
    await firstSuccessfulQuery(project.connectionString);
    return project;
  },

  async deleteProject(id: string): Promise<void> {
    const { project } = await api<{ project: { name: string } }>(`/projects/${id}`);
    assertBenchName(project.name);
    await api(`/projects/${id}`, { method: "DELETE" });
  },

  async listBenchProjects() {
    const { projects } = await api<{ projects: Array<{ id: string; name: string }> }>(
      "/projects?limit=400",
    );
    return projects.filter((p) => p.name.startsWith(BENCH_PREFIX));
  },

  async suspend(project: BenchProject): Promise<void> {
    const { endpoints } = await api<{ endpoints: NeonEndpoint[] }>(
      `/projects/${project.id}/endpoints`,
    );
    for (const endpoint of endpoints) {
      await api(`/projects/${project.id}/endpoints/${endpoint.id}/suspend`, { method: "POST" });
    }
    await pollUntil(async () => {
      const { endpoints: current } = await api<{ endpoints: NeonEndpoint[] }>(
        `/projects/${project.id}/endpoints`,
      );
      return current.every((e) => e.current_state === "idle");
    });
  },

  async createBranch(project: BenchProject, branchName: string): Promise<BenchProject> {
    assertBenchName(branchName);
    const created = await api<{
      branch: { id: string };
      connection_uris?: Array<{ connection_uri: string }>;
    }>(`/projects/${project.id}/branches`, {
      method: "POST",
      body: JSON.stringify({
        branch: { name: branchName },
        endpoints: [{ type: "read_write" }],
      }),
    });
    const connectionString = created.connection_uris?.[0]?.connection_uri;
    if (!connectionString) {
      throw new Error("Neon branch create returned no connection URI");
    }
    const branch: BenchProject = { id: created.branch.id, name: branchName, connectionString };
    await firstSuccessfulQuery(connectionString);
    return branch;
  },

  async deleteBranch(project: BenchProject, branchId: string): Promise<void> {
    await api(`/projects/${project.id}/branches/${branchId}`, { method: "DELETE" });
  },
};

/** Neon pooled host is the endpoint host with a -pooler suffix. */
function toPooled(uri: string): string {
  return uri.replace(/@([^.]+)\./, "@$1-pooler.");
}
