import Image from "next/image";
import Link from "next/link";
import { PlayerPhoto } from "@/components/player-photo";
import { Select } from "@/components/select";
import { badgeUrl, getDefcon, POSITIONS } from "@/lib/api";

const MIN_MINUTES_OPTIONS = ["270", "450", "900"];

function ThresholdBar({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-16">{pct}%</span>
      <span className="bg-border h-1.5 w-16 overflow-hidden rounded-full">
        <span
          className="bg-accent block h-full rounded-full"
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}

export default async function DefconPage({
  searchParams,
}: {
  searchParams: Promise<{ position?: string; min_minutes?: string }>;
}) {
  const sp = await searchParams;
  const position = sp.position ?? "";
  const minMinutes = sp.min_minutes ?? "270";
  const data = await getDefcon({ position, min_minutes: minMinutes });

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Defensive contribution scout
        </h1>
        <p className="text-muted text-sm">
          Season {data.season} · CBIT = clearances + blocks + interceptions +
          tackles won, per Premier League match
        </p>
      </header>

      <form method="GET" className="mb-4 flex flex-wrap items-center gap-2">
        <Select name="position" defaultValue={position}>
          <option value="">All positions</option>
          {POSITIONS.map((pos) => (
            <option key={pos} value={pos}>
              {pos}
            </option>
          ))}
        </Select>
        <Select name="min_minutes" defaultValue={minMinutes}>
          {MIN_MINUTES_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m}+ minutes
            </option>
          ))}
        </Select>
        <button
          type="submit"
          className="bg-accent rounded-md px-4 py-2 text-sm font-medium text-white dark:text-neutral-900"
        >
          Apply
        </button>
      </form>

      {data.players.length === 0 ? (
        <p className="border-border bg-surface text-muted rounded-lg border p-6 text-sm">
          No players meet the current filters.
        </p>
      ) : (
        <div className="border-border bg-surface overflow-x-auto rounded-lg border">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-background text-left">
              <tr>
                {[
                  "Player",
                  "CBIT/90",
                  "CBIT",
                  "Per match",
                  "Threshold",
                  "C/90",
                  "B/90",
                  "I/90",
                  "T/90",
                  "Opp Elo",
                ].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.players.map((p) => {
                const watch = p.cbit_per_match >= 8 && p.cbit_per_match < 10;
                return (
                  <tr
                    key={p.player_id}
                    className="border-border hover:bg-background border-t transition-colors"
                  >
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <PlayerPhoto
                          src={p.photo_url}
                          alt={p.web_name}
                          size={36}
                        />
                        <div>
                          <Link
                            href={`/players/${p.player_id}`}
                            className="font-medium hover:underline"
                          >
                            {p.web_name}
                          </Link>
                          {watch && (
                            <span className="ml-1.5 rounded bg-amber-600/15 px-1.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                              threshold watch
                            </span>
                          )}
                          <div className="text-muted flex items-center gap-1 text-xs">
                            <Image
                              src={badgeUrl(p.team_code)}
                              alt=""
                              width={14}
                              height={14}
                            />
                            {p.team_name} ·{" "}
                            {p.position.slice(0, 3).toUpperCase()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold">
                      {p.cbit_per_90.toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-right">{p.cbit_total}</td>
                    <td className="px-3 py-1.5 text-right">
                      {p.cbit_per_match.toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5">
                      <ThresholdBar rate={p.threshold_rate} />
                    </td>
                    <td className="text-muted px-3 py-1.5 text-right">
                      {p.clearances_per_90.toFixed(2)}
                    </td>
                    <td className="text-muted px-3 py-1.5 text-right">
                      {p.blocks_per_90.toFixed(2)}
                    </td>
                    <td className="text-muted px-3 py-1.5 text-right">
                      {p.interceptions_per_90.toFixed(2)}
                    </td>
                    <td className="text-muted px-3 py-1.5 text-right">
                      {p.tackles_won_per_90.toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {p.avg_opp_elo === null ? (
                        <span className="text-muted">–</span>
                      ) : (
                        p.avg_opp_elo.toFixed(0)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-muted mt-2 text-xs">
        CBIT = clearances + blocks + interceptions + tackles won (CBIT/90 uses
        won tackles as the quality proxy; raw tackle counts include attempts).
        Threshold = share of matches with CBIT ≥ 10 — FPL awards
        defensive-contribution points at 10+ CBIT for defenders/midfielders and
        12+ for forwards; 10 is shown here for all positions. Players need{" "}
        {minMinutes}+ league minutes; Opp Elo is the average Elo of opponents
        faced.
      </p>
    </main>
  );
}
