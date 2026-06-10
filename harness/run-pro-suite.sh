#!/usr/bin/env bash
# Paid-tier suite: Neon (Launch-level ops, run on whatever paid plan the
# account has) vs Supabase Pro. Run AFTER upgrading the Supabase org to Pro
# and setting NEON_PLAN / SUPABASE_PLAN in .env to match reality.
# Slower ops use fewer runs; replicas and restores take minutes each.
set -uo pipefail
cd "$(dirname "$0")"

log() { echo "[pro-suite $(date -u +%H:%M:%S)] $*" | tee -a pro-suite.log; }

run() {
  local provider=$1 op=$2 runs=$3; shift 3
  log "start $provider $op x$runs"
  if npm run bench --silent -- --provider "$provider" --op "$op" --runs "$runs" "$@" >>pro-suite.log 2>&1; then
    log "done  $provider $op"
  else
    log "FAIL  $provider $op (continuing)"
  fi
}

log "=== paid-tier suite starting ==="

# Pooled connection concurrency: the serverless stampede at three burst sizes
run neon concurrency 5 --clients 50
run supabase concurrency 5 --clients 50
run neon concurrency 5 --clients 100
run supabase concurrency 5 --clients 100
run neon concurrency 5 --clients 200
run supabase concurrency 5 --clients 200

# Branching: the heart of article 2
run neon branch 10 --seed-rows 100000
run supabase branch 10 --seed-rows 100000
run supabase branch-with-data 10 --seed-rows 100000

# Compute resize (alternates up/down per run; even run count keeps state clean)
run neon resize 10
run supabase resize 10

# Read replicas (slow: replica clone takes minutes on supabase)
run neon replica 8
run supabase replica 5

# Point-in-time restore (Neon only; Supabase PITR is a $100/mo add-on we document instead)
run neon restore 8 --seed-rows 100000

log "sweeping leftovers"
npm run teardown --silent >>pro-suite.log 2>&1
log "=== suite complete ==="
