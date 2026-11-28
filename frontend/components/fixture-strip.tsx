import type { CompareFixture } from "@/lib/api";

// FPL's fixture difficulty rating (FDR) scale, 1 = easiest
const DIFFICULTY: Record<number, string> = {
  1: "bg-green-700 text-white",
  2: "bg-green-600/20 text-green-700 dark:text-green-400",
  3: "bg-border text-foreground",
  4: "bg-red-600/20 text-red-700 dark:text-red-400",
  5: "bg-red-700 text-white",
};

export function FixtureStrip({ fixtures }: { fixtures: CompareFixture[] }) {
  if (!fixtures.length)
    return <span className="text-muted text-xs">No upcoming fixtures</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {fixtures.map((f, i) => (
        <span
          key={`${f.event}-${i}`}
          title={`GW${f.event ?? "?"} · difficulty ${f.difficulty}`}
          className={`rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${DIFFICULTY[f.difficulty] ?? DIFFICULTY[3]}`}
        >
          {f.opponent_short} ({f.is_home ? "H" : "A"})
        </span>
      ))}
    </div>
  );
}
