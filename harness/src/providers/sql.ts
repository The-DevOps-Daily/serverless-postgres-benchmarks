import { readFileSync } from "node:fs";
import pg from "pg";
import { pollUntil } from "../timing.js";

/**
 * TLS is verified. Neon endpoints present publicly-trusted certs; Supabase
 * direct connections present certs signed by Supabase's own CA, so download
 * it from the dashboard (Database settings -> SSL) and point SUPABASE_DB_CA
 * at the file.
 */
export function tlsFor(connectionString: string): pg.ClientConfig["ssl"] {
  const caPath = process.env.SUPABASE_DB_CA;
  if (caPath && /supabase\.(co|com)/.test(connectionString)) {
    return { ca: readFileSync(caPath, "utf8") };
  }
  return true;
}

/** Run one `select 1` and close. Throws on failure. */
export async function queryOnce(connectionString: string): Promise<number> {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 15_000,
    ssl: tlsFor(connectionString),
  });
  // Server restarts (e.g. compute resize) emit async 'error' events on idle
  // clients; without a handler Node treats that as fatal and kills the run.
  client.on("error", () => {});
  const t0 = performance.now();
  try {
    await client.connect();
    await client.query("select 1");
    return performance.now() - t0;
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Retry `select 1` until it succeeds (newly provisioned databases briefly
 * refuse connections even after the management API reports ready).
 * Returns elapsed ms until the first success.
 */
export async function firstSuccessfulQuery(
  connectionString: string,
  { timeoutMs = 120_000 }: { timeoutMs?: number } = {},
): Promise<number> {
  let lastError = "no attempt made";
  try {
    return await pollUntil(
      async () => {
        try {
          await queryOnce(connectionString);
          return true;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          return false;
        }
      },
      { timeoutMs, intervalMs: 1500 },
    );
  } catch {
    throw new Error(`No successful query within ${timeoutMs}ms; last error: ${lastError}`);
  }
}
