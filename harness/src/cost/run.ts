/**
 * Prices the growth scenario on both platforms and writes the result JSON
 * (same results/ convention the dashboards read).
 *
 *   npm run costs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GROWTH_SCENARIO, neonMonthlyCost, supabaseMonthlyCost } from "./model.js";

const stages = GROWTH_SCENARIO.map((w) => ({
  label: w.label,
  workload: w,
  neonLaunch: neonMonthlyCost(w, "launch"),
  neonScale: neonMonthlyCost(w, "scale"),
  supabasePro: supabaseMonthlyCost(w),
}));

const out = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  kind: "cost-model",
  note: "List prices June 2026; see src/cost/prices.ts for sources and VERIFY flags.",
  stages,
};

mkdirSync(join("..", "results"), { recursive: true });
const path = join("..", "results", `${out.generatedAt.slice(0, 10)}-cost-model.json`);
writeFileSync(path, JSON.stringify(out, null, 2));

console.log("stage                | neon launch | neon scale | supabase pro");
for (const s of stages) {
  console.log(
    `${s.label.padEnd(20)} | $${String(s.neonLaunch.totalUsd).padStart(9)} | $${String(s.neonScale.totalUsd).padStart(8)} | $${String(s.supabasePro.totalUsd).padStart(10)}`,
  );
}
console.log(`written ${path}`);
