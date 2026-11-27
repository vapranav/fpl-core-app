import Image from "next/image";
import Link from "next/link";
import { PlayerPhoto } from "@/components/player-photo";
import { Select, inputClass } from "@/components/select";
import {
  badgeUrl,
  getPlayers,
  getTeams,
  POSITIONS,
  SORTABLE,
  type PlayersQuery,
  type PlayerStats,
} from "@/lib/api";

const PAGE_SIZE = 50;

const CELLS: Record<string, (s: PlayerStats) => React.ReactNode> = {
  total_points: (s) => fmt(s.total_points, 0),
  form: (s) => fmt(s.form),
  now_cost: (s) => `£${fmt(s.now_cost)}m`,
  selected_by_percent: (s) => `${fmt(s.selected_by_percent)}%`,
  expected_goals: (s) => fmt(s.expected_goals),
  expected_assists: (s) => fmt(s.expected_assists),
  goals_scored: (s) => fmt(s.goals_scored, 0),
  assists: (s) => fmt(s.assists, 0),
  minutes: (s) => fmt(s.minutes, 0),
  defensive_contribution: (s) => fmt(s.defensive_contribution, 0),
  ict_index: (s) => fmt(s.ict_index),
  points_per_game: (s) => fmt(s.points_per_game),
};

function buildQuery(base: PlayersQuery, over: PlayersQuery): string {
  const merged: PlayersQuery = { ...base, ...over };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, String(v));
  const s = qs.toString();
  return s ? `?${s}` : "/";
}

function fmt(v: number | null, digits = 1): string {
  return v === null || v === undefined ? "–" : v.toFixed(digits);
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<PlayersQuery>;
}) {
  const sp = await searchParams;
  const query: PlayersQuery = {
    position: sp.position,
    team_code: sp.team_code,
    search: sp.search,
    sort: sp.sort ?? "total_points",
    order: sp.order ?? "desc",
    limit: String(PAGE_SIZE),
    offset: sp.offset ?? "0",
  };

  const [data, teamsData] = await Promise.all([
    getPlayers(query),
    getTeams(sp.season),
  ]);
  const teams = [...teamsData.teams].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const offset = Number(query.offset);
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Players
        </h1>
        <p className="text-muted text-sm">
          Season {data.season} · {data.total} players
        </p>
      </header>

      <form method="GET" className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="search"
          placeholder="Search player…"
          defaultValue={query.search}
          className={inputClass}
        />
        <Select name="position" defaultValue={query.position ?? ""}>
          <option value="">All positions</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Select name="team_code" defaultValue={query.team_code ?? ""}>
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name}
            </option>
          ))}
        </Select>
        <input type="hidden" name="sort" value={query.sort} />
        <input type="hidden" name="order" value={query.order} />
        <button
          type="submit"
          className="bg-accent rounded-md px-4 py-2 text-sm font-medium text-white dark:text-neutral-900"
        >
          Filter
        </button>
        <Link href="/" className="text-muted px-2 py-2 text-sm underline">
          Reset
        </Link>
      </form>

      <div className="border-border bg-surface overflow-x-auto rounded-lg border">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-background text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">
                Pos
              </th>
              {SORTABLE.map((c) => {
                const active = query.sort === c.key;
                const nextOrder =
                  active && query.order === "desc" ? "asc" : "desc";
                return (
                  <th
                    key={c.key}
                    className={`px-3 py-2 text-right font-medium ${c.hide ?? ""}`}
                  >
                    <Link
                      href={buildQuery(query, {
                        sort: c.key,
                        order: nextOrder,
                        offset: "0",
                      })}
                      className={
                        active
                          ? "font-bold underline"
                          : "text-muted hover:text-foreground hover:underline"
                      }
                      title={`Sort by ${c.label}`}
                    >
                      {c.label}
                      {active ? (query.order === "desc" ? " ↓" : " ↑") : ""}
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.players.map((p, i) => (
              <tr
                key={p.player_id}
                className="border-border hover:bg-background border-t transition-colors"
              >
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <PlayerPhoto
                      src={p.photo_url}
                      alt={p.web_name}
                      priority={i < 10}
                    />
                    <Link
                      href={`/players/${p.player_id}`}
                      className="font-medium hover:underline"
                    >
                      {p.web_name}
                    </Link>
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Image
                      src={badgeUrl(p.team_code)}
                      alt={p.team_name}
                      width={18}
                      height={18}
                      sizes="18px"
                      priority={i < 10}
                    />
                    <span className="hidden sm:inline">{p.team_name}</span>
                  </div>
                </td>
                <td className="hidden px-3 py-1.5 md:table-cell">
                  {p.position.slice(0, 3).toUpperCase()}
                </td>
                {SORTABLE.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-1.5 text-right ${c.hide ?? ""} ${
                      c.key === "total_points" ? "font-semibold" : ""
                    }`}
                  >
                    {CELLS[c.key](p.stats)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted">
          Page {page} of {pages}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={buildQuery(query, { offset: String(offset - PAGE_SIZE) })}
              className="border-border bg-surface rounded-md border px-3 py-1.5"
            >
              ← Prev
            </Link>
          )}
          {page < pages && (
            <Link
              href={buildQuery(query, { offset: String(offset + PAGE_SIZE) })}
              className="border-border bg-surface rounded-md border px-3 py-1.5"
            >
              Next →
            </Link>
          )}
        </div>
      </nav>
    </main>
  );
}
