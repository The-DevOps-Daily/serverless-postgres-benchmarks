#!/usr/bin/env bash
# Free-plan benchmark suite. Latency-sensitive ops first (cheap, fast),
# management-API ops after, slowest last. Logs to suite.log, results land
# in ../results as dated JSON. Safe to rerun; teardown sweeps stragglers.
set -uo pipefail
cd "$(dirname "$0")"

log() { echo "[suite $(date -u +%H:%M:%S)] $*" | tee -a suite.log; }

run() {
  local provider=$1 op=$2 runs=$3; shift 3
  log "start $provider $op x$runs"
  if npm run bench --silent -- --provider "$provider" --op "$op" --runs "$runs" "$@" >>suite.log 2>&1; then
    log "done  $provider $op"
  else
    log "FAIL  $provider $op (continuing)"
  fi
}

log "=== free-plan suite starting ==="

# Latency ops (run from the same-region client)
run neon query-latency 50
run neon pooled-query-latency 50
run supabase query-latency 50
run supabase pooled-query-latency 50
run supabase direct-query-latency 50   # IPv6-only host; needs an IPv6 client
run neon cold-start 20

# Management-API ops
run neon create-project 20
run neon branch 10 --seed-rows 100000
run supabase create-project 20

log "sweeping leftovers"
npm run teardown --silent >>suite.log 2>&1
log "=== suite complete ==="
