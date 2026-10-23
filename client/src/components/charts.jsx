// Data-viz components for the Demo tab. Plain SVG, sized to their container.
// Palettes (validated against the #171B22 card surface): an ordinal champagne ramp for benefit tiers
// (brightest = biggest boost) and a warm/cool pair for features that lower/raise the income estimate.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Table2, BarChart3 } from 'lucide-react';
import { money, pct } from '../lib/format.js';

export const TIER_COLORS = { cornerstone: '#EACFA0', foundation: '#D6B178', keystone: '#B8935C', pillar: '#94754A', summit: '#6E5838' };
export const LOWER = '#B98236';
export const RAISE = '#5A8FD0';
const GRID = '#262B33';
const AXIS = '#3A404A';
const SURFACE = '#171B22';

export function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }} role="status">
      {tip.title && <div className="viz-tip-title">{tip.title}</div>}
      {tip.rows?.map(([k, v]) => <div key={k} className="viz-tip-row"><span>{k}</span><span className="num">{v}</span></div>)}
    </div>
  );
}

/** Card frame with title, legend and a chart/table toggle (every chart has a table twin). */
export function ChartFrame({ label, title, subtitle, legend, table, children }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div className="card pad viz-frame">
      <div className="row between gap-3" style={{ alignItems: 'flex-start' }}>
        <div>
          {label && <div className="label gold">{label}</div>}
          {title && <h3 className="card-title mt-1">{title}</h3>}
          {subtitle && <p className="small muted mt-1">{subtitle}</p>}
        </div>
        {table && (
          <button className="btn btn-ghost btn-sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
            {asTable ? <BarChart3 /> : <Table2 />}{asTable ? 'Chart' : 'Table'}
          </button>
        )}
      </div>
      {legend && !asTable && <div className="viz-legend mt-3">{legend}</div>}
      <div className="mt-4">{asTable ? <DataTable {...table} /> : children}</div>
    </div>
  );
}

