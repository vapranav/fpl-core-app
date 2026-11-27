import Image from "next/image";
import Link from "next/link";
import { PlayerPhoto } from "@/components/player-photo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  badgeUrl,
  getPlayer,
  getPlayerGameweeks,
  getTeams,
  type GameweekStat,
  type PlayerDetail,
  type PlayerStats,
  type Team,
} from "@/lib/api";

function fmt(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "–" : v.toFixed(digits);
}

const BAR_CLASSES = ["bg-c1", "bg-c2", "bg-c3", "bg-c4"] as const;

const STAT_ROWS: {
  key: keyof PlayerStats;
  label: string;
  format: (v: number | null) => string;
}[] = [
  { key: "total_points", label: "Total points", format: (v) => fmt(v, 0) },
  { key: "form", label: "Form", format: (v) => fmt(v) },
  { key: "now_cost", label: "Price", format: (v) => (v === null ? "–" : `£${fmt(v)}m`) },
  { key: "selected_by_percent", label: "Ownership", format: (v) => (v === null ? "–" : `${fmt(v)}%`) },
  { key: "points_per_game", label: "Points per game", format: (v) => fmt(v) },
  { key: "goals_scored", label: "Goals", format: (v) => fmt(v, 0) },
  { key: "assists", label: "Assists", format: (v) => fmt(v, 0) },
  { key: "expected_goals", label: "Expected goals", format: (v) => fmt(v) },
  { key: "expected_assists", label: "Expected assists", format: (v) => fmt(v) },
  { key: "defensive_contribution", label: "Defensive contribution", format: (v) => fmt(v) },
  { key: "ict_index", label: "ICT index", format: (v) => fmt(v) },
  { key: "minutes", label: "Minutes", format: (v) => fmt(v, 0) },
];

interface ComparedPlayer {
  player: PlayerDetail;
  gameweeks: GameweekStat[];
}

function Header() {
  return (
    <header className="mb-6 flex items-start justify-between">
      <Link href="/" className="text-sm text-muted hover:underline">
        ← All players
      </Link>
      <ThemeToggle />
    </header>
  );
}

