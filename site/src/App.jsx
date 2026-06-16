import { useEffect, useRef, useState } from "react";
import { costModelFrom, embeddedResults, loadResults, samplePoints, fmtMs } from "./data.js";
import { BarChart, StripPlot, HistoryChart, CdfChart, CostChart, Legend } from "./charts.jsx";

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

/** Carbon ad unit, loaded once at the very bottom of the page. */
function AdSlot() {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || document.getElementById("_carbonads_js")) return;
    const script = document.createElement("script");
    script.async = true;
    script.type = "text/javascript";
    script.src = "//cdn.carbonads.com/carbon.js?serve=CE7DL53M&placement=bobbyilievcom&format=cover";
    script.id = "_carbonads_js";
    ref.current.appendChild(script);
  }, []);
  return <div id="ad-slot" ref={ref} style={{ minHeight: 280 }} />;
}

export default function App() {
  const [data, setData] = useState(embeddedResults);
  const [error, setError] = useState(null);
  const [dimmed, setDimmed] = useState(new Set());
  useEffect(() => {
    if (!data) loadResults().then(setData, (e) => setError(String(e)));
  }, []);

  const toggleSeries = (name) =>
    setDimmed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

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
  const plans = [...new Set([...data.latest.values()].map((r) => r.env.plan).filter(Boolean))].join(" / ");

  const latencyRows = [
    { label: "Neon · pooler", r: get("neon", "pooled-query-latency"), color: COLORS.neon },
    { label: "Neon · direct", r: nq, color: COLORS.neon },
    { label: "Supabase · direct (IPv6)", r: get("supabase", "direct-query-latency"), color: COLORS.supabase },
    { label: "Supabase · session pooler", r: sq, color: COLORS.supabase },
    { label: "Supabase · transaction pooler", r: get("supabase", "pooled-query-latency"), color: COLORS.supabase },
  ].map((x) => ({
    label: x.label,
    series: x.label.startsWith("Neon") ? "Neon" : "Supabase",
    color: x.color,
    median: x.r.stats.medianMs,
    p95: x.r.stats.p95Ms,
    min: x.r.stats.minMs,
    max: x.r.stats.maxMs,
    runs: x.r.runs,
  }));

  const historySeries = [
    { name: "Neon", color: NEON_HEX, points: hist("neon", "query-latency").map((p) => ({ date: p.date, v: p.medianMs })) },
    { name: "Supabase", color: SUPA_HEX, points: hist("supabase", "query-latency").map((p) => ({ date: p.date, v: p.medianMs })) },
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
          <span>plans <b>{plans}</b></span>
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
        <p className="reads" style={{ marginTop: 16, fontSize: 14, color: "var(--text-faint)" }}>
          Read the write-ups:{" "}
          <a href="https://devops-daily.com/posts/neon-vs-supabase-free-tier-benchmarks">free tiers</a>
          {" · "}
          <a href="https://devops-daily.com/posts/neon-vs-supabase-operational-benchmarks">operational benchmarks</a>
          {" · "}
          <a href="https://devops-daily.com/posts/neon-vs-supabase-scaling-costs">scaling costs</a>
          {" · "}
          <a href="https://devops-daily.com/comparisons/neon-vs-supabase">full comparison</a>
        </p>
      </header>

      <section className="stats">
        <Stat k="query latency" v={`~${Math.round((nq.stats.medianMs + sq.stats.medianMs) / 2)}`} unit="ms" d="median, both platforms. A tie." />
        <Stat k="create: neon" v={(nc.stats.medianMs / 1000).toFixed(1)} unit="s" d={`to first query on ${nc.env.plan}, p95 ${(nc.stats.p95Ms / 1000).toFixed(1)}s`} />
        <Stat k="create: supabase" v={(sc.stats.medianMs / 1000).toFixed(1)} unit="s" d={`to first query on ${sc.env.plan}, p95 ${(sc.stats.p95Ms / 1000).toFixed(1)}s`} />
        <Stat k="neon cold start" v={Math.round(cold.stats.phases.wakeQueryMs.medianMs)} unit="ms" d={`wake query, p95 ${(cold.stats.phases.wakeQueryMs.p95Ms / 1000).toFixed(2)}s`} />
        <Stat k="neon branch" v={(branch.stats.medianMs / 1000).toFixed(1)} unit="s" d="writable copy of 100k rows" />
      </section>

      <Card
        tag="select 1 · full connect cycle"
        runs={`${nq.runs} runs each`}
        title="Query latency"
        sub="Connect + TLS + auth + one query, cold connection each run. Bar is the median, amber tick is p95, the faint line spans min to max. Hover any row for the full spread."
      >
        <BarChart rows={latencyRows} dimmed={dimmed} />
        <Legend
          onToggle={toggleSeries}
          dimmed={dimmed}
          items={[
            { color: NEON_HEX, label: "Neon" },
            { color: SUPA_HEX, label: "Supabase" },
            { color: "#f59e0b", label: "p95", toggle: false },
          ]}
        />
      </Card>

      <Card
        tag="every sample, ranked"
        runs={`${nq.runs} runs per path`}
        title="Latency percentiles"
        sub="The same raw samples as cumulative percentile curves: read p50 and p95 straight off the dashed lines, and how heavy each path's tail is. Hover a curve for its summary."
      >
        <CdfChart series={[
          { name: "Neon · pooler", provider: "Neon", color: NEON_HEX, samples: samplePoints(get("neon", "pooled-query-latency")).map((p) => p.v) },
          { name: "Neon · direct", provider: "Neon", color: NEON_HEX, dash: "6 5", samples: samplePoints(nq).map((p) => p.v) },
          { name: "Supabase · direct (IPv6)", provider: "Supabase", color: SUPA_HEX, samples: samplePoints(get("supabase", "direct-query-latency")).map((p) => p.v) },
          { name: "Supabase · session pooler", provider: "Supabase", color: SUPA_HEX, dash: "6 5", samples: samplePoints(sq).map((p) => p.v) },
          { name: "Supabase · transaction pooler", provider: "Supabase", color: SUPA_HEX, dash: "2 4", samples: samplePoints(get("supabase", "pooled-query-latency")).map((p) => p.v) },
        ]} dimmed={dimmed} />
        <Legend
          onToggle={toggleSeries}
          dimmed={dimmed}
          items={[
            { color: NEON_HEX, label: "Neon" },
            { color: SUPA_HEX, label: "Supabase" },
          ]}
        />
      </Card>

      <div className="grid-2">
        <Card
          tag="api call → first query"
          runs={`${nc.runs} runs each`}
          title="Project creation"
          sub="Time until a brand-new project answers SQL. Every dot is one run; hover for its exact time."
        >
          <StripPlot width={620} showDelta series={[
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

      {(() => {
        /* ---- paid-tier sections, rendered as their data lands ---- */
        const concLevels = [50, 100, 200]
          .map((level) => ({
            level,
            neon: get("neon", `concurrency-c${level}`),
            supabase: get("supabase", `concurrency-c${level}`),
          }))
          .filter((x) => x.neon || x.supabase);
        const nb = get("neon", "branch");
        const sb = get("supabase", "branch");
        const nrs = get("neon", "resize");
        const srs = get("supabase", "resize");
        const nrep = get("neon", "replica");
        const srep = get("supabase", "replica");
        const nrest = get("neon", "restore");
        const phaseMedian = (r, phase) => {
          const vals = samplePoints(r, phase).map((p) => p.v).sort((a, b) => a - b);
          return vals[Math.floor(vals.length / 2)] ?? 0;
        };
        const okOnly = (r) => r && r.runs - r.failures > 0;

        return (
          <>
            {(okOnly(nb) || okOnly(sb) || concLevels.length > 0) && (
              <header className="hero" style={{ marginTop: 56 }}>
                <p className="eyebrow">Launch / Pro tier &middot; paid plans</p>
                <h1 className="title" style={{ fontSize: "clamp(26px, 4vw, 38px)" }}>
                  The operational benchmarks<span className="accent">.</span>
                </h1>
                <p className="lede" style={{ fontSize: 15 }}>
                  Neon (Scale account, Launch-tier operations) vs Supabase Pro: the operations
                  that unlock when you pay. Same region, same client, same rules.
                </p>
              </header>
            )}

            {concLevels.length > 0 && (
              <Card
                tag="simultaneous cold connections · transaction pooler"
                runs={`${concLevels[0].neon?.runs ?? concLevels[0].supabase?.runs ?? 5} waves per level`}
                title="Connection stampede"
                sub="N clients connect at once, each running one query. Bar is the median wave wall-time; tick is the worst wave. Refusals would appear here; there were none."
              >
                <BarChart
                  rows={concLevels.flatMap(({ level, neon, supabase }) =>
                    [
                      neon && { label: `Neon · ${level} clients`, series: "Neon", color: COLORS.neon, median: neon.stats.medianMs, p95: neon.stats.maxMs, min: neon.stats.minMs, max: neon.stats.maxMs, runs: neon.runs },
                      supabase && { label: `Supabase · ${level} clients`, series: "Supabase", color: COLORS.supabase, median: supabase.stats.medianMs, p95: supabase.stats.maxMs, min: supabase.stats.minMs, max: supabase.stats.maxMs, runs: supabase.runs },
                    ].filter(Boolean),
                  )}
                  dimmed={dimmed}
                />
                <Legend onToggle={toggleSeries} dimmed={dimmed} items={[
                  { color: NEON_HEX, label: "Neon" },
                  { color: SUPA_HEX, label: "Supabase" },
                  { color: "#f59e0b", label: "worst wave", toggle: false },
                ]} />
              </Card>
            )}

            {okOnly(nb) && okOnly(sb) && (
              <Card
                tag="paid-tier branching"
                runs={`${nb.runs} + ${sb.runs} runs`}
                title="Branch, to queryable"
                sub="Neon branches arrive carrying the parent's 100k rows; Supabase branches copy schema and config only (their with-data API path requires pre-existing physical backups and refused every attempt on a fresh project). Every dot is one branch."
              >
                <StripPlot series={[
                  { label: "Neon (with data)", samples: samplePoints(nb), median: nb.stats.medianMs, color: COLORS.neon },
                  { label: "Supabase (schema only)", samples: samplePoints(sb), median: sb.stats.medianMs, color: COLORS.supabase },
                ]} />
              </Card>
            )}

            <div className="grid-2">
              {(okOnly(nrs) || okOnly(srs)) && (
                <Card
                  tag="compute resize"
                  runs={`${(nrs?.runs ?? 0) + (srs?.runs ?? 0)} runs`}
                  title="Resize: apply time vs outage"
                  sub="Changing compute size, alternating up and down. Apply is when the API says done; outage is how long SQL actually failed (probed every 250ms)."
                >
                  <BarChart width={620} rows={[
                    okOnly(nrs) && { label: "Neon · apply", series: "Neon", color: COLORS.neon, median: phaseMedian(nrs, "apiMs"), p95: nrs.stats.p95Ms, runs: nrs.runs },
                    okOnly(nrs) && { label: "Neon · SQL outage", series: "Neon", color: COLORS.neon, median: phaseMedian(nrs, "downtimeMs"), p95: phaseMedian(nrs, "downtimeMs"), runs: nrs.runs },
                    okOnly(srs) && { label: "Supabase · apply", series: "Supabase", color: COLORS.supabase, median: phaseMedian(srs, "apiMs"), p95: srs.stats.p95Ms, runs: srs.runs },
                    okOnly(srs) && { label: "Supabase · SQL outage", series: "Supabase", color: COLORS.supabase, median: phaseMedian(srs, "downtimeMs"), p95: phaseMedian(srs, "downtimeMs"), runs: srs.runs },
                  ].filter(Boolean)} dimmed={dimmed} />
                </Card>
              )}

              {(okOnly(nrep) || okOnly(srep)) && (
                <Card
                  tag="read replicas"
                  runs={`${(nrep?.runs ?? 0) + (srep?.runs ?? 0)} runs`}
                  title="Replica, to first query"
                  sub="Neon replicas share storage with the primary (compute-only); Supabase replicas clone the database (Small compute minimum). Every dot is one replica."
                >
                  <StripPlot width={620} series={[
                    okOnly(nrep) && { label: "Neon", samples: samplePoints(nrep), median: nrep.stats.medianMs, color: COLORS.neon },
                    okOnly(srep) && { label: "Supabase", samples: samplePoints(srep), median: srep.stats.medianMs, color: COLORS.supabase },
                  ].filter(Boolean)} />
                </Card>
              )}
            </div>

            {okOnly(nrest) && (
              <Card
                tag="point-in-time restore · 100k rows"
                runs={`${nrest.runs} runs`}
                title="Neon restore to 60 seconds ago"
                sub="Branch restore to a timestamp, timed until SQL answers on the restored state. Supabase PITR is a $100/month add-on with a 7-day minimum window; we document it rather than benchmark it."
              >
                <StripPlot series={[
                  { label: "", name: "restore", samples: samplePoints(nrest), median: nrest.stats.medianMs, color: COLORS.neon },
                ]} />
              </Card>
            )}
          </>
        );
      })()}

      {(() => {
        const SIZES = [100_000, 1_000_000, 5_000_000];
        const sizeLabels = ["100k rows", "1M rows", "5M rows"];
        const sweep = (provider, op) =>
          SIZES.map((n) => data.latest.get(`${provider}/${op}-r${n}`)?.stats.medianMs);
        const ops = [
          { op: "branch", title: "Branch creation vs database size", note: "Neon branches carry the data; Supabase Pro branches copy schema only, which is why both lines are flat for different reasons." },
          { op: "replica", title: "Read replica vs database size", note: "Provisioning dominates replica time at these sizes on both platforms; Supabase grows ~12% by 5M rows while Neon's storage-sharing replicas stay flat." },
        ].map((o) => ({
          ...o,
          series: [
            { name: "Neon", color: NEON_HEX, data: sweep("neon", o.op) },
            { name: "Supabase", color: SUPA_HEX, data: sweep("supabase", o.op) },
          ].filter((sr) => sr.data.every((v) => v != null)),
        })).filter((o) => o.series.length);
        if (!ops.length) return null;
        return (
          <Card
            tag="same op, growing data · 50x size span"
            runs="100k / 1M / 5M rows"
            title="Does it scale with database size?"
            sub="The same branch and replica operations, repeated as the seeded database grows 50x. Copy-on-write architectures should stay flat; physical clones should grow with data."
          >
            {ops.map((o) => (
              <div key={o.op} style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 14, margin: "10px 0 2px" }}>{o.title}</h3>
                <p className="card-sub" style={{ marginTop: 4 }}>{o.note}</p>
                <CostChart stages={sizeLabels} series={o.series} fmt={(v) => fmtMs(v)} />
              </div>
            ))}
            <Legend items={[
              { color: NEON_HEX, label: "Neon" },
              { color: SUPA_HEX, label: "Supabase" },
            ]} />
          </Card>
        );
      })()}

      {(() => {
        const cm = costModelFrom(data.files ?? []);
        if (!cm) return null;
        const stages = cm.stages.map((st) => st.label);
        return (
          <Card
            tag="list prices, verified june 2026 · open source model"
            runs={`${stages.length} growth stages`}
            title="What the same app costs as it grows"
            sub="One application priced through five growth stages on both platforms. Three regimes: scale-to-zero wins the quiet months, the flat fee wins the middle, and metered auth decides the end game. Assumptions are parameters; rerun the model with your own."
          >
            <CostChart stages={stages} series={[
              { name: "Neon (Launch)", color: NEON_HEX, data: cm.stages.map((st) => st.neonLaunch.totalUsd) },
              { name: "Supabase (Pro)", color: SUPA_HEX, data: cm.stages.map((st) => st.supabasePro.totalUsd) },
            ]} />
            <Legend items={[
              { color: NEON_HEX, label: "Neon (Launch)" },
              { color: SUPA_HEX, label: "Supabase (Pro)" },
            ]} />
          </Card>
        );
      })()}

      <section className="method">
        <div className="method-col">
          <h3>Findings you only get by running it</h3>
          <p>Supabase free-plan direct hosts are IPv6-only (IPv4 goes through Supavisor), the pooler cluster varies per project, and database TLS chains to Supabase's own CA.</p>
        </div>
        <div className="method-col">
          <h3>Resize is not one operation</h3>
          <p>Supabase compute changes restart the database (~39s of measured SQL outage) and are throttled for minutes between changes. Neon resizes applied with zero failed probes across forty cycles.</p>
        </div>
        <div className="method-col">
          <h3>Data branches have prerequisites</h3>
          <p>Supabase's with_data branch flag returned 406 "Failed to fetch latest physical backup" on every fresh-project attempt: data-included branches need pre-existing physical backups.</p>
        </div>
      </section>

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
        <HistoryChart series={historySeries} dimmed={dimmed} />
        <Legend
          onToggle={toggleSeries}
          dimmed={dimmed}
          items={[
            { color: NEON_HEX, label: "Neon" },
            { color: SUPA_HEX, label: "Supabase" },
          ]}
        />
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
          Resources are created fresh for every run and torn down afterwards. Harness, raw data,
          and methodology:{" "}
          <a href={REPO}>The-DevOps-Daily/serverless-postgres-benchmarks</a>.
        </p>
        <p style={{ marginTop: 8 }}>
          Full write-ups:{" "}
          <a href="https://devops-daily.com/posts/neon-vs-supabase-free-tier-benchmarks">free tiers</a>
          {" · "}
          <a href="https://devops-daily.com/posts/neon-vs-supabase-operational-benchmarks">operational benchmarks</a>
          {" · "}
          <a href="https://devops-daily.com/posts/neon-vs-supabase-scaling-costs">scaling costs</a>
        </p>
      </footer>
    </main>
  );
}
