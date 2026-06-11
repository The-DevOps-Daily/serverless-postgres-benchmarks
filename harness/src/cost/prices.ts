/**
 * Published list prices, June 2026, used by the scaling-cost model.
 * Every number carries its source; VERIFY-flagged values should be
 * re-checked against the pricing pages before publication.
 */

export const NEON_PRICES = {
  // https://neon.com/pricing (verified 2026-06-10 via research pass)
  plans: {
    launch: {
      monthlyMinimumUsd: 0,
      computePerCuHourUsd: 0.106,
      storagePerGbMonthUsd: 0.35,
      restoreWindowDays: 7,
    },
    scale: {
      monthlyMinimumUsd: 0,
      computePerCuHourUsd: 0.222,
      storagePerGbMonthUsd: 0.35,
      restoreWindowDays: 30,
    },
  },
  // Branches share storage copy-on-write; only diverged pages bill.
  // A branch's compute bills only while its endpoint is active.
  extraBranchPerMonthUsd: 1.5, // prorated hourly; beyond 10 included on Launch, 25 on Scale (verified 2026-06-11)
  restoreHistoryPerGbMonthUsd: 0.2,
} as const;

export const SUPABASE_PRICES = {
  // https://supabase.com/pricing (verified 2026-06-10 via research pass)
  pro: {
    baseMonthlyUsd: 25, // per organization
    includedComputeCreditsUsd: 10,
    includedDbStorageGb: 8,
    extraDbStoragePerGbMonthUsd: 0.125, // verified 2026-06-11
    includedMau: 100_000,
    extraMauUsd: 0.00325,
    includedEgressGb: 250,
    extraEgressPerGbUsd: 0.09, // verified 2026-06-11
  },
  compute: {
    // hourly, billed while the project exists (no scale-to-zero)
    // verified 2026-06-11 against supabase.com/docs/guides/platform/compute-and-disk
    micro: 0.01344, // ~$10/mo
    small: 0.0206, // ~$15/mo
    medium: 0.0822, // ~$60/mo
    large: 0.1517, // ~$110/mo
  },
  branchComputePerHourUsd: 0.01344, // micro-equivalent, no compute credits apply
  pitrAddonPerMonthUsd: 100, // per 7-day window
  readReplica: {
    // replica runs the same compute size as the primary, disk billed at 1.25x
    diskMultiplier: 1.25,
  },
} as const;

export const HOURS_PER_MONTH = 730;
