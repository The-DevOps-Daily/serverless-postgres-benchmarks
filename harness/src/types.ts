export type ProviderName = "neon" | "supabase";

export interface BenchProject {
  /** Provider-side identifier (Neon project id / Supabase project ref) */
  id: string;
  /** Always starts with "bench-" */
  name: string;
  /** Primary Postgres connection string reachable over IPv4 */
  connectionString: string;
  /** Pooled connection string, when the provider exposes one */
  pooledConnectionString?: string;
  /**
   * True direct-to-compute connection when it differs from connectionString
   * (Supabase free-plan direct hosts are IPv6-only, so connectionString
   * carries the session pooler there and this carries the direct host).
   */
  directConnectionString?: string;
  /** Database password, kept for providers whose secondary connection
   * strings come back with a placeholder (Supabase read replicas). */
  dbPass?: string;
}

export interface Provider {
  readonly name: ProviderName;
  /** Create a project and resolve when it accepts SQL connections. */
  createProject(name: string): Promise<BenchProject>;
  /** Delete a project by id. Must throw if the project is not bench-*. */
  deleteProject(id: string): Promise<void>;
  /** List bench-* projects (for teardown). */
  listBenchProjects(): Promise<Array<{ id: string; name: string }>>;
  /**
   * Force the project's compute to suspend, when supported.
   * Used by the cold-start op. Throws on providers without suspend.
   */
  suspend?(project: BenchProject): Promise<void>;
  /**
   * Create a database branch off the project's default branch, when
   * supported, resolving when the branch accepts SQL connections.
   */
  createBranch?(project: BenchProject, branchName: string, options?: { withData?: boolean }): Promise<BenchProject>;
  deleteBranch?(project: BenchProject, branchId: string): Promise<void>;
  /**
   * Change the project's compute size/limits and resolve when the change is
   * applied (per the management API). The op layer measures SQL downtime
   * around this separately.
   */
  resizeCompute?(project: BenchProject, direction: "up" | "down"): Promise<void>;
  /** Create a read replica, resolving when it answers SQL. Returns its id + connection string. */
  createReadReplica?(project: BenchProject): Promise<{ id: string; connectionString: string }>;
  deleteReadReplica?(project: BenchProject, replicaId: string): Promise<void>;
  /** Point-in-time restore of the project's main branch, resolving when complete. */
  restore?(project: BenchProject, timestamp: string): Promise<void>;
}

export interface Sample {
  /** Milliseconds */
  durationMs: number;
  /** Sub-phase timings, e.g. apiMs vs firstQueryMs for create-project */
  phases?: Record<string, number>;
  startedAt: string;
  error?: string;
}

export interface OpResult {
  op: string;
  provider: ProviderName;
  runs: number;
  failures: number;
  samples: Sample[];
  stats: {
    medianMs: number;
    p95Ms: number;
    minMs: number;
    maxMs: number;
    /** Stats per sub-phase, when the op reports phases */
    phases?: Record<string, { medianMs: number; p95Ms: number; minMs: number; maxMs: number }>;
  };
}

export interface ResultFile {
  schemaVersion: 1;
  generatedAt: string;
  environment: {
    provider: ProviderName;
    region: string;
    plan: string;
    clientLocation: string;
    nodeVersion: string;
    harnessVersion: string;
  };
  results: OpResult[];
}
