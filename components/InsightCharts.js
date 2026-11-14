import { useMemo, useRef, useState } from 'react';

// Small, dependency-free SVG charts for /innsikt. One hue for magnitude
// (brand green), thin marks, rounded data-ends on the baseline, a recessive
// grid, and a hover tooltip on every chart.
const INK = '#14211d';
const MUTED = '#5b6662';
const GRID = '#e6ebe9';
const GREEN = '#0b5d4d';
const GREEN_SOFT = '#cfe5dd';

function niceMax(v) {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function useTip() {
  const [tip, setTip] = useState(null);
  const ref = useRef(null);
  const show = (e, content) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, content, w: box.width });
  };
  const node = tip ? (
    <div className="ins-tip" style={{ left: Math.min(Math.max(tip.x, 70), tip.w - 70), top: tip.y }}>{tip.content}</div>
  ) : null;
  return { ref, show, hide: () => setTip(null), node };
}

// Running total over time, with a crosshair that snaps to the nearest day.
export function CumulativeChart({ data }) {
  const W = 640; const H = 220; const L = 44; const R = 12; const T = 12; const B = 28;
  const tip = useTip();
  const [hover, setHover] = useState(null);
  const max = niceMax(Math.max(1, ...data.map((d) => d.total)));
  const n = data.length;
  const x = (i) => L + (n <= 1 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.total).toFixed(1)}`).join(' ');
  const area = n ? `${line} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : '';
  const ticks = [0, max / 2, max];
  const fmt = (i) => data[i]?.label || '';
  const onMove = (e) => {
    const svg = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - svg.left) / svg.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1))));
    setHover(i);
    tip.show(e, <><strong>{data[i].total.toLocaleString('nb-NO')}</strong> totalt<br />{fmt(i)}: +{data[i].count}</>);
  };
  return (
    <div className="ins-chart" ref={tip.ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Antall meldinger totalt over tid" onMouseMove={onMove} onMouseLeave={() => { setHover(null); tip.hide(); }}>
        <defs>
          <linearGradient id="insArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={GREEN} stopOpacity="0.22" />
            <stop offset="1" stopColor={GREEN} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={MUTED}>{Math.round(t).toLocaleString('nb-NO')}</text>
          </g>
        ))}
        {n > 0 && <path d={area} fill="url(#insArea)" />}
        {n > 0 && <path d={line} fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {n > 0 && <text x={x(0)} y={H - 8} fontSize="11" fill={MUTED}>{fmt(0)}</text>}
        {n > 1 && <text x={x(n - 1)} y={H - 8} fontSize="11" fill={MUTED} textAnchor="end">{fmt(n - 1)}</text>}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={y(0)} stroke={MUTED} strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(data[hover].total)} r="5" fill={GREEN} stroke="#fff" strokeWidth="2" />
          </g>
        )}
      </svg>
      {tip.node}
    </div>
  );
}

// Vertical bars (hours). labelEvery thins the axis labels on small screens.
export function ColumnChart({ values, labels, ariaLabel, tipLabel, labelEvery = 1, highlightLast = false }) {
  const W = 640; const H = 180; const L = 36; const R = 8; const T = 10; const B = 26;
  const tip = useTip();
  const max = niceMax(Math.max(1, ...values));
  const n = values.length;
  const slot = (W - L - R) / n;
  const bw = Math.max(2, slot - 2);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  return (
    <div className="ins-chart" ref={tip.ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onMouseLeave={tip.hide}>
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={MUTED}>{Math.round(t)}</text>
          </g>
        ))}
        {values.map((v, i) => {
          const x0 = L + i * slot + (slot - bw) / 2;
          const h = Math.max(0, y(0) - y(v));
          const r = Math.min(4, bw / 2, h);
          const fill = highlightLast && i === n - 1 ? GREEN : (v === Math.max(...values) ? GREEN : '#3f8f7b');
          return (
            <g key={i} onMouseMove={(e) => tip.show(e, <><strong>{v}</strong> {tipLabel}<br />{labels[i]}</>)}>
              <rect x={L + i * slot} y={T} width={slot} height={H - T - B} fill="transparent" />
              {h > 0 && <path d={`M${x0},${y(0)} V${y(0) - h + r} Q${x0},${y(0) - h} ${x0 + r},${y(0) - h} H${x0 + bw - r} Q${x0 + bw},${y(0) - h} ${x0 + bw},${y(0) - h + r} V${y(0)} Z`} fill={fill} />}
              {i % labelEvery === 0 && <text x={x0 + bw / 2} y={H - 8} fontSize="11" fill={MUTED} textAnchor="middle">{labels[i]}</text>}
            </g>
          );
        })}
      </svg>
      {tip.node}
    </div>
  );
}

// Ranked horizontal bars with the value at the end (top-N lists).
export function RankBars({ items, unit = 'meldinger', total = null }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ol className="ins-rank">
      {items.map((it) => (
        <li key={it.name} title={`${it.name}: ${it.count} ${unit}${total ? ` (${Math.round((it.count / total) * 100)} %)` : ''}`}>
          <span className="ins-rank__name">{it.name}</span>
          <span className="ins-rank__track"><span className="ins-rank__bar" style={{ width: `${Math.max(2, (it.count / max) * 100)}%` }} /></span>
          <span className="ins-rank__n">{it.count.toLocaleString('nb-NO')}{total ? <em>{Math.round((it.count / total) * 100)} %</em> : null}</span>
        </li>
      ))}
    </ol>
  );
}

// Two-part share bar (e.g. adults vs children), labelled directly.
export function SplitBar({ parts }) {
  const total = Math.max(1, parts.reduce((s, p) => s + p.count, 0));
  return (
    <div className="ins-split">
      <div className="ins-split__bar" role="img" aria-label={parts.map((p) => `${p.name} ${p.count}`).join(', ')}>
        {parts.map((p) => (
          <span key={p.name} style={{ width: `${(p.count / total) * 100}%`, background: p.color }} title={`${p.name}: ${p.count}`} />
        ))}
      </div>
      <div className="ins-split__legend">
        {parts.map((p) => (
          <span key={p.name}><i style={{ background: p.color }} />{p.name} <strong>{Math.round((p.count / total) * 100)} %</strong> <small>({p.count.toLocaleString('nb-NO')})</small></span>
        ))}
      </div>
    </div>
  );
}

export const INSIGHT_COLORS = { GREEN, GREEN_SOFT, INK, MUTED, BLUE: '#2a78d6', ORANGE: '#eb6834' };

export function useHourLabels(last48) {
  return useMemo(() => last48.map((h) => new Date(h.t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }).slice(0, 2)), [last48]);
}