function EmptyState() {
  return (
    <main className="mx-auto max-w-6xl p-6">
      <Header />
      <h1 className="mb-6 font-display text-3xl font-bold tracking-tight">
        Compare players
      </h1>
      <div className="rounded-lg border border-border bg-surface p-8 text-center">
        <p className="font-display text-lg font-semibold">
          Pick 2–4 players to compare
        </p>
        <p className="mt-2 text-sm text-muted">
          Add their ids to the URL, e.g.{" "}
          <code className="rounded bg-background px-1.5 py-0.5 text-xs">
            /compare?ids=4,430
          </code>
        </p>
        <p className="mt-1 text-sm text-muted">
          Tip: open any player&apos;s page and use the Compare link to start a
          comparison with that player.
        </p>
      </div>
    </main>
  );
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; season?: string }>;
}) {
  const { ids: idsParam, season } = await searchParams;

  const ids = [
    ...new Set(
      (idsParam ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].slice(0, 4);

  const results = await Promise.all(
    ids.map(async (id): Promise<ComparedPlayer | null> => {
      try {
        const [player, gameweeks] = await Promise.all([
          getPlayer(id, season),
          getPlayerGameweeks(id, season),
        ]);
        return { player, gameweeks: gameweeks.gameweeks };
      } catch {
        return null;
      }
    }),
  );
  const entries = results.filter((e): e is ComparedPlayer => e !== null);

  if (entries.length < 2) return <EmptyState />;

  let teamsData: { teams: Team[] } = { teams: [] };
  try {
    teamsData = await getTeams(season);
  } catch {
    // badges still render; names fall back to #code
  }
  const teamName = (code: number) =>
    teamsData.teams.find((t) => t.code === code)?.short_name ?? `#${code}`;

  const gridCols =
    entries.length === 2
      ? "grid-cols-2"
      : entries.length === 3
        ? "grid-cols-2 sm:grid-cols-3"
        : "grid-cols-2 sm:grid-cols-4";

  // grouped per-GW chart: union of all gameweeks, normalized to the global max
  const pointsByGw = entries.map(
    (e) => new Map(e.gameweeks.map((g) => [g.gw, g.event_points ?? 0])),
  );
  const allGws = [
    ...new Set(entries.flatMap((e) => e.gameweeks.map((g) => g.gw))),
  ].sort((a, b) => a - b);
  const maxGwPoints = Math.max(
    1,
    ...entries.flatMap((e) => e.gameweeks.map((g) => g.event_points ?? 0)),
  );

  return (
    <main className="mx-auto max-w-6xl p-6">
      <Header />
      <h1 className="mb-6 font-display text-3xl font-bold tracking-tight">
        Compare players
      </h1>

      <section className={`mb-8 grid gap-3 ${gridCols}`}>
        {entries.map((e, i) => {
          const p = e.player;
          return (
            <div
              key={p.player_id}
              className="rounded-lg border border-border bg-surface p-4 text-center"
            >
              <div className="flex justify-center">
                <PlayerPhoto
                  src={p.photo_url}
                  alt={p.web_name}
                  size={72}
                  priority
                />
              </div>
              <h2 className="mt-2 font-display text-base font-semibold leading-tight">
                {p.first_name} {p.second_name}
              </h2>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted">
                <Image
                  src={badgeUrl(p.team_code)}
                  alt=""
                  width={16}
                  height={16}
                />
                {teamName(p.team_code)} · {p.position}
              </p>
            </div>
          );
        })}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg font-semibold">
          Season stats
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-background text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Stat</th>
                {entries.map((e, i) => (
                  <th
                    key={e.player.player_id}
                    className="px-3 py-2 text-right font-medium"
                  >
                    <span
                      className={`mr-1.5 inline-block h-2 w-2 rounded-sm align-middle ${BAR_CLASSES[i]}`}
                    />
                    {e.player.web_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STAT_ROWS.map((row) => {
                const values = entries.map(
                  (e) => e.player.season_stats?.[row.key] ?? null,
                );
                const nums = values.filter((v): v is number => v !== null);
                const best = nums.length > 0 ? Math.max(...nums) : null;
                return (
                  <tr
                    key={row.key}
                    className="border-t border-border hover:bg-background"
                  >
                    <td className="px-3 py-1.5 text-muted">{row.label}</td>
                    {values.map((v, i) => (
                      <td
                        key={entries[i].player.player_id}
                        className="px-3 py-1.5 text-right"
                      >
                        {best !== null && v === best ? (
                          <span className="rounded bg-accent/15 px-1.5 py-0.5 font-semibold">
                            {row.format(v)}
                          </span>
                        ) : (
                          row.format(v)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">
          Points per gameweek
        </h2>
        <div className="mb-2 flex flex-wrap gap-4">
          {entries.map((e, i) => (
            <span
              key={e.player.player_id}
              className="flex items-center gap-1.5 text-xs text-muted"
            >
              <span
                className={`h-2.5 w-2.5 rounded-sm ${BAR_CLASSES[i]}`}
              />
              {e.player.web_name}
            </span>
          ))}
        </div>
        {allGws.length === 0 ? (
          <p className="text-sm text-muted">No gameweek data.</p>
        ) : (
          <div className="flex gap-[3px] overflow-x-auto rounded-lg border border-border bg-surface p-4">
            {allGws.map((gw) => {
              const groupBest = Math.max(
                0,
                ...pointsByGw.map((m) => m.get(gw) ?? 0),
              );
              return (
                <div
                  key={gw}
                  className="flex min-w-5 flex-1 flex-col items-center gap-1"
                  title={`GW${gw}: ${entries
                    .map(
                      (e, i) =>
                        `${e.player.web_name} ${pointsByGw[i].get(gw) ?? "–"}`,
                    )
                    .join(", ")}`}
                >
                  {/* fixed-height label row keeps every column aligned */}
                  <span className="h-3.5 text-[10px] tabular-nums text-muted">
                    {groupBest}
                  </span>
                  <div className="flex h-24 w-full items-end gap-0.5">
                    {pointsByGw.map((m, i) => {
                      const pts = m.get(gw);
                      if (pts === undefined)
                        return <div key={i} className="flex-1" />;
                      const pct = (pts / maxGwPoints) * 100;
                      return (
                        <div key={i} className="flex flex-1 items-end self-stretch">
                          {pts > 0 ? (
                            <div
                              className={`w-full rounded-sm ${BAR_CLASSES[i]}`}
                              style={{ height: `${Math.max(pct, 2)}%` }}
                            />
                          ) : (
                            <div className="h-0.5 w-full rounded-sm bg-border" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <span className="text-[10px] text-muted">{gw}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
