import { useEffect, useState } from "react";
import { embeddedResults, loadResults, samplePoints, fmtMs } from "./data.js";
import { BarChart, StripPlot, HistoryChart, Legend } from "./charts.jsx";

const COLORS = { neon: "var(--neon)", supabase: "var(--supabase)" };
const NEON_HEX = "#34d399";
const SUPA_HEX = "#38bdf8";
const REPO = "https://github.com/The-DevOps-Daily/serverless-postgres-benchmarks";

function Stat({ k, v, unit, d }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v}<small>{unit}</small></div>
      <div className="d">{d}</div>
    </div>
  );
}

function Card({ tag, runs, title, sub, children }) {
  return (
    <section className="card">
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

  const get = (provider, op) => data.latest.get(`${provider}/${op}`);
  const hist = (provider, op) => data.history.get(`${provider}/${op}`) ?? [];
  const nq = get("neon", "query-latency");
  const sq = get("supabase", "query-latency");
  const nc = get("neon", "create-project");
  const sc = get("supabase", "create-project");
  const cold = get("neon", "cold-start");
  const branch = get("neon", "branch");
  const totalSamples = [...data.latest.values()].reduce((n, r) => n + r.samples.length, 0);
  const runDates = [...new Set([...data.history.values()].flatMap((e) => e.map((p) => p.date)))].sort();
  const anyResult = [...data.latest.values()][0];

  const latencyRows = [
    { label: "Neon · pooler", r: get("neon", "pooled-query-latency"), color: COLORS.neon },
    { label: "Neon · direct", r: nq, color: COLORS.neon },
    { label: "Supabase · direct (IPv6)", r: get("supabase", "direct-query-latency"), color: COLORS.supabase },
    { label: "Supabase · session pooler", r: sq, color: COLORS.supabase },
    { label: "Supabase · transaction pooler", r: get("supabase", "pooled-query-latency"), color: COLORS.supabase },
  ].map((x) => ({
    label: x.label,
    color: x.color,
    median: x.r.stats.medianMs,
    p95: x.r.stats.p95Ms,
    min: x.r.stats.minMs,
    max: x.r.stats.maxMs,
    runs: x.r.runs,
  }));

  const historySeries = [
    { name: "Neon query latency", color: NEON_HEX, points: hist("neon", "query-latency").map((p) => ({ date: p.date, v: p.medianMs })) },
    { name: "Supabase query latency", color: SUPA_HEX, points: hist("supabase", "query-latency").map((p) => ({ date: p.date, v: p.medianMs })) },
  ].filter((s) => s.points.length > 0);

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
          <span>sessions <b>{runDates.length}</b></span>
          <span>updated <b>{anyResult.generatedAt.slice(0, 10)}</b></span>
        </div>
        <div className="verdicts">
          <span className="chip"><i style={{ background: "#9b9ba3" }} />latency: a tie</span>
          <span className="chip"><i style={{ background: NEON_HEX }} />create: neon by {((sc.stats.medianMs - nc.stats.medianMs) / 1000).toFixed(1)}s</span>
          <span className="chip"><i style={{ background: NEON_HEX }} />cold start: {fmtMs(cold.stats.phases.wakeQueryMs.medianMs)} wake</span>
          <span className="chip"><i style={{ background: NEON_HEX }} />branching: neon only on free</span>
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
        tag="select 1 · full connect cycle"
        runs={`${nq.runs} runs each`}
        title="Query latency"
        sub="Connect + TLS + auth + one query, cold connection each run. Bar is the median; tick is p95. Hover any row for the full spread."
      >
        <BarChart rows={latencyRows} />
        <Legend items={[
          { color: NEON_HEX, label: "Neon" },
          { color: SUPA_HEX, label: "Supabase" },
          { color: "#f59e0b", label: "p95" },
        ]} />
      </Card>

      <div className="grid-2">
        <Card
          tag="api call → first query"
          runs={`${nc.runs} runs each`}
          title="Project creation"
          sub="Time until a brand-new project answers SQL. Every dot is one run; hover for its exact time."
        >
          <StripPlot width={620} series={[
            { label: "Neon", samples: samplePoints(nc), median: nc.stats.medianMs, color: COLORS.neon },
            { label: "Supabase", samples: samplePoints(sc), median: sc.stats.medianMs, color: COLORS.supabase },
          ]} />
        </Card>

        <Card
          tag="scale-to-zero wake"
          runs={`${cold.runs} runs`}
          title="Neon cold start"
          sub="First query against a suspended compute. Docs say 300–500 ms typical."
        >
          <StripPlot width={620} unit="ms" series={[
            { label: "", name: "wake query", samples: samplePoints(cold, "wakeQueryMs"), median: cold.stats.phases.wakeQueryMs.medianMs, color: COLORS.neon },
          ]} />
        </Card>
      </div>

      <Card
        tag="copy-on-write · 100k-row parent"
        runs={`${branch.runs} runs`}
        title="Neon database branch, to queryable"
        sub="A writable branch carrying the parent's full dataset. Supabase branching requires a paid plan and starts without data; it will appear here once the paid-tier runs land."
      >
        <StripPlot series={[
          { label: "", name: "branch", samples: samplePoints(branch), median: branch.stats.medianMs, color: COLORS.neon },
        ]} />
      </Card>

      <Card
        tag="median over time"
        runs={`${runDates.length} session${runDates.length === 1 ? "" : "s"}`}
        title="Run history"
        sub={
          runDates.length < 2
            ? "Every benchmark session adds a point here. The next scheduled session lands tomorrow morning; over time this becomes a latency tracker for both platforms."
            : "Median query latency per benchmark session. A flat line is the expected (and boring) result; divergence is news."
        }
      >
        <HistoryChart series={historySeries} />
        <Legend items={[
          { color: NEON_HEX, label: "Neon" },
          { color: SUPA_HEX, label: "Supabase" },
        ]} />
      </Card>

      <section className="method">
        <div className="method-col">
          <h3>Same region, same metro</h3>
          <p>Both platforms run in aws eu-central-1; the timing client is a VM in Frankfurt, 1 to 2 ms from each. Network distance never puts a thumb on the scale.</p>
        </div>
        <div className="method-col">
          <h3>Raw samples, not averages</h3>
          <p>Every operation runs 10 to 50 times. Charts show medians and p95; every individual sample is committed to the repo and visible on hover.</p>
        </div>
        <div className="method-col">
          <h3>Reproducible by you</h3>
          <p>The harness is ~600 lines of TypeScript. Bring your own API keys and <a href={REPO}>rerun the whole thing</a>; if your numbers disagree, open an issue.</p>
        </div>
      </section>

      <AdSlot />

      <footer className="foot">
        <p>
          Free plans on both platforms. Resources are created fresh for every run and torn
          down afterwards. Harness, raw data, and methodology:{" "}
          <a href={REPO}>The-DevOps-Daily/serverless-postgres-benchmarks</a>.
        </p>
      </footer>
    </main>
  );
}