export function DataTable({ columns, rows }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={j ? 'num' : ''}>{v}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export const Swatch = ({ color, label, round }) => (
  <span className="viz-key"><span className="viz-swatch" style={{ background: color, borderRadius: round ? '50%' : 3 }} />{label}</span>
);

export function TierLegend({ tiers }) {
  return <>{tiers.map((t) => <Swatch key={t.key} color={TIER_COLORS[t.key]} label={`${t.name} ${t.multiplier}×`} />)}</>;
}

// Bar path with a 4px rounded data end and a square baseline end.
function hbar(x0, x1, y, h, r = 4) {
  const left = Math.min(x0, x1), right = Math.max(x0, x1), w = right - left;
  if (w < 0.5) return '';
  const rr = Math.min(r, w, h / 2);
  if (x1 >= x0) return `M${left},${y}H${right - rr}Q${right},${y} ${right},${y + rr}V${y + h - rr}Q${right},${y + h} ${right - rr},${y + h}H${left}Z`;
  return `M${right},${y}H${left + rr}Q${left},${y} ${left},${y + rr}V${y + h - rr}Q${left},${y + h} ${left + rr},${y + h}H${right}Z`;
}
function vbar(x, w, y0, y1, r = 4) {
  const h = y0 - y1;
  if (h < 0.5) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y0}V${y1 + rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 + rr}V${y0}Z`;
}

const niceMax = (v) => {
  const steps = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
  return steps.find((s) => s >= v) || Math.ceil(v / 50) * 50;
};

/** Diverging bars: how much each feature moves the income estimate. */
export function FeatureEffects({ features, formatValue }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState(null);
  const rows = features.filter((f) => f.used);
  const narrow = width < 560;
  const labelW = narrow ? 128 : 230;
  const rowH = 32, barH = 12, top = 8, axisH = 26;
  const plotW = Math.max(120, width - labelW - 56);
  const max = niceMax(Math.max(...rows.map((f) => Math.abs(f.effectPct)), 1));
  const x = (v) => labelW + 28 + ((v + max) / (2 * max)) * plotW;
  const height = top + rows.length * rowH + axisH;
  const ticks = [-max, -max / 2, 0, max / 2, max];
  return (
    <div ref={ref} className="viz-box" onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Feature effects on the income estimate">
          {ticks.map((t) => <line key={t} x1={x(t)} x2={x(t)} y1={top} y2={height - axisH} stroke={t === 0 ? AXIS : GRID} strokeWidth="1" />)}
          {ticks.map((t) => <text key={`l${t}`} x={x(t)} y={height - 8} textAnchor="middle" className="viz-tick">{t > 0 ? '+' : ''}{t}%</text>)}
          {rows.map((f, i) => {
            const y = top + i * rowH;
            const color = f.effectPct < 0 ? LOWER : RAISE;
            const end = x(f.effectPct);
            const labelX = f.effectPct < 0 ? end - 6 : end + 6;
            return (
              <g key={f.key}
                onMouseMove={(e) => {
                  const box = ref.current.getBoundingClientRect();
                  setTip({ x: e.clientX - box.left + 14, y: e.clientY - box.top + 12, title: f.label, rows: [['Value', formatValue(f)], ['vs. average', `${f.z > 0 ? '+' : ''}${f.z} SD`], ['Weight', f.weight], ['Effect on estimate', `${f.effectPct > 0 ? '+' : ''}${f.effectPct}%`]] });
                }}>
                <rect x={0} y={y} width={width} height={rowH} fill="transparent" />
                <text x={0} y={y + rowH / 2 + 4} className="viz-label">{narrow && f.label.length > 20 ? `${f.label.slice(0, 19)}…` : f.label}</text>
                <path d={hbar(x(0), end, y + (rowH - barH) / 2, barH)} fill={color} />
                <text x={labelX} y={y + rowH / 2 + 4} textAnchor={f.effectPct < 0 ? 'end' : 'start'} className="viz-value">{f.effectPct > 0 ? '+' : ''}{f.effectPct}%</text>
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

const LOG_MIN = Math.log10(10000), LOG_MAX = Math.log10(420000);
const INCOME_TICKS = [15000, 25000, 50000, 100000, 200000, 400000];
const kfmt = (v) => (v >= 1000 ? `$${Math.round(v / 1000)}K` : money(v));
const tierAt = (tiers, income) => tiers.find((t) => (t.toIncome == null || income < t.toIncome) && (t.fromIncome == null || income >= t.fromIncome)) || tiers[tiers.length - 1];

/** Histogram of predicted income across the population, colored by benefit tier. */
export function PopulationHistogram({ members, tiers, marker }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState(null);
  const BINS = 28;
  const bins = useMemo(() => {
    const b = Array.from({ length: BINS }, (_, i) => {
      const lo = 10 ** (LOG_MIN + ((LOG_MAX - LOG_MIN) * i) / BINS);
      const hi = 10 ** (LOG_MIN + ((LOG_MAX - LOG_MIN) * (i + 1)) / BINS);
      return { lo, hi, n: 0 };
    });
    for (const m of members) {
      const i = Math.floor(((Math.log10(Math.max(10000, Math.min(419000, m.predicted))) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * BINS);
      b[Math.min(BINS - 1, Math.max(0, i))].n++;
    }
    return b;
  }, [members]);
  const left = 34, right = 12, top = 30, axisH = 26, plotH = 190;
  const plotW = Math.max(200, width - left - right);
  const x = (v) => left + ((Math.log10(v) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * plotW;
  const maxN = Math.max(...bins.map((b) => b.n), 1);
  const yMax = Math.ceil(maxN / 10) * 10;
  const y = (n) => top + plotH - (n / yMax) * plotH;
  const height = top + plotH + axisH;
  const bw = plotW / BINS;
  return (
    <div ref={ref} className="viz-box" onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Distribution of predicted household income">
          {[0, yMax / 2, yMax].map((t) => (
            <g key={t}>
              <line x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} />
              <text x={left - 8} y={y(t) + 4} textAnchor="end" className="viz-tick">{t}</text>
            </g>
          ))}
          {INCOME_TICKS.filter((v) => x(v) <= left + plotW).map((v) => <text key={v} x={x(v)} y={height - 8} textAnchor="middle" className="viz-tick">{kfmt(v)}</text>)}
          {bins.map((b, i) => {
            const t = tierAt(tiers, Math.sqrt(b.lo * b.hi));
            const w = Math.min(24, bw - 2);
            const bx = left + i * bw + (bw - w) / 2;
            return (
              <g key={i}
                onMouseMove={(e) => {
                  const box = ref.current.getBoundingClientRect();
                  setTip({ x: e.clientX - box.left + 14, y: e.clientY - box.top - 10, title: `${kfmt(b.lo)} – ${kfmt(b.hi)}`, rows: [['Households', b.n], ['Tier', `${t.name} ${t.multiplier}×`]] });
                }}>
                <rect x={left + i * bw} y={top} width={bw} height={plotH} fill="transparent" />
                <path d={vbar(bx, w, y(0), y(b.n))} fill={TIER_COLORS[t.key]} />
              </g>
            );
          })}
          {marker && (
            <g pointerEvents="none">
              <line x1={x(marker.value)} x2={x(marker.value)} y1={top - 6} y2={top + plotH} stroke="#F4E8D6" strokeWidth="2" />
              <text x={x(marker.value)} y={top - 12} textAnchor={x(marker.value) > width - 90 ? 'end' : x(marker.value) < 90 ? 'start' : 'middle'} className="viz-marker">{marker.label}</text>
            </g>
          )}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/** Actual vs predicted income (log-log) for every household; demo members highlighted. */
export function AccuracyScatter({ members }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState(null);
  const left = 44, right = 16, top = 12, axisH = 30;
  const size = Math.max(220, Math.min(width - left - right, 420));
  const height = top + size + axisH;
  const sx = (v) => left + ((Math.log10(Math.min(419000, Math.max(10000, v))) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * size;
  const sy = (v) => top + size - ((Math.log10(Math.min(419000, Math.max(10000, v))) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * size;
  const pts = members.map((m) => ({ ...m, px: sx(m.trueIncome), py: sy(m.predicted) }));
  const onMove = (e) => {
    const box = ref.current.getBoundingClientRect();
    const mx = e.clientX - box.left, my = e.clientY - box.top;
    let best = null, bd = 24 * 24;
    for (const p of pts) {
      const d = (p.px - mx) ** 2 + (p.py - my) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    setTip(best && { x: best.px + 14, y: best.py - 10, title: best.persona ? best.name : `Household · ${best.areaName}`, rows: [['Actual income', money(best.trueIncome)], ['Predicted', money(best.predicted)], ['Percentile', Math.round(best.percentile)], ['Tier', best.tier[0].toUpperCase() + best.tier.slice(1)]] });
  };
  const LABEL_LEFT = new Set(['Grace Okafor', 'Priya Natarajan']);
  return (
    <div ref={ref} className="viz-box" onMouseMove={onMove} onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Actual versus predicted income">
          {INCOME_TICKS.map((v) => (
            <g key={v}>
              <line x1={sx(v)} x2={sx(v)} y1={top} y2={top + size} stroke={GRID} />
              <line x1={left} x2={left + size} y1={sy(v)} y2={sy(v)} stroke={GRID} />
              <text x={sx(v)} y={top + size + 18} textAnchor="middle" className="viz-tick">{kfmt(v)}</text>
              <text x={left - 6} y={sy(v) + 4} textAnchor="end" className="viz-tick">{kfmt(v)}</text>
            </g>
          ))}
          <line x1={sx(10000)} y1={sy(10000)} x2={sx(419000)} y2={sy(419000)} stroke={AXIS} strokeWidth="1" />
          <text x={sx(300000)} y={sy(300000) + 16} textAnchor="end" className="viz-tick">perfect prediction</text>
          {pts.filter((p) => !p.persona).map((p, i) => <circle key={i} cx={p.px} cy={p.py} r="4" fill="#9299A3" fillOpacity="0.75" stroke={SURFACE} strokeWidth="2" />)}
          {pts.filter((p) => p.persona).map((p) => (
            <g key={p.name}>
              <circle cx={p.px} cy={p.py} r="6" fill="#D6B178" stroke={SURFACE} strokeWidth="2" />
              <text x={LABEL_LEFT.has(p.name) ? p.px - 10 : p.px + 10} y={p.py + 4} textAnchor={LABEL_LEFT.has(p.name) ? 'end' : 'start'} className="viz-label">{p.name.split(' ')[0]}</text>
            </g>
          ))}
          <text x={left + size / 2} y={height - 2} textAnchor="middle" className="viz-axis-title">Actual income (synthetic ground truth)</text>
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/** Households per neighborhood stacked by detected tier, sorted by need. */
export function NeighborhoodNeed({ areas, tiers, kMin }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState(null);
  const narrow = width < 520;
  const labelW = narrow ? 104 : 150, endW = narrow ? 64 : 150;
  const rowH = 30, barH = 14, top = 4;
  const maxN = Math.max(...areas.map((a) => a.households), 1);
  const plotW = Math.max(100, width - labelW - endW - 8);
  const height = top + areas.length * rowH + 4;
  const order = tiers.map((t) => t.key);
  return (
    <div ref={ref} className="viz-box" onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Households by detected tier in each neighborhood">
          {areas.map((a, i) => {
            const y = top + i * rowH + (rowH - barH) / 2;
            let cursor = labelW;
            const segs = order.filter((k) => a.tiers[k] > 0);
            return (
              <g key={a.id}>
                <text x={0} y={y + barH - 2} className="viz-label">{a.name}</text>
                {segs.map((k, j) => {
                  const w = (a.tiers[k] / maxN) * plotW;
                  const x0 = cursor;
                  cursor += w;
                  const t = tiers.find((tt) => tt.key === k);
                  const last = j === segs.length - 1;
                  return (
                    <path key={k} d={last ? hbar(x0, x0 + w - 2, y, barH) : `M${x0},${y}h${Math.max(0, w - 2)}v${barH}h${-Math.max(0, w - 2)}Z`} fill={TIER_COLORS[k]}
                      onMouseMove={(e) => {
                        const box = ref.current.getBoundingClientRect();
                        setTip({ x: e.clientX - box.left + 14, y: e.clientY - box.top - 10, title: `${a.name} · ${t.name}`, rows: [['Households', a.tiers[k]], ['Lower-income share', pct(a.needIndex)]] });
                      }} />
                  );
                })}
                <text x={labelW + plotW + 10} y={y + barH - 2} className="viz-value">{pct(a.needIndex)}{narrow ? '' : a.targetable.lower ? ' · fund open' : ` · under ${kMin}`}</text>
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/** Persona markers on the income spectrum, with the experience zones they fall into. */
export function IncomeSpectrum({ personas, activeHhid, onPick, busy }) {
  const ZONES = [
    { from: 0, to: 40, label: 'Savings first' },
    { from: 40, to: 60, label: 'Save & give' },
    { from: 60, to: 100, label: 'Giving first' },
  ];
  const placed = useMemo(() => {
    const sorted = [...personas].sort((a, b) => a.percentile - b.percentile);
    let lastPct = -100, lane = 0;
    return sorted.map((p) => {
      lane = p.percentile - lastPct < 7 ? (lane + 1) % 2 : 0;
      lastPct = p.percentile;
      return { ...p, lane };
    });
  }, [personas]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return (
    <div className="spectrum">
      <div className="spectrum-zones">
        {ZONES.map((z) => <div key={z.label} style={{ width: `${z.to - z.from}%` }}><span className="label">{z.label}</span></div>)}
      </div>
      <div className="spectrum-track">
        {[20, 40, 60, 80].map((t) => <span key={t} className="spectrum-tick" style={{ left: `${t}%` }} />)}
        {placed.map((p) => (
          <button key={p.hhid} className={`spectrum-pin ${p.hhid === activeHhid ? 'active' : ''} lane-${p.lane}`} disabled={busy}
            style={{ left: `${mounted ? Math.min(97, Math.max(3, p.percentile)) : 50}%` }} onClick={() => onPick(p.hhid)} title={`View the site as ${p.firstName}`}>
            <span className="avatar">{p.firstName[0]}{p.lastName[0]}</span>
            <span className="spectrum-name">{p.firstName}</span>
          </button>
        ))}
      </div>
      <div className="spectrum-scale"><span>Lower income</span><span>Relative income percentile</span><span>Higher income</span></div>
    </div>
  );
}
