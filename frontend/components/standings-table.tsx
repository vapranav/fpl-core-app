"use client";

import { useEntryId } from "./entry-id";
import { RankMovement } from "./rank-movement";
import type { LeagueStandingRow } from "@/lib/api";

/** Standings table; highlights the row of the locally connected entry id. */
export function StandingsTable({ rows }: { rows: LeagueStandingRow[] }) {
  const [entryId] = useEntryId();
  const own = entryId === null ? null : Number(entryId);
  const showValue = rows.some((r) => r.team_value != null);

  return (
    <div className="border-border bg-surface overflow-x-auto rounded-lg border">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-background text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Rank</th>
            <th className="px-3 py-2 font-medium">Team</th>
            <th className="hidden px-3 py-2 font-medium sm:table-cell">
              Manager
            </th>
            {showValue && (
              <th
                className="hidden px-3 py-2 text-right font-medium md:table-cell"
                title="Squad value at the last deadline"
              >
                Value
              </th>
            )}
            <th className="px-3 py-2 text-right font-medium">GW</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOwn = own !== null && r.entry === own;
            return (
              <tr
                key={r.entry}
                className={`border-border border-t transition-colors ${
                  isOwn ? "bg-accent/10 font-semibold" : "hover:bg-background"
                }`}
              >
                <td className="px-3 py-1.5">
                  <span className="flex items-center gap-1.5">
                    {r.rank}
                    <RankMovement rank={r.rank} lastRank={r.last_rank} />
                  </span>
                </td>
                <td className="px-3 py-1.5">{r.entry_name}</td>
                <td className="text-muted hidden px-3 py-1.5 sm:table-cell">
                  {r.player_name}
                </td>
                {showValue && (
                  <td
                    className="text-muted hidden px-3 py-1.5 text-right md:table-cell"
                    title={
                      r.bank != null
                        ? `£${r.bank.toFixed(1)}m in the bank`
                        : undefined
                    }
                  >
                    {r.team_value != null
                      ? `£${r.team_value.toFixed(1)}m`
                      : "–"}
                  </td>
                )}
                <td className="px-3 py-1.5 text-right">{r.event_total}</td>
                <td className="px-3 py-1.5 text-right font-semibold">
                  {r.total.toLocaleString("en-GB")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
