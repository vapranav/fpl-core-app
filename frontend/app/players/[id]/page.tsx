import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayerPhoto } from "@/components/player-photo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  badgeUrl,
  getPlayer,
  getPlayerGameweeks,
  getPlayerMatches,
  getTeams,
  type MatchInfo,
  type PlayerMatchRow,
} from "@/lib/api";

const COMPETITIONS: Record<string, string> = {
  prem: "PL",
  "champions-league": "UCL",
  "europa-league": "UEL",
  "conference-league": "UECL",
  "fa-cup": "FA Cup",
  "league-cup": "EFL Cup",
  "efl-cup": "EFL Cup",
  "pre-season": "Friendly",
};

function competitionOf(matchId: string): string {
  // slug shape: "25-26-prem-arsenal-vs-chelsea" or legacy numeric id
  const slug = matchId.split("-").slice(2).join("-");
  for (const [key, label] of Object.entries(COMPETITIONS)) {
    if (slug.startsWith(key)) return label;
  }
  return "Cup";
}

const tidyName = (s: string) =>
  s
    .split("-")
    // 26/27 slugs append a date (…-2026-09-08): drop all-digit tokens
    .filter((w) => w && !/^\d+$/.test(w))
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** Club names from the slug — needed when a team code is null (non-PL opponents
 *  in cups/Europe aren't in the FPL teams table). */
function slugClubs(matchId: string): { home: string; away: string } {
  const rest = matchId.split("-").slice(2).join("-");
  const [left = "", right = ""] = rest.split("-vs-");
  let home = left;
  for (const key of Object.keys(COMPETITIONS).sort((a, b) => b.length - a.length)) {
    if (home.startsWith(key + "-")) {
      home = home.slice(key.length + 1);
      break;
    }
  }
  return { home: tidyName(home), away: tidyName(right) };
}

function BadgePlaceholder() {
  return (
    <span
      className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-border text-muted"
      aria-label="No badge available"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5z" />
      </svg>
    </span>
  );
}

function resultOf(m: MatchInfo, playerTeam: number): { label: string; cls: string } {
  if (m.home_score === null || m.away_score === null)
    return { label: "–", cls: "text-muted" };
  const gf = m.home_team === playerTeam ? m.home_score : m.away_score;
  const ga = m.home_team === playerTeam ? m.away_score : m.home_score;
  if (gf > ga) return { label: "W", cls: "bg-green-600/15 text-green-600 dark:text-green-400" };
  if (gf < ga) return { label: "L", cls: "bg-red-600/15 text-red-600 dark:text-red-400" };
  return { label: "D", cls: "bg-neutral-500/15 text-muted" };
}

function fmt(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "–" : v.toFixed(digits);
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { id } = await params;
  const { season } = await searchParams;
  const playerId = Number(id);
  if (!Number.isInteger(playerId)) notFound();

  let player, gameweeks, matches, teamsData;
  try {
    [player, gameweeks, matches, teamsData] = await Promise.all([
      getPlayer(playerId, season),
      getPlayerGameweeks(playerId, season),
      getPlayerMatches(playerId, season),
      getTeams(season),
    ]);
  } catch {
    notFound();
  }

  const teamName = (code: number) =>
    teamsData.teams.find((t) => t.code === code)?.short_name ?? `#${code}`;

  const s = player.season_stats;
  const gwRows = gameweeks.gameweeks;
  const maxGwPoints = Math.max(1, ...gwRows.map((g) => g.event_points ?? 0));

  const pastClubs = [
    ...new Set(
      player.team_history
        .map((h) => h.team_code)
        .filter((c) => c !== player.team_code),
    ),
  ];

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-muted hover:underline">
            ← All players
          </Link>
          <Link
            href={`/compare?ids=${player.player_id}`}
            className="text-muted hover:underline"
          >
            Compare
          </Link>
        </div>
        <ThemeToggle />
      </header>

      <section className="mb-6 flex flex-wrap items-center gap-5">
        <PlayerPhoto
          src={player.photo_url}
          alt={player.web_name}
          size={96}
          priority
        />
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {player.first_name} {player.second_name}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            <Image
              src={badgeUrl(player.team_code)}
              alt=""
              width={20}
              height={20}
            />
            {teamName(player.team_code)} · {player.position} · Season{" "}
            {player.season}
          </p>
          {pastClubs.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              Earlier this season: {pastClubs.map(teamName).join(", ")}
            </p>
          )}
        </div>
      </section>

      {s && (
        <section className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total points" value={fmt(s.total_points, 0)} />
          <StatCard label="Form" value={fmt(s.form)} />
          <StatCard label="Price" value={`£${fmt(s.now_cost)}m`} />
          <StatCard label="Ownership" value={`${fmt(s.selected_by_percent)}%`} />
          <StatCard
            label="xG / xA"
            value={`${fmt(s.expected_goals)} / ${fmt(s.expected_assists)}`}
          />
          <StatCard label="Minutes" value={fmt(s.minutes, 0)} />
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg font-semibold">
          Points per gameweek
        </h2>
        {gwRows.length === 0 ? (
          <p className="text-sm text-muted">No gameweek data.</p>
        ) : (
          <div className="flex gap-[3px] overflow-x-auto rounded-lg border border-border bg-surface p-4">
            {gwRows.map((g) => {
              const pts = g.event_points ?? 0;
              const pct = (pts / maxGwPoints) * 100;
              return (
                <div
                  key={g.gw}
                  className="flex min-w-5 flex-1 flex-col items-center gap-1"
                  title={`GW${g.gw}: ${pts} pts, ${fmt(g.minutes, 0)} min`}
                >
                  {/* fixed-height label row keeps every column aligned */}
                  <span className="h-3.5 text-[10px] tabular-nums text-muted">
                    {pts}
                  </span>
                  <div className="flex h-24 w-full items-end">
                    <div
                      className={
                        pts > 0
                          ? "w-full rounded-sm bg-accent/80"
                          : "h-0.5 w-full rounded-sm bg-border"
                      }
                      style={pts > 0 ? { height: `${Math.max(pct, 2)}%` } : undefined}
                    />
                  </div>
                  <span className="text-[10px] text-muted">{g.gw}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">
          Matches ({matches.matches.length})
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-background text-left">
              <tr>
                {["GW", "Comp", "Match", "", "Min", "G", "A", "xG", "xA", "Def"].map(
                  (h) => (
                    <th key={h} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {matches.matches.map((row: PlayerMatchRow) => {
                const m = row.match;
                const home = m.home_team === player.team_code;
                const opp = home ? m.away_team : m.home_team;
                const clubs = slugClubs(row.match_id);
                const oppName =
                  opp !== null ? teamName(opp) : home ? clubs.away : clubs.home;
                const res = resultOf(m, player.team_code);
                const def =
                  (row.clearances ?? 0) +
                  (row.blocks ?? 0) +
                  (row.interceptions ?? 0) +
                  (row.tackles_won ?? 0);
                return (
                  <tr
                    key={row.match_id}
                    className="border-t border-border hover:bg-background"
                  >
                    <td className="px-3 py-1.5 text-muted">{row.gw ?? "–"}</td>
                    <td className="px-3 py-1.5">
                      <span className="rounded bg-background px-1.5 py-0.5 text-xs text-muted">
                        {competitionOf(row.match_id)}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        {opp !== null ? (
                          <Image
                            src={badgeUrl(opp)}
                            alt=""
                            width={16}
                            height={16}
                            className="inline"
                          />
                        ) : (
                          <BadgePlaceholder />
                        )}
                        {oppName}
                        <span className="text-xs text-muted">
                          ({home ? "H" : "A"})
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`inline-block w-6 rounded text-center text-xs font-semibold ${res.cls}`}
                      >
                        {res.label}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right">{fmt(row.minutes_played, 0)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{fmt(row.goals, 0)}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(row.assists, 0)}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(row.xg, 2)}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(row.xa, 2)}</td>
                    <td className="px-3 py-1.5 text-right">{def}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Def = clearances + blocks + interceptions + tackles won
        </p>
      </section>
    </main>
  );
}
