import Link from "next/link";
import { Select } from "@/components/select";
import { TeamBadge } from "@/components/team-badge";
import { getGameweeks, getMatches, getTeams, type MatchInfo } from "@/lib/api";
import { fmtKickoff } from "@/lib/format";
import { competitionOf, slugClubs } from "@/lib/slugs";

function MatchRow({
  m,
  teamName,
}: {
  m: MatchInfo;
  teamName: (code: number) => string | undefined;
}) {
  const clubs = slugClubs(m.match_id);
  const homeName =
    (m.home_team !== null ? teamName(m.home_team) : undefined) ?? clubs.home;
  const awayName =
    (m.away_team !== null ? teamName(m.away_team) : undefined) ?? clubs.away;
  const played = m.home_score !== null && m.away_score !== null;
  return (
    <tr className="border-border hover:bg-background border-t transition-colors">
      <td className="px-3 py-1.5">
        <span className="bg-background text-muted rounded px-1.5 py-0.5 text-xs">
          {competitionOf(m.match_id)}
        </span>
      </td>
      <td className="px-3 py-1.5">
        <Link
          href={`/matches/${encodeURIComponent(m.match_id)}`}
          className="group inline-flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          <span className="inline-flex items-center gap-1.5">
            <TeamBadge code={m.home_team} />
            <span className="group-hover:underline">{homeName}</span>
          </span>
          <span className="font-semibold tabular-nums">
            {played ? `${m.home_score}–${m.away_score}` : "vs"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="group-hover:underline">{awayName}</span>
            <TeamBadge code={m.away_team} />
          </span>
        </Link>
      </td>
      <td className="text-muted hidden px-3 py-1.5 sm:table-cell">
        {m.gameweek !== null ? `GW${m.gameweek}` : "–"}
      </td>
      <td className="text-muted hidden px-3 py-1.5 md:table-cell">
        {fmtKickoff(m.kickoff_time)}
      </td>
      <td className="text-accent px-3 py-1.5 text-right text-xs font-medium">
        <Link href={`/matches/${encodeURIComponent(m.match_id)}`}>
          Timeline →
        </Link>
      </td>
    </tr>
  );
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ gw?: string; team?: string }>;
}) {
  const sp = await searchParams;
  const [{ season, total, matches }, teamsData, gwsData] = await Promise.all([
    getMatches({ gw: sp.gw, team_code: sp.team, limit: "500" }),
    getTeams(),
    getGameweeks(),
  ]);
  const teamName = (code: number) =>
    teamsData.teams.find((t) => t.code === code)?.name;
  // API returns kickoff-ascending; show most recent first
  const rows = [...matches].reverse();

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Matches
        </h1>
        <p className="text-muted text-sm">
          Season {season} · {total} matches · open a match for its xG flow,
          momentum and shot map
        </p>
      </header>

      <form method="GET" className="mb-4 flex flex-wrap items-center gap-2">
        <Select name="gw" defaultValue={sp.gw ?? ""}>
          <option value="">All gameweeks</option>
          {gwsData.gameweeks.map((g) => (
            <option key={g.id} value={String(g.id)}>
              GW{g.id}
            </option>
          ))}
        </Select>
        <Select name="team" defaultValue={sp.team ?? ""}>
          <option value="">All teams</option>
          {teamsData.teams.map((t) => (
            <option key={t.code} value={String(t.code)}>
              {t.name}
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

      <div className="border-border bg-surface overflow-x-auto rounded-lg border">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-background text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Comp</th>
              <th className="px-3 py-2 font-medium">Match</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">GW</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">
                Kickoff (UTC)
              </th>
              <th className="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <MatchRow key={m.match_id} m={m} teamName={teamName} />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="text-muted p-4 text-sm">
            No matches for this selection.
          </p>
        )}
      </div>
    </main>
  );
}
