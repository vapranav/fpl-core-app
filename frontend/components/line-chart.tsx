"use client";

import { Fragment, useState } from "react";
import { needsOutline } from "@/lib/kit-colors";

export interface LineSeries {
  name: string;
  color: string;
  data: { x: number; y: number | null }[];
  /** drawn thicker and on top, e.g. the connected manager */
  emphasis?: boolean;
}

// mid-tone hues that read on both the light and dark backgrounds
export const SERIES_COLORS = [
  "#7c3aed",
  "#0891b2",
  "#ea580c",
  "#16a34a",
  "#db2777",
  "#2563eb",
  "#ca8a04",
  "#dc2626",
  "#0d9488",
  "#9333ea",
  "#65a30d",
  "#c2410c",
];

// drawn under white/black kit lines so they stay visible in both themes
const OUTLINE = "#71717a";

const W = 720;
const H = 280;
const PAD = { top: 12, right: 16, bottom: 28, left: 52 };

type Pt = [number, number];

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
}

const sign = (v: number) => (v < 0 ? -1 : 1);

/**
 * Smooth path through screen points that never overshoots the data: the
 * monotone cubic interpolation (Fritsch-Carlson, as d3's curveMonotoneX and
 * recharts' type="monotone" use), so a flat week stays flat.
 */
