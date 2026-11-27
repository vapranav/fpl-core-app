import type { ShotRow } from "@/lib/api";

// Dataset coords are on a 0-100 grid measured from the attacked goal:
// start_x = distance from the goal line, start_y = lateral (50 = centre).
// Home attacks left-to-right, away right-to-left, so both mirror accordingly.

const W = 100;
const H = 68; // standard pitch proportions

const OUTCOME_STYLES: Record<string, { cls: string; label: string }> = {
  goal: { cls: "fill-green-500", label: "Goal" },
  save: { cls: "fill-sky-500", label: "Saved" },
  block: { cls: "fill-amber-500", label: "Blocked" },
  "blocked-off-line": { cls: "fill-amber-500", label: "Blocked" },
  miss: { cls: "fill-neutral-400", label: "Off target" },
  post: { cls: "fill-orange-500", label: "Woodwork" },
};
const styleOf = (outcome: string | null) =>
  OUTCOME_STYLES[outcome ?? ""] ?? {
    cls: "fill-neutral-400",
    label: outcome ?? "Unknown",
  };

export function ShotMap({
  shots,
  homeName,
  awayName,
}: {
  shots: ShotRow[];
  homeName: string;
  awayName: string;
}) {
  const placed = shots.filter((s) => s.start_x !== null && s.start_y !== null);
  const legend = [
    ...new Map(
      placed.map((s) => {
        const st = styleOf(s.outcome);
        return [st.label, st];
      }),
    ).values(),
  ];
  return (
    <div>
      <svg
        viewBox={`-2 -2 ${W + 4} ${H + 4}`}
        className="w-full"
        role="img"
        aria-label="Shot map"
      >
        {/* pitch markings */}
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          rx={1}
          className="stroke-border fill-green-600/10"
        />
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} className="stroke-border" />
        <circle
          cx={W / 2}
          cy={H / 2}
          r={9.15}
          fill="none"
          className="stroke-border"
        />
        {/* penalty + six-yard boxes */}
        {[0, 1].map((side) => (
          <g key={side}>
            <rect
              x={side === 0 ? 0 : W - 16.5}
              y={(H - 40.3) / 2}
              width={16.5}
              height={40.3}
              fill="none"
              className="stroke-border"
            />
            <rect
              x={side === 0 ? 0 : W - 5.5}
              y={(H - 18.3) / 2}
              width={5.5}
              height={18.3}
              fill="none"
              className="stroke-border"
            />
          </g>
        ))}
        {placed.map((s) => {
          const home = s.is_home === true;
          const cx = home ? W - (s.start_x ?? 0) : (s.start_x ?? 0);
          const cy =
            ((home ? s.start_y : 100 - (s.start_y ?? 0)) ?? 50) * (H / 100);
          const r = 1.4 + (s.xg ?? 0) * 7;
          return (
            <circle
              key={s.shot_index}
              cx={cx}
              cy={cy}
              r={r}
              className={`${styleOf(s.outcome).cls} stroke-surface opacity-85`}
              strokeWidth={0.4}
            >
              <title>
                {s.minute}
                {s.added_time ? `+${s.added_time}` : ""}&apos;{" "}
                {s.player_name || "Unknown"} ({home ? homeName : awayName}) —{" "}
                {styleOf(s.outcome).label}, xG {(s.xg ?? 0).toFixed(2)}
              </title>
            </circle>
          );
        })}
      </svg>
      <div className="text-muted mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {legend.map((st) => (
          <span key={st.label} className="inline-flex items-center gap-1.5">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${st.cls}`}
            />
            {st.label}
          </span>
        ))}
        <span className="ml-auto">dot size = xG · {homeName} attack →</span>
      </div>
    </div>
  );
}
