import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

export const config = {
  neon: {
    apiKey: () => required("NEON_API_KEY"),
    region: process.env.NEON_REGION ?? "aws-eu-central-1",
    plan: process.env.NEON_PLAN ?? "free",
    apiBase: "https://console.neon.tech/api/v2",
  },
  supabase: {
    accessToken: () => required("SUPABASE_ACCESS_TOKEN"),
    orgId: () => required("SUPABASE_ORG_ID"),
    region: process.env.SUPABASE_REGION ?? "eu-central-1",
    plan: process.env.SUPABASE_PLAN ?? "free",
    apiBase: "https://api.supabase.com/v1",
  },
  clientLocation: process.env.CLIENT_LOCATION ?? "unknown",
};

/** Every resource the harness creates carries this prefix; teardown and
 * deleteProject refuse to operate on anything else. */
export const BENCH_PREFIX = "bench-";

export function assertBenchName(name: string): void {
  if (!name.startsWith(BENCH_PREFIX)) {
    throw new Error(
      `Refusing to operate on "${name}": harness only touches resources prefixed "${BENCH_PREFIX}"`,
    );
  }
}
