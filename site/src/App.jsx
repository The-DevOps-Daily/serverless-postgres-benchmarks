import { useEffect, useState } from "react";
import { embeddedResults, loadResults, okSamples, phaseSamples } from "./data.js";
import { BarChart, StripPlot, Legend } from "./charts.jsx";

const COLORS = { neon: "var(--neon)", supabase: "var(--supabase)" };

function Stat({ k, v, unit, d }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v}<small>{unit}</small></div>
      <div className="d">{d}</div>
    </div>
  );
}

function Card({ tag, runs, title, sub, wide, children }) {
  return (
    <section className="card" style={wide ? undefined : { marginTop: 0 }}>
      <div className="card-head">
        <span className="card-tag">{tag}</span>
        <span className="card-runs">{runs}</span>
      </div>
      <h2 className="card-title">{title}</h2>
      <p className="card-sub">{sub}</p>
      {children}
    </section>
  );
}

/** Slot for the ad unit; swap the placeholder for the Carbon script tag on deploy. */
function AdSlot() {
  return <div id="ad-slot" aria-hidden="true" />;
}

export default function App() {
  const [data, setData] = useState(embeddedResults);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!data) loadResults().then(setData, (e) => setError(String(e)));
  }, []);

  if (error) return <main className="wrap"><p>Failed to load results: {error}</p></main>;
  if (!data) return <main className="wrap" />;

  const get = (provider, op) => data.get(`${provider}/${op}`);
  const nq = get("neon", "query-latency");
  const sq = get("supabase", "query-latency");
  const nc = get("neon", "create-project");
  const sc = get("supabase", "create-project");
  const cold = get("neon", "cold-start");
  const branch = get("neon", "branch");
  const totalSamples = [...data.values()].reduce((n, r) => n + r.samples.length, 0);
  const anyResult = [...data.values()][0];

  const latencyRows = [
    { label: "Neon · pooler", r: get("neon", "pooled-query-latency"), color: COLORS.neon },
    { label: "Neon · direct", r: nq, color: COLORS.neon },
    { label: "Supabase · direct (IPv6)", r: get("supabase", "direct-query-latency"), color: COLORS.supabase },
    { label: "Supabase · session pooler", r: sq, color: COLORS.supabase },
    { label: "Supabase · transaction pooler", r: get("supabase", "pooled-query-latency"), color: COLORS.supabase },
  ].map((x) => ({ label: x.label, color: x.color, median: x.r.stats.medianMs, p95: x.r.stats.p95Ms }));

  return (
    <main className="wrap">
      <header className="hero">
        <p className="eyebrow">The DevOps Daily &middot; Serverless Postgres Benchmarks</p>
        <h1 className="title">Neon vs Supabase, measured<span className="accent">.</span></h1>
        <p className="lede">
          Every number below is the median of repeated runs against real projects in the same
          AWS region, timed from a client in the same metro. Raw samples ship in the repo;
          nothing here is quoted from a pricing page.
        </p>
        <div className="meta">
          <span>region <b>aws eu-central-1</b></span>
          <span>client <b>{anyResult.env.clientLocation}</b></span>
          <span>plans <b>free / free</b></span>
          <span>samples <b>{totalSamples}</b></span>
          <span>updated <b>{anyResult.generatedAt.slice(0, 10)}</b></span>
        </div>
      </header>

      <section className="stats">
        <Stat k="query latency" v={`~${Math.round((nq.stats.medianMs + sq.stats.medianMs) / 2)}`} unit="ms" d="median, both platforms. A tie." />
        <Stat k="create: neon" v={(nc.stats.medianMs / 1000).toFixed(1)} unit="s" d={`to first query, p95 ${(nc.stats.p95Ms / 1000).toFixed(1)}s`} />
        <Stat k="create: supabase" v={(sc.stats.medianMs / 1000).toFixed(1)} unit="s" d={`to first query, p95 ${(sc.stats.p95Ms / 1000).toFixed(1)}s`} />
        <Stat k="neon cold start" v={Math.round(cold.stats.phases.wakeQueryMs.medianMs)} unit="ms" d={`wake query, p95 ${(cold.stats.phases.wakeQueryMs.p95Ms / 1000).toFixed(2)}s`} />
        <Stat k="neon branch" v={(branch.stats.medianMs / 1000).toFixed(1)} unit="s" d="writable copy of 100k rows" />
      </section>

      <Card
        wide
        tag="select 1 · full connect cycle"
        runs={`${nq.runs} runs each`}
        title="Query latency"
        sub="Connect + TLS + auth + one query, cold connection each run. Bar is the median; tick is p95."
      >
        <BarChart rows={latencyRows} />
        <Legend items={[
          { color: "#34d399", label: "Neon" },
          { color: "#38bdf8", label: "Supabase" },
          { color: "#f59e0b", label: "p95" },
        ]} />
      </Card>

      <div className="grid-2">
        <Card
          tag="api call → first query"
          runs={`${nc.runs} runs each`}
          title="Project creation"
          sub="Time until a brand-new project answers SQL. Every dot is one run."
        >
          <StripPlot width={620} series={[
            { label: "Neon", samples: okSamples(nc).map((s) => s.durationMs), median: nc.stats.medianMs, color: COLORS.neon },
            { label: "Supabase", samples: okSamples(sc).map((s) => s.durationMs), median: sc.stats.medianMs, color: COLORS.supabase },
          ]} />
        </Card>

        <Card
          tag="scale-to-zero wake"
          runs={`${cold.runs} runs`}
          title="Neon cold start"
          sub="First query against a suspended compute. Docs say 300–500 ms typical."
        >
          <StripPlot width={620} unit="ms" series={[
            { label: "", samples: phaseSamples(cold, "wakeQueryMs"), median: cold.stats.phases.wakeQueryMs.medianMs, color: COLORS.neon },
          ]} />
        </Card>
      </div>

      <Card
        wide
        tag="copy-on-write · 100k-row parent"
        runs={`${branch.runs} runs`}
        title="Neon database branch, to queryable"
        sub="A writable branch carrying the parent's full dataset. Supabase branching requires a paid plan and starts without data; it will appear here once the paid-tier runs land."
      >
        <StripPlot series={[
          { label: "", samples: okSamples(branch).map((s) => s.durationMs), median: branch.stats.medianMs, color: COLORS.neon },
        ]} />
      </Card>

      <AdSlot />

      <footer className="foot">
        <p>
          Method: every operation timed across its full run count, raw samples committed,
          medians and p95 reported, resources torn down after every run. Free plans on both
          platforms. Read the harness and rerun it yourself:{" "}
          <a href="https://github.com/The-DevOps-Daily/serverless-postgres-benchmarks">The-DevOps-Daily/serverless-postgres-benchmarks</a>.
        </p>
      </footer>
    </main>
  );
}
