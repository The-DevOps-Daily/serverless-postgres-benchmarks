# Results

Raw benchmark output, one JSON file per provider + operation + date:

```
2026-06-12-neon-create-project.json
2026-06-12-supabase-create-project.json
```

Every file records full environment metadata (region, plan, client location, node version) next to every raw sample, so a published median is always one click from the data behind it.

## Published write-ups

- [Neon vs Supabase free tier benchmarks](https://devops-daily.com/posts/neon-vs-supabase-free-tier-benchmarks) - latency, project creation, cold starts, branching, networking fine print
- [Operational benchmarks](https://devops-daily.com/posts/neon-vs-supabase-operational-benchmarks) - resize downtime, branching, replicas, restore, connection stampedes, size sweep
- [Scaling costs](https://devops-daily.com/posts/neon-vs-supabase-scaling-costs) - one app priced through five growth stages, open source cost model
