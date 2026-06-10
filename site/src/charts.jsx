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

/** Nice axis ticks: 1/2/5 progression, 4-6 ticks from 0 to >= max. */
function niceTicks(max) {
  const rough = max / 5;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => max / s <= 6) ?? 10 * pow;
  const ticks = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return ticks;
}

/* ------------------------------------------------------------------ */
/* Horizontal median bars: ms axis, min-max whisker, p95 tick          */
/* rows: {label, series, color, median, p95, min, max, runs}           */
/* ------------------------------------------------------------------ */

export function BarChart({ rows, width = 980, unit = "ms", dimmed = new Set() }) {
  const tooltip = useTooltip();
  const rowH = 44, labelW = 235, padTop = 22, padBottom = 6, valueW = 150;
  const height = rows.length * rowH + padTop + padBottom;
  const domainMax = Math.max(...rows.map((r) => r.max ?? r.p95)) * 1.05;
  const plotW = width - labelW - valueW;
  const scale = (v) => (v / domainMax) * plotW;
  const ticks = niceTicks(domainMax);

  return (
    <ChartShell tooltip={tooltip}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%">
        {/* axis gridlines */}
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={labelW + scale(v)} y1={padTop - 6} x2={labelW + scale(v)} y2={height - padBottom}
              stroke="rgba(255,255,255,0.05)"
            />
            <text x={labelW + scale(v)} y={12} fontSize={10.5} textAnchor="middle" fill="var(--text-faint)">
              {fmtMs(v)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cy = padTop + i * rowH + rowH / 2;
          const dim = dimmed.has(r.series);
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
              opacity={dim ? 0.18 : 1}
              style={{ transition: "opacity 0.25s" }}
              onMouseMove={(e) => !dim && tooltip.show(e, lines)}
              onMouseLeave={tooltip.hide}
            >
              <rect x={0} y={cy - rowH / 2} width={width} height={rowH} fill="transparent" />
              <text x={0} y={cy + 4} fill="var(--text-dim)" fontSize={12.5}>{r.label}</text>
              {/* min-max whisker */}
              {r.min != null && (
                <line
                  className="fade-in" style={{ animationDelay: `${250 + i * 70}ms` }}
                  x1={labelW + scale(r.min)} y1={cy} x2={labelW + scale(r.max)} y2={cy}
                  stroke="rgba(255,255,255,0.18)" strokeWidth={2} strokeLinecap="round"
                />
              )}
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
/* Strip plot with beeswarm jitter so stacked dots stay visible        */
/* series: {label, name?, color, samples: [{v, at?}], median}          */
/* ------------------------------------------------------------------ */

function beeswarmOffsets(xs, dotR) {
  const minGap = dotR * 2.1;
  const placed = [];
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const offsets = new Array(xs.length).fill(0);
  for (const { x, i } of order) {
    let level = 0;
    for (let step = 0; step < 8; step++) {
      level = step === 0 ? 0 : (step % 2 ? Math.ceil(step / 2) : -step / 2);
      const collides = placed.some((p) => p.level === level && Math.abs(p.x - x) < minGap);
      if (!collides) break;
    }
    placed.push({ x, level });
    offsets[i] = level * (dotR * 2 + 1);
  }
  return offsets;
}

export function StripPlot({ series, width = 980, unit = "s", showDelta = false }) {
  const tooltip = useTooltip();
  const dotR = 5;
  const rowH = 76, labelH = 26, padX = 8;
  const height = series.length * rowH + labelH;
  const all = series.flatMap((s) => s.samples.map((p) => p.v));
  const min = Math.min(...all) * 0.94;
  const max = Math.max(...all) * 1.04;
  const scale = (v) => padX + ((v - min) / (max - min)) * (width - padX * 2);
  const ticks = [...Array(6).keys()].map((t) => min + ((max - min) * t) / 5);
  const fmt = (v) => (unit === "s" ? `${(v / 1000).toFixed(1)}s` : fmtMs(v));

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
              {fmt(v)}
            </text>
          </g>
        ))}
        {series.map((s, i) => {
          const cy = i * rowH + rowH / 2 + 6;
          const offsets = beeswarmOffsets(s.samples.map((p) => scale(p.v)), dotR);
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
                  <circle cx={scale(p.v)} cy={cy + offsets[j]} r={11} fill="transparent" />
                  <circle
                    className="dot-in"
                    style={{ animationDelay: `${j * 18}ms` }}
                    cx={scale(p.v)} cy={cy + offsets[j]} r={dotR} fill={s.color} fillOpacity={0.6}
                  />
                </g>
              ))}
              <line className="fade-in" style={{ animationDelay: "350ms" }}
                x1={mx} y1={cy - 18} x2={mx} y2={cy + 18} stroke={AMBER} strokeWidth={2.5} />
              <text className="fade-in" style={{ animationDelay: "350ms" }}
                x={mx + 9} y={cy - 12} fill={AMBER} fontSize={12}>{fmtMs(s.median)}</text>
            </g>
          );
        })}
        {/* median gap annotation between exactly two series */}
        {showDelta && series.length === 2 && (() => {
          const x1 = scale(series[0].median);
          const x2 = scale(series[1].median);
          const y = rowH - 4;
          const delta = Math.abs(series[1].median - series[0].median);
          return (
            <g className="fade-in" style={{ animationDelay: "550ms" }}>
              <line x1={x1} y1={y} x2={x2} y2={y} stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} strokeDasharray="3 4" />
              <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} />
              <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} />
              <text x={(x1 + x2) / 2} y={y - 7} fontSize={11.5} textAnchor="middle" fill="var(--text-dim)">
                +{fmtMs(delta)}
              </text>
            </g>
          );
        })()}
      </svg>
    </ChartShell>
  );
}

