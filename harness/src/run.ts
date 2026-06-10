import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";
import { ALL_OPS, branchOp, coldStartOp, createProjectOp, queryLatencyOp, type OpName } from "./ops.js";
import { neon } from "./providers/neon.js";
import { supabase } from "./providers/supabase.js";
import type { OpResult, Provider, ProviderName, ResultFile } from "./types.js";

interface Args {
  provider: ProviderName;
  op: OpName;
  runs: number;
  seedRows: number;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { runs: 20, seedRows: 100_000 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--provider":
        if (value !== "neon" && value !== "supabase") throw new Error(`Unknown provider: ${value}`);
        args.provider = value;
        i++;
        break;
      case "--op":
        if (!ALL_OPS.includes(value as OpName)) {
          throw new Error(`Unknown op: ${value}. Available: ${ALL_OPS.join(", ")}`);
        }
        args.op = value as OpName;
        i++;
        break;
      case "--runs":
        args.runs = Number(value);
        i++;
        break;
      case "--seed-rows":
        args.seedRows = Number(value);
        i++;
        break;
      case "--out":
        args.out = value;
        i++;
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }
  if (!args.provider || !args.op) {
    console.error(
      "Usage: npm run bench -- --provider <neon|supabase> --op <op> [--runs 20] [--seed-rows 100000] [--out file.json]",
    );
    console.error(`Ops: ${ALL_OPS.join(", ")}`);
    process.exit(1);
  }
  return args as Args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider: Provider = args.provider === "neon" ? neon : supabase;
  const providerConfig = args.provider === "neon" ? config.neon : config.supabase;

  console.log(
    `[bench] ${args.provider} ${args.op} x${args.runs} in ${providerConfig.region} (plan: ${providerConfig.plan}, client: ${config.clientLocation})`,
  );

  let result: OpResult;
  switch (args.op) {
    case "create-project":
      result = await createProjectOp(provider, args.runs);
      break;
    case "query-latency":
      result = await queryLatencyOp(provider, args.runs);
      break;
    case "pooled-query-latency":
      result = await queryLatencyOp(provider, args.runs, { pooled: true });
      break;
    case "cold-start":
      result = await coldStartOp(provider, args.runs);
      break;
    case "branch":
      result = await branchOp(provider, args.runs, args.seedRows);
      break;
  }

  const file: ResultFile = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      provider: args.provider,
      region: providerConfig.region,
      plan: providerConfig.plan,
      clientLocation: config.clientLocation,
      nodeVersion: process.version,
      harnessVersion: "0.1.0",
    },
    results: [result],
  };

  const stamp = file.generatedAt.slice(0, 10);
  const outPath =
    args.out ?? join("..", "results", `${stamp}-${args.provider}-${args.op}.json`);
  mkdirSync(join("..", "results"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(file, null, 2));

  console.log(
    `[bench] done: median ${result.stats.medianMs}ms, p95 ${result.stats.p95Ms}ms, ` +
      `min ${result.stats.minMs}ms, max ${result.stats.maxMs}ms, failures ${result.failures}/${result.runs}`,
  );
  console.log(`[bench] raw samples written to ${outPath}`);
}

main().catch((error) => {
  console.error("[bench] failed:", error.message ?? error);
  process.exit(1);
});
