/**
 * Scaling-cost model: prices the same application profile on Neon and
 * Supabase as it grows. Pure functions over published list prices, so every
 * scenario is reproducible and arguable; measured benchmark data feeds the
 * workload assumptions (e.g. branch lifetimes), not the prices.
 */
import { HOURS_PER_MONTH, NEON_PRICES, SUPABASE_PRICES } from "./prices.js";

export interface WorkloadMonth {
  /** A label like "month 6" or "10k users" */
  label: string;
  /** Average compute demand in Neon CU (0.25 = smallest); informs both sides */
  avgComputeCu: number;
  /** Fraction of the month the database is actively serving (0..1).
   * Neon bills only active time (scale-to-zero); Supabase bills 24/7. */
  activeFraction: number;
  /** Database size in GB */
  dbSizeGb: number;
  /** Monthly active users hitting auth (Supabase MAU dimension) */
  mau: number;
  /** Preview/test branches created per month and their average lifetime hours */
  branchesPerMonth: number;
  branchLifetimeHours: number;
  /** Egress GB per month */
  egressGb: number;
}

export interface CostBreakdown {
  totalUsd: number;
  lines: Array<{ item: string; usd: number }>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function neonMonthlyCost(w: WorkloadMonth, plan: "launch" | "scale" = "launch"): CostBreakdown {
  const p = NEON_PRICES.plans[plan];
  const lines: Array<{ item: string; usd: number }> = [];

  const computeHours = HOURS_PER_MONTH * w.activeFraction * w.avgComputeCu;
  lines.push({ item: `compute (${w.avgComputeCu} CU avg, ${Math.round(w.activeFraction * 100)}% active)`, usd: round2(computeHours * p.computePerCuHourUsd) });
  lines.push({ item: `storage (${w.dbSizeGb} GB)`, usd: round2(w.dbSizeGb * p.storagePerGbMonthUsd) });

  // Branch compute: branches bill only while their endpoint is active.
  const branchCuHours = w.branchesPerMonth * w.branchLifetimeHours * 0.25;
  lines.push({ item: `${w.branchesPerMonth} preview branches (${w.branchLifetimeHours}h each)`, usd: round2(branchCuHours * p.computePerCuHourUsd) });

  // Auth (Neon Auth) and egress have no metered line items on these plans today.
  const totalUsd = round2(lines.reduce((s, l) => s + l.usd, 0));
  return { totalUsd, lines };
}

export function supabaseMonthlyCost(w: WorkloadMonth): CostBreakdown {
  const p = SUPABASE_PRICES;
  const lines: Array<{ item: string; usd: number }> = [];

  lines.push({ item: "Pro base (per org)", usd: p.pro.baseMonthlyUsd });

  // Compute: pick the smallest instance that covers avg demand; bills 24/7.
  const size = w.avgComputeCu <= 0.5 ? "micro" : w.avgComputeCu <= 1 ? "small" : w.avgComputeCu <= 2 ? "medium" : "large";
  const computeUsd = p.compute[size] * HOURS_PER_MONTH;
  const computeAfterCredits = Math.max(0, computeUsd - p.pro.includedComputeCreditsUsd);
  lines.push({ item: `compute (${size}, 24/7, after $${p.pro.includedComputeCreditsUsd} credits)`, usd: round2(computeAfterCredits) });

  const extraStorage = Math.max(0, w.dbSizeGb - p.pro.includedDbStorageGb);
  lines.push({ item: `storage beyond ${p.pro.includedDbStorageGb} GB included`, usd: round2(extraStorage * p.pro.extraDbStoragePerGbMonthUsd) });

  const extraMau = Math.max(0, w.mau - p.pro.includedMau);
  lines.push({ item: `MAU beyond ${p.pro.includedMau.toLocaleString()} included`, usd: round2(extraMau * p.pro.extraMauUsd) });

  const branchUsd = w.branchesPerMonth * w.branchLifetimeHours * p.branchComputePerHourUsd;
  lines.push({ item: `${w.branchesPerMonth} preview branches (${w.branchLifetimeHours}h each, no credits)`, usd: round2(branchUsd) });

  const extraEgress = Math.max(0, w.egressGb - p.pro.includedEgressGb);
  lines.push({ item: `egress beyond ${p.pro.includedEgressGb} GB included`, usd: round2(extraEgress * p.pro.extraEgressPerGbUsd) });

  const totalUsd = round2(lines.reduce((s, l) => s + l.usd, 0));
  return { totalUsd, lines };
}

/** The default growth story for article 3: a B2B SaaS from side project to scale. */
export const GROWTH_SCENARIO: WorkloadMonth[] = [
  { label: "launch month", avgComputeCu: 0.25, activeFraction: 0.2, dbSizeGb: 1, mau: 500, branchesPerMonth: 10, branchLifetimeHours: 4, egressGb: 5 },
  { label: "first customers", avgComputeCu: 0.25, activeFraction: 0.45, dbSizeGb: 5, mau: 5_000, branchesPerMonth: 30, branchLifetimeHours: 6, egressGb: 25 },
  { label: "product-market fit", avgComputeCu: 0.5, activeFraction: 0.75, dbSizeGb: 20, mau: 30_000, branchesPerMonth: 60, branchLifetimeHours: 8, egressGb: 100 },
  { label: "growth", avgComputeCu: 1, activeFraction: 0.95, dbSizeGb: 60, mau: 120_000, branchesPerMonth: 120, branchLifetimeHours: 8, egressGb: 400 },
  { label: "scale", avgComputeCu: 2, activeFraction: 1, dbSizeGb: 200, mau: 400_000, branchesPerMonth: 200, branchLifetimeHours: 10, egressGb: 1_500 },
] as const as WorkloadMonth[];
