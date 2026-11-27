import type { ShotRow, XgMinutePoint } from "@/lib/api";

// Hand-rolled SVG: no chart libraries in this project (see player detail page).

const W = 600;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 24, left: 36 };

export function XgFlowChart({
  points,
  goals,
  homeName,
  awayName,
}: {
  points: XgMinutePoint[];
  goals: ShotRow[];
  homeName: string;
  awayName: string;
}) {
  const maxMinute = Math.max(90, ...points.map((p) => p.minute));
  const maxXg = Math.max(
    0.5,
    ...points.map((p) =>
      Math.max(p.home_cumulative_xg ?? 0, p.away_cumulative_xg ?? 0),
    ),
  );
  const x = (minute: number) =>
    PAD.left + (minute / maxMinute) * (W - PAD.left - PAD.right);
  const y = (xg: number) =>
    H - PAD.bottom - (xg / maxXg) * (H - PAD.top - PAD.bottom);

  const series = (key: "home_cumulative_xg" | "away_cumulative_xg") =>
    points
      .map((p) => `${x(p.minute).toFixed(1)},${y(p[key] ?? 0).toFixed(1)}`)
      .join(" ");
  const area = (key: "home_cumulative_xg" | "away_cumulative_xg") =>
    `${x(points[0]?.minute ?? 0).toFixed(1)},${y(0).toFixed(1)} ` +
    series(key) +
    ` ${x(points[points.length - 1]?.minute ?? 0).toFixed(1)},${y(0).toFixed(1)}`;

  // cumulative xG at a goal's minute: last sample at or before it
  const cumAt = (minute: number, home: boolean) => {
    const key = home ? "home_cumulative_xg" : "away_cumulative_xg";
    let v = 0;
    for (const p of points) {
      if (p.minute > minute) break;
      v = p[key] ?? v;
    }
    return v;
  };

  const ticks = [0, 15, 30, 45, 60, 75, 90].filter((t) => t <= maxMinute);
  if (maxMinute > 90) ticks.push(maxMinute);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Cumulative xG by minute"
      >
        {/* gridlines */}
        {[0.5, 1, 1.5, 2, 2.5, 3]
          .filter((v) => v < maxXg)
          .map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                className="stroke-border"
                strokeDasharray="3 4"
              />
              <text
                x={PAD.left - 6}
                y={y(v) + 3}
                textAnchor="end"
                className="fill-muted text-[10px]"
              >
                {v}
              </text>
            </g>
          ))}
        {/* x axis */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(0)}
          y2={y(0)}
          className="stroke-border"
        />
        {ticks.map((t) => (
          <text
            key={t}
            x={x(t)}
            y={H - 8}
            textAnchor="middle"
            className="fill-muted text-[10px]"
          >
            {t}&apos;
          </text>
        ))}
        {/* areas + lines */}
        <polygon
          points={area("home_cumulative_xg")}
          className="fill-accent/15"
        />
        <polygon
          points={area("away_cumulative_xg")}
          className="fill-muted/10"
        />
        <polyline
          points={series("home_cumulative_xg")}
          fill="none"
          strokeWidth={2}
          className="stroke-accent"
        />
        <polyline
          points={series("away_cumulative_xg")}
          fill="none"
          strokeWidth={2}
          className="stroke-muted"
        />
        {/* goal markers */}
        {goals.map((g) => {
          const home = g.is_home === true;
          const cy = y(cumAt(g.minute ?? 0, home));
          return (
            <circle
              key={g.shot_index}
              cx={x(g.minute ?? 0)}
              cy={cy}
              r={5}
              className={
                home
                  ? "fill-accent stroke-surface"
                  : "fill-muted stroke-surface"
              }
              strokeWidth={1.5}
            >
              <title>
                {g.minute}
                {g.added_time ? `+${g.added_time}` : ""}&apos; goal
                {g.player_name ? ` — ${g.player_name}` : ""} (
                {home ? homeName : awayName})
              </title>
            </circle>
          );
        })}
      </svg>
      <div className="text-muted mt-1 flex gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-accent inline-block h-0.5 w-4" /> {homeName}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-muted inline-block h-0.5 w-4" /> {awayName}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-accent border-surface inline-block h-2.5 w-2.5 rounded-full border" />{" "}
          Goal
        </span>
      </div>
    </div>
  );
}
