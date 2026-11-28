"use client";

import { useState } from "react";

export interface LineSeries {
  name: string;
  color: string;
  data: { x: number; y: number | null }[];
}

// mid-tone hues that read on both the light and dark backgrounds
export const SERIES_COLORS = [
  "#7c3aed",
  "#0891b2",
  "#ea580c",
  "#16a34a",
  "#db2777",
];

const W = 720;
const H = 260;
const PAD = { top: 12, right: 12, bottom: 28, left: 36 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
}

/** Multi-series line chart in plain SVG, with a hover readout per x value. */
export function LineChart({
  series,
  xLabel = "GW",
  format = (v) => String(v),
}: {
  series: LineSeries[];
  xLabel?: string;
  format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const xs = [...new Set(series.flatMap((s) => s.data.map((d) => d.x)))].sort(
    (a, b) => a - b,
  );
  const ys = series.flatMap((s) =>
    s.data.map((d) => d.y).filter((y): y is number => y !== null),
  );
  if (xs.length === 0 || ys.length === 0) return null;

  const minY = Math.min(0, ...ys);
  const maxY = niceMax(Math.max(...ys));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x0 = xs[0];
  const xSpan = Math.max(1, xs[xs.length - 1] - x0);
  const px = (x: number) => PAD.left + ((x - x0) / xSpan) * innerW;
  const py = (y: number) =>
    PAD.top + innerH - ((y - minY) / (maxY - minY)) * innerH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => minY + t * (maxY - minY));
  const xEvery = Math.ceil(xs.length / 12);

  // break the line at missing values instead of drawing through them
  const path = (data: LineSeries["data"]) => {
    let d = "";
    let pen = false;
    for (const p of [...data].sort((a, b) => a.x - b.x)) {
      if (p.y === null) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    let best = xs[0];
    for (const x of xs)
      if (Math.abs(px(x) - sx) < Math.abs(px(best) - sx)) best = x;
    setHover(best);
  };

  return (
    <div className="border-border bg-surface rounded-lg border p-3">
      {/* fixed minimum width keeps labels legible on phones; scrolls instead */}
      <div className="overflow-x-auto">
        <div className="relative min-w-[640px]">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full touch-pan-x"
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
                  className="stroke-border"
                />
                <text
                  x={PAD.left - 6}
                  y={py(t) + 4}
                  textAnchor="end"
                  className="fill-muted text-[11px]"
                >
                  {format(Math.round(t * 10) / 10)}
                </text>
              </g>
            ))}
            {xs.map((x, i) =>
              i % xEvery === 0 ? (
                <text
                  key={x}
                  x={px(x)}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-muted text-[11px]"
                >
                  {x}
                </text>
              ) : null,
            )}
            {hover !== null && (
              <line
                x1={px(hover)}
                x2={px(hover)}
                y1={PAD.top}
                y2={PAD.top + innerH}
                className="stroke-muted"
                strokeDasharray="3 3"
              />
            )}
            {series.map((s) => (
              <g key={s.name}>
                <path
                  d={path(s.data)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {hover !== null &&
                  s.data
                    .filter((d) => d.x === hover && d.y !== null)
                    .map((d) => (
                      <circle
                        key={d.x}
                        cx={px(d.x)}
                        cy={py(d.y!)}
                        r={4}
                        fill={s.color}
                      />
                    ))}
              </g>
            ))}
          </svg>
          {hover !== null && (
            <div
              className="border-border bg-background pointer-events-none absolute top-1 rounded-md border px-2 py-1 text-xs shadow-sm"
              style={
                px(hover) > W / 2
                  ? { right: `${((W - px(hover)) / W) * 100 + 2}%` }
                  : { left: `${(px(hover) / W) * 100 + 2}%` }
              }
            >
              <div className="font-semibold">
                {xLabel}
                {hover}
              </div>
              {series.map((s) => {
                const y = s.data.find((d) => d.x === hover)?.y;
                return (
                  <div key={s.name} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: s.color }}
                    />
                    {s.name}:{" "}
                    <span className="tabular-nums">
                      {y === null || y === undefined ? "–" : format(y)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4"
              style={{ background: s.color }}
            />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
