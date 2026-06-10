export type ProviderName = "neon" | "supabase";

export interface BenchProject {
  /** Provider-side identifier (Neon project id / Supabase project ref) */
  id: string;
  /** Always starts with "bench-" */
  name: string;
  /** Direct (non-pooled) Postgres connection string */
  connectionString: string;
  /** Pooled connection string, when the provider exposes one */
  pooledConnectionString?: string;
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
  createBranch?(project: BenchProject, branchName: string): Promise<BenchProject>;
  deleteBranch?(project: BenchProject, branchId: string): Promise<void>;
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
