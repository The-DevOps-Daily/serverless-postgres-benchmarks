import { useState, useRef, useCallback } from "react";
import { fmtMs } from "./data.js";

const AMBER = "var(--amber)";

/* ------------------------------------------------------------------ */
/* Tooltip: one absolutely-positioned card per chart, follows pointer  */
/* ------------------------------------------------------------------ */

function useTooltip() {
  const [tip, setTip] = useState(null);
  const containerRef = useRef(null);

  const show = useCallback((event, lines) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setTip({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      containerWidth: bounds.width,
      lines,
    });
  }, []);

  const hide = useCallback(() => setTip(null), []);
  return { tip, show, hide, containerRef };
}

function Tooltip({ tip }) {
  if (!tip) return null;
  const flip = tip.x > 0.72 * tip.containerWidth;
  return (
    <div
      className="chart-tip"
      style={{
        left: tip.x,
        top: tip.y,
        transform: `translate(${flip ? "calc(-100% - 14px)" : "14px"}, -50%)`,
      }}
    >
      {tip.lines.map((line, i) => (
        <div key={i} className={i === 0 ? "tip-title" : "tip-line"}>{line}</div>
      ))}
    </div>
  );
}

function ChartShell({ tooltip, children }) {
  return (
    <div className="chart-shell" ref={tooltip.containerRef}>
      {children}
      <Tooltip tip={tooltip.tip} />
    </div>
  );
}

function timeOf(iso) {
  return iso ? iso.slice(11, 19) + " UTC" : null;
}

/* ------------------------------------------------------------------ */
/* Horizontal median bars with a p95 tick                              */
/* rows: {label, color, median, p95, runs}                             */
/* ------------------------------------------------------------------ */

export function BarChart({ rows, width = 980 }) {
  const tooltip = useTooltip();
  const rowH = 44, labelW = 235, pad = 8, valueW = 150;
  const height = rows.length * rowH + pad * 2;
  const max = Math.max(...rows.map((r) => r.p95)) * 1.08;
  const scale = (v) => (v / max) * (width - labelW - valueW);

  return (
    <ChartShell tooltip={tooltip}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%">
        {rows.map((r, i) => {
          const cy = pad + i * rowH + rowH / 2;
          const lines = [
            r.label,
            `median ${fmtMs(r.median)}`,
            `p95 ${fmtMs(r.p95)}`,
            r.min != null ? `range ${fmtMs(r.min)} to ${fmtMs(r.max)}` : null,
            r.runs ? `${r.runs} runs` : null,
          ].filter(Boolean);
          return (
            <g
              key={r.label}
              onMouseMove={(e) => tooltip.show(e, lines)}
              onMouseLeave={tooltip.hide}
            >
              {/* invisible hover strip covering the whole row */}
              <rect x={0} y={cy - rowH / 2} width={width} height={rowH} fill="transparent" />
              <text x={0} y={cy + 4} fill="var(--text-dim)" fontSize={12.5}>{r.label}</text>
              <line x1={labelW} y1={cy} x2={width - valueW} y2={cy} stroke="rgba(255,255,255,0.06)" />
              <rect
                className="bar-grow"
                style={{ animationDelay: `${i * 70}ms` }}
                x={labelW} y={cy - 7} width={Math.max(2, scale(r.median))} height={14} rx={4}
                fill={r.color} fillOpacity={0.85}
              />
              <line
                className="fade-in"
                style={{ animationDelay: `${300 + i * 70}ms` }}
                x1={labelW + scale(r.p95)} y1={cy - 11} x2={labelW + scale(r.p95)} y2={cy + 11}
                stroke={AMBER} strokeWidth={2}
              />
              <text x={width - valueW + 14} y={cy + 4} fill="var(--text)" fontSize={12.5}>{fmtMs(r.median)}</text>
              <text x={width - valueW + 76} y={cy + 4} fill="var(--text-faint)" fontSize={11.5}>p95 {fmtMs(r.p95)}</text>
            </g>
          );
        })}
      </svg>
    </ChartShell>
  );
}

/* ------------------------------------------------------------------ */
/* Strip plot: a dot per sample, amber median line                     */
/* series: {label, color, samples: [{v, at?}], median}                 */
/* ------------------------------------------------------------------ */