function monotonePath(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  if (n === 2) return `M${pts[0][0]},${pts[0][1]}L${pts[1][0]},${pts[1][1]}`;

  const h = (i: number) => pts[i + 1][0] - pts[i][0];
  const s = (i: number) => (h(i) ? (pts[i + 1][1] - pts[i][1]) / h(i) : 0);
  const m: number[] = new Array(n);
  for (let i = 1; i < n - 1; i++) {
    const s0 = s(i - 1);
    const s1 = s(i);
    const p = (s0 * h(i) + s1 * h(i - 1)) / (h(i - 1) + h(i));
    m[i] =
      (sign(s0) + sign(s1)) *
        Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  // endpoint tangents from the neighbouring one (d3's slope2)
  m[0] = h(0) ? (3 * s(0) - m[1]) / 2 : m[1];
  m[n - 1] = h(n - 2) ? (3 * s(n - 2) - m[n - 2]) / 2 : m[n - 2];

  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const dx = (x1 - x0) / 3;
    d +=
      `C${(x0 + dx).toFixed(1)},${(y0 + dx * m[i]).toFixed(1)}` +
      ` ${(x1 - dx).toFixed(1)},${(y1 - dx * m[i + 1]).toFixed(1)}` +
      ` ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

/**
 * Multi-series line chart in plain SVG (same look as fpl-dashboard's recharts
 * chart): smooth monotone curves, dashed grid, a hover readout per gameweek,
 * and a legend whose entries hide or show their series.
 */
export function LineChart({
  series,
  xLabel = "GW",
  format = (v) => v.toLocaleString("en-GB"),
  reversed = false,
  zeroBased = true,
}: {
  series: LineSeries[];
  xLabel?: string;
  format?: (v: number) => string;
  /** smaller is better (ranks): put the minimum at the top */
  reversed?: boolean;
  /** start the y axis at 0; off for ranks, which would squash every line */
  zeroBased?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const visible = series.filter((s) => !hidden.has(s.name));
  const xs = [...new Set(series.flatMap((s) => s.data.map((d) => d.x)))].sort(
    (a, b) => a - b,
  );
  const ys = visible.flatMap((s) =>
    s.data.map((d) => d.y).filter((y): y is number => y !== null),
  );
  if (xs.length === 0) return null;

  const lo = ys.length ? Math.min(...ys) : 0;
  const hi = ys.length ? Math.max(...ys) : 1;
  const minY = zeroBased ? Math.min(0, lo) : lo;
  const maxY = zeroBased ? niceMax(hi) : hi === lo ? lo + 1 : hi;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x0 = xs[0];
  const xSpan = Math.max(1, xs[xs.length - 1] - x0);
  const px = (x: number) => PAD.left + ((x - x0) / xSpan) * innerW;
  const frac = (y: number) => (y - minY) / (maxY - minY);
  const py = (y: number) =>
    PAD.top + (reversed ? frac(y) : 1 - frac(y)) * innerH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => minY + t * (maxY - minY));
  const xEvery = Math.ceil(xs.length / 12);
  // dots on every point read well for a handful of lines, not for 20
  const dotR = visible.length <= 6 ? 3 : 0;

  // like recharts' connectNulls: a blank gameweek doesn't break the line
  const points = (s: LineSeries): Pt[] =>
    s.data
      .filter((d): d is { x: number; y: number } => d.y !== null)
      .sort((a, b) => a.x - b.x)
      .map((d) => [px(d.x), py(d.y)]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    let best = xs[0];
    for (const x of xs)
      if (Math.abs(px(x) - sx) < Math.abs(px(best) - sx)) best = x;
    setHover(best);
  };

  const toggle = (name: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  // emphasised series last so they draw on top
  const drawOrder = [...visible].sort(
    (a, b) => Number(!!a.emphasis) - Number(!!b.emphasis),
  );
  // hover readout: best first
  const readout =
    hover === null
      ? []
      : visible
          .map((s) => ({ s, y: s.data.find((d) => d.x === hover)?.y ?? null }))
          .sort((a, b) =>
            a.y === null
              ? 1
              : b.y === null
                ? -1
                : reversed
                  ? a.y - b.y
                  : b.y - a.y,
          );
  // restart the draw-in animation when the plotted data changes
  const drawKey = series
    .map((s) => `${s.name}:${s.data.map((d) => d.y).join(",")}`)
    .join("|");

  return (
    <div className="border-border bg-surface rounded-lg border p-3">
      {/* fixed minimum width keeps labels legible on phones; scrolls instead */}
      <div className="overflow-x-auto">
        <div className="relative min-w-[640px]">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="text-muted h-auto w-full touch-pan-x"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label={`Line chart of ${series.map((s) => s.name).join(", ")}`}
          >
            {yTicks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={py(t)}
                  y2={py(t)}
                  stroke="currentColor"
                  strokeOpacity={0.2}
                  strokeDasharray="3 3"
                />
                <text
                  x={PAD.left - 8}
                  y={py(t) + 4}
                  textAnchor="end"
                  fill="currentColor"
                  className="text-[12px]"
                >
                  {format(Math.round(t * 10) / 10)}
                </text>
              </g>
            ))}
            {xs.map((x, i) =>
              i % xEvery === 0 ? (
                <g key={x}>
                  <line
                    x1={px(x)}
                    x2={px(x)}
                    y1={PAD.top}
                    y2={PAD.top + innerH}
                    stroke="currentColor"
                    strokeOpacity={0.2}
                    strokeDasharray="3 3"
                  />
                  <text
                    x={px(x)}
                    y={H - 8}
                    textAnchor="middle"
                    fill="currentColor"
                    className="text-[12px]"
                  >
                    {xLabel}
                    {x}
                  </text>
                </g>
              ) : null,
            )}
            {hover !== null && (
              <line
                x1={px(hover)}
                x2={px(hover)}
                y1={PAD.top}
                y2={PAD.top + innerH}
                stroke="currentColor"
                strokeOpacity={0.6}
              />
            )}
            <g key={drawKey}>
              {drawOrder.map((s) => {
                const pts = points(s);
                const d = monotonePath(pts);
                const outline = needsOutline(s.color);
                const width = s.emphasis ? 3.5 : 2;
                return (
                  <Fragment key={s.name}>
                    {outline && (
                      <path
                        d={d}
                        fill="none"
                        stroke={OUTLINE}
                        strokeWidth={width + 2.5}
                        strokeLinecap="round"
                        pathLength={1}
                        className="chart-line-draw"
                      />
                    )}
                    <path
                      d={d}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pathLength={1}
                      className="chart-line-draw"
                    />
                    {dotR > 0 &&
                      pts.map(([cx, cy]) => (
                        <circle
                          key={cx}
                          cx={cx}
                          cy={cy}
                          r={dotR}
                          fill={s.color}
                          stroke={outline ? OUTLINE : s.color}
                          className="chart-dot-fade"
                        />
                      ))}
                  </Fragment>
                );
              })}
            </g>
            {hover !== null &&
              drawOrder.map((s) =>
                s.data
                  .filter((d) => d.x === hover && d.y !== null)
                  .map((d) => (
                    <circle
                      key={`${s.name}-${d.x}`}
                      cx={px(d.x)}
                      cy={py(d.y!)}
                      r={s.emphasis ? 6 : 5}
                      fill={s.color}
                      stroke={OUTLINE}
                      strokeWidth={1.5}
                    />
                  )),
              )}
          </svg>
          {hover !== null && readout.length > 0 && (
            <div
              className="border-border bg-background pointer-events-none absolute top-1 max-h-[90%] overflow-hidden rounded-md border px-2.5 py-1.5 text-xs shadow-md"
              style={
                px(hover) > W / 2
                  ? { right: `${((W - px(hover)) / W) * 100 + 2}%` }
                  : { left: `${(px(hover) / W) * 100 + 2}%` }
              }
            >
              <div className="mb-0.5 font-semibold">Gameweek {hover}</div>
              {readout.map(({ s, y }) => (
                <div
                  key={s.name}
                  className={`flex items-center gap-1.5 whitespace-nowrap ${s.emphasis ? "font-semibold" : ""}`}
                >
                  <span
                    className="border-muted inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
                    style={{ background: s.color }}
                  />
                  {s.name}:{" "}
                  <span className="tabular-nums">
                    {y === null ? "–" : format(y)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {series.length > 1 && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-xs">
          {series.map((s) => {
            const off = hidden.has(s.name);
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => toggle(s.name)}
                aria-pressed={!off}
                className={`inline-flex items-center gap-1.5 ${off ? "text-muted line-through opacity-60" : ""} ${s.emphasis ? "font-semibold" : ""}`}
              >
                <span
                  className="border-muted inline-block h-2.5 w-2.5 rounded-full border"
                  style={{ background: s.color }}
                />
                {s.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
