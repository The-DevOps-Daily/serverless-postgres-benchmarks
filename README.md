# Serverless Postgres Benchmarks

Reproducible operational benchmarks for managed Postgres platforms, currently covering [Neon](https://neon.com) and [Supabase](https://supabase.com).

Vendor pages tell you what a platform can do. This repo measures how long it actually takes: creating a project, branching a database, recovering from a cold start, running queries through a pooler. Every number published from this harness links back to a dated raw-results file in this repo so anyone can check the math or rerun it.

## How it works

The harness is a small TypeScript runner that drives each platform's management API plus a regular `pg` connection:

1. Each operation (create project, branch, cold start, query latency) is run **N times** (default 20).
2. Every sample is recorded raw. Reports use **median and p95**, never single runs or averages of two.
3. Results are written to `results/` as dated JSON with full environment metadata: region, plan/tier, API versions, client location, timestamp.
4. Everything the harness creates is namespaced `bench-*` and torn down afterwards. `npm run teardown` removes any stragglers.

## Methodology rules

- Both platforms run in the same region (AWS eu-central-1 / Frankfurt).
- Latency-sensitive operations are measured from a client in the same metro (a Frankfurt VM), never from a laptop over home internet. Management-API timings (project create, branch, delete) are client-location-insensitive and may run from anywhere.
- Plans and tiers in use are documented in every results file. Free-tier runs and paid-tier runs are never mixed in one dataset.
- Raw samples are committed, not just summaries.
- Test resources are deleted after every run so nothing keeps billing.

## Layout

```
harness/    TypeScript runner, provider adapters, operations
results/    dated raw results (JSON) with environment metadata
site/       static dashboard rendering the results (GitHub Pages)
```

## Running it

```bash
cd harness
npm install
cp .env.example .env   # fill in your own API keys
npm run bench -- --provider neon --op create-project --runs 20
npm run bench -- --provider supabase --op query-latency --runs 50
npm run teardown       # delete every bench-* resource on both platforms
```

You need your own Neon API key and Supabase personal access token. The harness only ever creates and deletes resources whose names start with `bench-`; it refuses to touch anything else.

## Results

See `results/` for raw data. Published write-ups based on this harness are listed in [RESULTS.md](results/README.md) as they land.