/* ------------------------------------------------------------------ */
/* History: median over run dates, gradient-filled line per provider   */
/* series: {name, color, gradientId, points: [{date, v}]}              */
/* ------------------------------------------------------------------ */

export function HistoryChart({ series, width = 980, dimmed = new Set() }) {
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
  const baseY = height - padB;

  return (
    <ChartShell tooltip={tooltip}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%">
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`hist-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
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
        {series.map((s, si) => {
          const pts = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
          const dim = dimmed.has(s.name);
          const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
          const area = pts.length > 1
            ? `${line} L${x(pts[pts.length - 1].date).toFixed(1)},${baseY} L${x(pts[0].date).toFixed(1)},${baseY} Z`
            : null;
          return (
            <g key={s.name} opacity={dim ? 0.12 : 1} style={{ transition: "opacity 0.25s" }}>
              {area && <path d={area} fill={`url(#hist-grad-${si})`} />}
              {pts.length > 1 && (
                <path d={line} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" />
              )}
              {pts.map((p) => (
                <g key={p.date}
                  onMouseMove={(e) => !dim && tooltip.show(e, [s.name, fmtMs(p.v), p.date])}
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

/* ------------------------------------------------------------------ */
/* Legend: clickable when onToggle is provided                         */
/* ------------------------------------------------------------------ */

export function Legend({ items, onToggle, dimmed = new Set() }) {
  return (
    <div className="legend">
      {items.map((i) => {
        const toggleable = onToggle && i.toggle !== false;
        return (
          <span
            key={i.label}
            className={`${toggleable ? "legend-toggle" : ""} ${dimmed.has(i.label) ? "legend-off" : ""}`}
            onClick={toggleable ? () => onToggle(i.label) : undefined}
            role={toggleable ? "button" : undefined}
            tabIndex={toggleable ? 0 : undefined}
            onKeyDown={toggleable ? (e) => (e.key === "Enter" || e.key === " ") && onToggle(i.label) : undefined}
          >
            <span className="sw" style={{ background: i.color }} />
            {i.label}
          </span>
        );
      })}
      {onToggle && <span className="legend-hint">click to isolate</span>}
    </div>
  );
}
