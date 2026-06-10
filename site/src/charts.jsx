import { fmtMs } from "./data.js";

const AMBER = "var(--amber)";

/** Horizontal median bars with a p95 tick. rows: {label, color, median, p95} */
export function BarChart({ rows, width = 980 }) {
  const rowH = 44, labelW = 235, pad = 8, valueW = 150;
  const height = rows.length * rowH + pad * 2;
  const max = Math.max(...rows.map((r) => r.p95)) * 1.08;
  const scale = (v) => (v / max) * (width - labelW - valueW);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%">
      {rows.map((r, i) => {
        const cy = pad + i * rowH + rowH / 2;
        return (
          <g key={r.label}>
            <text x={0} y={cy + 4} fill="var(--text-dim)" fontSize={12.5}>{r.label}</text>
            <line x1={labelW} y1={cy} x2={width - valueW} y2={cy} stroke="rgba(255,255,255,0.06)" />
            <rect
              x={labelW} y={cy - 7} width={Math.max(2, scale(r.median))} height={14} rx={4}
              fill={r.color} fillOpacity={0.85}
            />
            <line
              x1={labelW + scale(r.p95)} y1={cy - 11} x2={labelW + scale(r.p95)} y2={cy + 11}
              stroke={AMBER} strokeWidth={2}
            />
            <text x={width - valueW + 14} y={cy + 4} fill="var(--text)" fontSize={12.5}>{fmtMs(r.median)}</text>
            <text x={width - valueW + 76} y={cy + 4} fill="var(--text-faint)" fontSize={11.5}>p95 {fmtMs(r.p95)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Strip plot: a dot per sample, amber median line. series: {label, color, samples, median} */
export function StripPlot({ series, width = 980, unit = "s" }) {
  const rowH = 64, labelH = 26, padX = 8;
  const height = series.length * rowH + labelH;
  const all = series.flatMap((s) => s.samples);
  const min = Math.min(...all) * 0.94;
  const max = Math.max(...all) * 1.04;
  const scale = (v) => padX + ((v - min) / (max - min)) * (width - padX * 2);
  const ticks = [...Array(6).keys()].map((t) => min + ((max - min) * t) / 5);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={scale(v)} y1={0} x2={scale(v)} y2={height - labelH} stroke="rgba(255,255,255,0.04)" />
          <text x={scale(v)} y={height - 8} fill="var(--text-faint)" fontSize={11} textAnchor="middle">
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
            {s.samples.map((v, j) => (
              <circle key={j} cx={scale(v)} cy={cy + 8} r={5} fill={s.color} fillOpacity={0.55} />
            ))}
            <line x1={mx} y1={cy - 8} x2={mx} y2={cy + 24} stroke={AMBER} strokeWidth={2.5} />
            <text x={mx + 9} y={cy - 1} fill={AMBER} fontSize={12}>{fmtMs(s.median)}</text>
          </g>
        );
      })}
    </svg>
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
