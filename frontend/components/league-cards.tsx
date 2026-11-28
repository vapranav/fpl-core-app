import Link from "next/link";
import { RankMovement } from "./rank-movement";
import type { ManagerLeague } from "@/lib/api";

/** One card per classic league, with the manager's rank and its movement. */
export function LeagueCards({ leagues }: { leagues: ManagerLeague[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {leagues.map((lg) => (
        <Link
          key={lg.id}
          href={`/leagues/${lg.id}`}
          className="border-border bg-surface hover:bg-background flex items-center justify-between gap-2 rounded-lg border p-4 transition-colors"
        >
          <span className="truncate text-sm font-medium">{lg.name}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums">
            <RankMovement rank={lg.entry_rank} lastRank={lg.entry_last_rank} />
            <span className="font-semibold">
              {lg.entry_rank === null
                ? "–"
                : lg.entry_rank.toLocaleString("en-GB")}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
