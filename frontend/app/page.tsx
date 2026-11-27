import Image from "next/image";
import Link from "next/link";
import { PlayerPhoto } from "@/components/player-photo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  badgeUrl,
  getPlayers,
  getTeams,
  POSITIONS,
  SORTABLE,
  type PlayersQuery,
} from "@/lib/api";

const PAGE_SIZE = 50;

const controlClass =
  "rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground";

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

function Select({
  name,
  defaultValue,
  children,
}: {
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <span className="relative inline-block">
      <select
        name={name}
        defaultValue={defaultValue}
        className={`${controlClass} appearance-none pr-9`}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
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
  const teams = [...teamsData.teams].sort((a, b) => a.name.localeCompare(b.name));
  const offset = Number(query.offset);
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-accent">
            FPL Core
          </h1>
          <p className="text-sm text-muted">
            Season {data.season} · {data.total} players
          </p>
        </div>
        <ThemeToggle />
      </header>

      <form method="GET" className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="search"
          placeholder="Search player…"
          defaultValue={query.search}
          className={controlClass}
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
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white dark:text-neutral-900"
        >
          Filter
        </button>
        <Link href="/" className="px-2 py-2 text-sm text-muted underline">
          Reset
        </Link>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-background text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-3 py-2 font-medium">Pos</th>
              {SORTABLE.map((c) => {
                const active = query.sort === c.key;
                const nextOrder = active && query.order === "desc" ? "asc" : "desc";
                return (
                  <th key={c.key} className="px-3 py-2 text-right font-medium">
                    <Link
                      href={buildQuery(query, {
                        sort: c.key,
                        order: nextOrder,
                        offset: "0",
                      })}
                      className={active ? "font-bold text-accent underline" : "hover:underline"}
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
                className="border-t border-border transition-colors hover:bg-background"
              >
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <PlayerPhoto src={p.photo_url} alt={p.web_name} priority={i < 10} />
                    <Link
                      href={`/players/${p.player_id}`}
                      className="font-medium hover:text-accent hover:underline"
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
                    <span>{p.team_name}</span>
                  </div>
                </td>
                <td className="px-3 py-1.5">{p.position.slice(0, 3).toUpperCase()}</td>
                <td className="px-3 py-1.5 text-right font-semibold">
                  {fmt(p.stats.total_points, 0)}
                </td>
                <td className="px-3 py-1.5 text-right">{fmt(p.stats.form)}</td>
                <td className="px-3 py-1.5 text-right">£{fmt(p.stats.now_cost)}m</td>
                <td className="px-3 py-1.5 text-right">{fmt(p.stats.selected_by_percent)}%</td>
                <td className="px-3 py-1.5 text-right">{fmt(p.stats.expected_goals)}</td>
                <td className="px-3 py-1.5 text-right">{fmt(p.stats.expected_assists)}</td>
                <td className="px-3 py-1.5 text-right">{fmt(p.stats.goals_scored, 0)}</td>
                <td className="px-3 py-1.5 text-right">{fmt(p.stats.assists, 0)}</td>
                <td className="px-3 py-1.5 text-right">{fmt(p.stats.minutes, 0)}</td>
                <td className="px-3 py-1.5 text-right">{fmt(p.stats.defensive_contribution, 0)}</td>
                <td className="px-3 py-1.5 text-right">{fmt(p.stats.ict_index)}</td>
                <td className="px-3 py-1.5 text-right">{fmt(p.stats.points_per_game)}</td>
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
              className="rounded-md border border-border bg-surface px-3 py-1.5"
            >
              ← Prev
            </Link>
          )}
          {page < pages && (
            <Link
              href={buildQuery(query, { offset: String(offset + PAGE_SIZE) })}
              className="rounded-md border border-border bg-surface px-3 py-1.5"
            >
              Next →
            </Link>
          )}
        </div>
      </nav>
    </main>
  );
}