export function StripPlot({ series, width = 980, unit = "s" }) {
  const tooltip = useTooltip();
  const rowH = 64, labelH = 26, padX = 8;
  const height = series.length * rowH + labelH;
  const all = series.flatMap((s) => s.samples.map((p) => p.v));
  const min = Math.min(...all) * 0.94;
  const max = Math.max(...all) * 1.04;
  const scale = (v) => padX + ((v - min) / (max - min)) * (width - padX * 2);
  const ticks = [...Array(6).keys()].map((t) => min + ((max - min) * t) / 5);

  return (
    <ChartShell tooltip={tooltip}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%">
        {ticks.map((v, ti) => (
          <g key={v}>
            <line x1={scale(v)} y1={0} x2={scale(v)} y2={height - labelH} stroke="rgba(255,255,255,0.04)" />
            <text
              x={scale(v)} y={height - 8} fontSize={11}
              textAnchor={ti === 0 ? "start" : ti === ticks.length - 1 ? "end" : "middle"}
              fill="var(--text-faint)"
            >
              {unit === "s" ? `${(v / 1000).toFixed(1)}s` : fmtMs(v)}
            </text>
          </g>
        ))}
        {series.map((s, i) => {
          const cy = i * rowH + rowH / 2;
          const mx = scale(s.median);
          return (
            <g key={i}>
              {s.label && (
                <text x={padX} y={i * rowH + 16} fill="var(--text-dim)" fontSize={12.5}>{s.label}</text>
              )}
              {s.samples.map((p, j) => (
                <g key={j}
                  onMouseMove={(e) =>
                    tooltip.show(e, [
                      s.label || s.name || "run",
                      fmtMs(p.v),
                      p.at ? `run ${j + 1} · ${timeOf(p.at)}` : `run ${j + 1}`,
                    ])
                  }
                  onMouseLeave={tooltip.hide}
                >
                  <circle cx={scale(p.v)} cy={cy + 8} r={11} fill="transparent" />
                  <circle
                    className="dot-in"
                    style={{ animationDelay: `${j * 18}ms` }}
                    cx={scale(p.v)} cy={cy + 8} r={5} fill={s.color} fillOpacity={0.55}
                  />
                </g>
              ))}
              <line className="fade-in" style={{ animationDelay: "350ms" }}
                x1={mx} y1={cy - 8} x2={mx} y2={cy + 24} stroke={AMBER} strokeWidth={2.5} />
              <text className="fade-in" style={{ animationDelay: "350ms" }}
                x={mx + 9} y={cy - 1} fill={AMBER} fontSize={12}>{fmtMs(s.median)}</text>
            </g>
          );
        })}
      </svg>
    </ChartShell>
  );
}

/* ------------------------------------------------------------------ */
/* History: median over run dates, one line per provider               */
/* series: {name, color, points: [{date, v}]}                          */
/* ------------------------------------------------------------------ */

export function HistoryChart({ series, width = 980, unit = "ms" }) {
  const tooltip = useTooltip();
  const height = 240;
  const padL = 56, padR = 18, padT = 14, padB = 32;
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const all = series.flatMap((s) => s.points.map((p) => p.v));
  const maxV = Math.max(...all) * 1.15;
  const minV = Math.min(...all) * 0.85;
  const x = (date) =>
    dates.length === 1
      ? (padL + width - padR) / 2
      : padL + (dates.indexOf(date) / (dates.length - 1)) * (width - padL - padR);
  const y = (v) => padT + (1 - (v - minV) / (maxV - minV)) * (height - padT - padB);
  const yTicks = [...Array(3).keys()].map((t) => minV + ((maxV - minV) * (t + 1)) / 3);

  return (
    <ChartShell tooltip={tooltip}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%">
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={padL} y1={y(v)} x2={width - padR} y2={y(v)} stroke="rgba(255,255,255,0.05)" />
            <text x={padL - 8} y={y(v) + 4} fontSize={11} textAnchor="end" fill="var(--text-faint)">
              {fmtMs(v)}
            </text>
          </g>
        ))}
        {dates.map((d) => (
          <text key={d} x={x(d)} y={height - 8} fontSize={11} textAnchor="middle" fill="var(--text-faint)">
            {d.slice(5)}
          </text>
        ))}
        {series.map((s) => {
          const pts = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
          return (
            <g key={s.name}>
              {pts.length > 1 && (
                <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" />
              )}
              {pts.map((p) => (
                <g key={p.date}
                  onMouseMove={(e) => tooltip.show(e, [s.name, fmtMs(p.v), p.date])}
                  onMouseLeave={tooltip.hide}
                >
                  <circle cx={x(p.date)} cy={y(p.v)} r={11} fill="transparent" />
                  <circle cx={x(p.date)} cy={y(p.v)} r={4.5} fill={s.color} />
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </ChartShell>
  );
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <span className="sw" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
