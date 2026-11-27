import Image from "next/image";
import Link from "next/link";
import { PlayerPhoto } from "@/components/player-photo";
import { Select } from "@/components/select";
import {
  badgeUrl,
  getDifferentials,
  POSITIONS,
  type NextFixture,
} from "@/lib/api";

const OWNERSHIP_OPTIONS = ["5", "10", "15", "20"];

function fmt(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "–" : v.toFixed(digits);
}

function FixturePill({ f, avgElo }: { f: NextFixture; avgElo: number }) {
  // greener the softer the opponent (below league average Elo)
  const soft = f.opp_elo !== null && f.opp_elo < avgElo;
  const cls = soft
    ? "border-green-600/40 bg-green-600/10 text-green-700 dark:text-green-400"
    : "border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-400";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs ${cls}`}
      title={
        f.opp_elo
          ? `Opponent Elo ${Math.round(f.opp_elo)}`
          : "Opponent Elo unknown"
      }
    >
      {f.opp_code !== null ? (
        <Image src={badgeUrl(f.opp_code)} alt="" width={14} height={14} />
      ) : (
        <span className="bg-border inline-block h-3.5 w-3.5 rounded-sm" />
      )}
      {f.opp_name ?? "?"} ({f.home ? "H" : "A"})
    </span>
  );
}

export default async function DifferentialsPage({
  searchParams,
}: {
  searchParams: Promise<{ max_ownership?: string; position?: string }>;
}) {
  const sp = await searchParams;
  const maxOwnership = sp.max_ownership ?? "10";
  const data = await getDifferentials({
    max_ownership: maxOwnership,
    position: sp.position,
  });

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Differentials
        </h1>
        <p className="text-muted text-sm">
          Season {data.season} · owned by ≤{data.max_ownership}% · league avg
          Elo {data.league_avg_elo}
        </p>
      </header>

      <form method="GET" className="mb-4 flex flex-wrap items-center gap-2">
        <Select name="max_ownership" defaultValue={maxOwnership}>
          {OWNERSHIP_OPTIONS.map((o) => (
            <option key={o} value={o}>
              Ownership ≤ {o}%
            </option>
          ))}
        </Select>
        <Select name="position" defaultValue={sp.position ?? ""}>
          <option value="">All positions</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
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
              {[
                ["Player", ""],
                ["Own%", ""],
                ["Form", "hidden md:table-cell"],
                ["PPG", "hidden md:table-cell"],
                ["xGI/90", "hidden lg:table-cell"],
                ["Ease", "hidden lg:table-cell"],
                ["Next 3 fixtures", ""],
                ["Score", ""],
              ].map(([h, cls]) => (
                <th key={h} className={`px-3 py-2 font-medium ${cls}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.differentials.map((d) => (
              <tr
                key={d.player_id}
                className="border-border hover:bg-background border-t transition-colors"
              >
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <PlayerPhoto src={d.photo_url} alt={d.web_name} size={36} />
                    <div>
                      <Link
                        href={`/players/${d.player_id}`}
                        className="font-medium hover:underline"
                      >
                        {d.web_name}
                      </Link>
                      <div className="text-muted flex items-center gap-1 text-xs">
                        <Image
                          src={badgeUrl(d.team_code)}
                          alt=""
                          width={14}
                          height={14}
                        />
                        {d.team_name} · {d.position.slice(0, 3).toUpperCase()}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right">{fmt(d.ownership)}%</td>
                <td className="hidden px-3 py-1.5 text-right md:table-cell">
                  {fmt(d.form)}
                </td>
                <td className="hidden px-3 py-1.5 text-right md:table-cell">
                  {fmt(d.points_per_game)}
                </td>
                <td className="hidden px-3 py-1.5 text-right lg:table-cell">
                  {fmt(d.xgi_per_90, 2)}
                </td>
                <td
                  className={`hidden px-3 py-1.5 text-right lg:table-cell ${
                    d.fixture_ease > 0
                      ? "text-green-600 dark:text-green-400"
                      : d.fixture_ease < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted"
                  }`}
                >
                  {d.fixture_ease > 0 ? "+" : ""}
                  {fmt(d.fixture_ease, 2)}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {d.next_fixtures.map((f, i) => (
                      <FixturePill key={i} f={f} avgElo={data.league_avg_elo} />
                    ))}
                    {d.next_fixtures.length === 0 && (
                      <span className="text-muted text-xs">–</span>
                    )}
                  </div>
                </td>
                <td className="text-accent px-3 py-1.5 text-right font-semibold">
                  {fmt(d.score, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted mt-2 text-xs">
        Score = form + 2 × (xG+xA)/90 + points per game + fixture ease (league
        avg Elo − mean Elo of next 3 opponents, scaled). Green fixtures sit
        below league-average Elo.
      </p>
    </main>
  );
}
