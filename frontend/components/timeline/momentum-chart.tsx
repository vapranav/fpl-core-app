import type { MomentumPoint } from "@/lib/api";

/** Per-minute momentum bars around a centered baseline; positive = home. */
export function MomentumChart({
  points,
  homeName,
  awayName,
}: {
  points: MomentumPoint[];
  homeName: string;
  awayName: string;
}) {
  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.value ?? 0)));
  const maxMinute = Math.max(90, ...points.map((p) => p.minute));
  const byMinute = new Map(
    points.map((p) => [Math.round(p.minute), p.value ?? 0]),
  );
  const minutes = Array.from({ length: maxMinute }, (_, i) => i + 1);

  return (
    <div>
      <div
        className="flex h-28 items-stretch gap-px"
        role="img"
        aria-label="Momentum by minute"
      >
        {minutes.map((m) => {
          const v = byMinute.get(m) ?? 0;
          const pct = (Math.abs(v) / maxAbs) * 50;
          return (
            <div
              key={m}
              className="relative flex-1"
              title={`${m}' — ${v > 0 ? homeName : v < 0 ? awayName : "even"} (${v})`}
            >
              {/* centered baseline */}
              <div className="bg-border absolute top-1/2 right-0 left-0 h-px" />
              <div
                className={`absolute right-0 left-0 rounded-[1px] ${
                  v > 0 ? "bg-accent/80" : v < 0 ? "bg-muted/70" : ""
                }`}
                style={
                  v > 0
                    ? { bottom: "50%", height: `${pct}%` }
                    : v < 0
                      ? { top: "50%", height: `${pct}%` }
                      : undefined
                }
              />
            </div>
          );
        })}
      </div>
      <div className="text-muted mt-1 flex justify-between text-[10px] tabular-nums">
        <span>1&apos;</span>
        <span>45&apos;</span>
        {maxMinute > 60 && <span>90&apos;</span>}
        {maxMinute > 90 && <span>{maxMinute}&apos;</span>}
      </div>
      <div className="text-muted mt-1 flex gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-accent/80 inline-block h-2.5 w-2.5 rounded-sm" />{" "}
          {homeName} on top
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-muted/70 inline-block h-2.5 w-2.5 rounded-sm" />{" "}
          {awayName} on top
        </span>
      </div>
    </div>
  );
}
