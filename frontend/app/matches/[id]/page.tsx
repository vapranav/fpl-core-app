import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamBadge } from "@/components/team-badge";
import { MomentumChart } from "@/components/timeline/momentum-chart";
import { ShotMap } from "@/components/timeline/shot-map";
import { XgFlowChart } from "@/components/timeline/xg-flow";
import { getMatchTimeline, type ShotRow } from "@/lib/api";
import { LocalTime } from "@/components/local-time";
import { competitionOf, slugClubs } from "@/lib/slugs";

function fmt(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "–" : v.toFixed(digits);
}

function fmtMinute(s: ShotRow): string {
  if (s.minute === null) return "–";
  return `${s.minute}${s.added_time ? `+${s.added_time}` : ""}'`;
}

const OUTCOME_PILL: Record<string, string> = {
  goal: "bg-green-600/15 text-green-600 dark:text-green-400",
  save: "bg-sky-600/15 text-sky-600 dark:text-sky-400",
  block: "bg-amber-600/15 text-amber-600 dark:text-amber-400",
  "blocked-off-line": "bg-amber-600/15 text-amber-600 dark:text-amber-400",
  miss: "bg-neutral-500/15 text-muted",
  post: "bg-orange-600/15 text-orange-600 dark:text-orange-400",
};

function ShotsTable({
  shots,
  homeName,
  awayName,
}: {
  shots: ShotRow[];
  homeName: string;
  awayName: string;
}) {
  // newest first
  const rows = [...shots].sort(
    (a, b) =>
      (b.minute ?? 0) +
      (b.added_time ?? 0) / 10 -
      ((a.minute ?? 0) + (a.added_time ?? 0) / 10),
  );
  return (
    <div className="border-border bg-surface overflow-x-auto rounded-lg border">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-background text-left">
          <tr>
            {[
              "Min",
              "Player",
              "Team",
              "Situation",
              "Body",
              "xG",
              "xGOT",
              "",
            ].map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              key={s.shot_index}
              className="border-border hover:bg-background border-t"
            >
              <td className="text-muted px-3 py-1.5">{fmtMinute(s)}</td>
              <td className="px-3 py-1.5">{s.player_name || "–"}</td>
              <td className="text-muted px-3 py-1.5">
                {s.is_home === null ? "–" : s.is_home ? homeName : awayName}
              </td>
              <td className="text-muted hidden px-3 py-1.5 md:table-cell">
                {s.situation ?? "–"}
              </td>
              <td className="text-muted hidden px-3 py-1.5 md:table-cell">
                {s.body_part ?? "–"}
              </td>
              <td className="px-3 py-1.5 text-right">{fmt(s.xg, 2)}</td>
              <td className="px-3 py-1.5 text-right">{fmt(s.xgot, 2)}</td>
              <td className="px-3 py-1.5 text-right">
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-xs ${
                    OUTCOME_PILL[s.outcome ?? ""] ??
                    "text-muted bg-neutral-500/15"
                  }`}
                >
                  {s.outcome ?? "–"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { id } = await params;
  const { season } = await searchParams;

  let data;
  try {
    data = await getMatchTimeline(id, season);
  } catch {
    notFound();
  }
  const m = data.match;
  const clubs = slugClubs(m.match_id);
  const homeName = m.home_team_name ?? clubs.home;
  const awayName = m.away_team_name ?? clubs.away;
  const played = m.home_score !== null && m.away_score !== null;
  const hasTimeline =
    data.shots.length > 0 ||
    data.momentum.length > 0 ||
    data.xg_by_minute.length > 0;
  const goals = data.shots.filter((s) => s.outcome === "goal");

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6">
        <Link href="/matches" className="text-muted text-sm hover:underline">
          ← All matches
        </Link>
      </header>

      <section className="border-border bg-surface mb-8 rounded-lg border p-4 sm:p-6">
        <div className="text-muted mb-2 flex items-center gap-2 text-xs">
          <span className="bg-background rounded px-1.5 py-0.5">
            {competitionOf(m.match_id)}
          </span>
          {m.gameweek !== null && <span>GW{m.gameweek}</span>}
          <span>
            <LocalTime iso={m.kickoff_time} />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="flex items-center gap-2 text-lg font-semibold">
            <TeamBadge code={m.home_team} size={32} />
            {homeName}
          </span>
          <span className="font-display text-2xl font-bold tabular-nums">
            {played ? `${m.home_score}–${m.away_score}` : "vs"}
          </span>
          <span className="flex items-center gap-2 text-lg font-semibold">
            {awayName}
            <TeamBadge code={m.away_team} size={32} />
          </span>
        </div>
        {(m.home_team_elo !== null || m.away_team_elo !== null) && (
          <p className="text-muted mt-2 text-xs tabular-nums">
            Elo: {homeName} {fmt(m.home_team_elo, 0)} · {awayName}{" "}
            {fmt(m.away_team_elo, 0)}
          </p>
        )}
      </section>

      {!hasTimeline ? (
        <section className="border-border bg-surface rounded-lg border p-8 text-center">
          <p className="text-muted">
            Timeline data not available for this match.
          </p>
          <Link
            href="/matches"
            className="text-accent mt-2 inline-block text-sm hover:underline"
          >
            ← Back to all matches
          </Link>
        </section>
      ) : (
        <>
          {data.xg_by_minute.length > 0 && (
            <section className="mb-8">
              <h2 className="font-display mb-3 text-lg font-semibold">
                xG flow
              </h2>
              <div className="border-border bg-surface rounded-lg border p-4">
                <XgFlowChart
                  points={data.xg_by_minute}
                  goals={goals}
                  homeName={homeName}
                  awayName={awayName}
                />
              </div>
            </section>
          )}

          {data.momentum.length > 0 && (
            <section className="mb-8">
              <h2 className="font-display mb-3 text-lg font-semibold">
                Momentum
              </h2>
              <div className="border-border bg-surface rounded-lg border p-4">
                <MomentumChart
                  points={data.momentum}
                  homeName={homeName}
                  awayName={awayName}
                />
              </div>
            </section>
          )}

          {data.shots.length > 0 && (
            <>
              <section className="mb-8">
                <h2 className="font-display mb-3 text-lg font-semibold">
                  Shot map ({data.shots.length} shots)
                </h2>
                <div className="border-border bg-surface rounded-lg border p-4">
                  <ShotMap
                    shots={data.shots}
                    homeName={homeName}
                    awayName={awayName}
                  />
                </div>
              </section>

              <section>
                <h2 className="font-display mb-3 text-lg font-semibold">
                  Shots
                </h2>
                <ShotsTable
                  shots={data.shots}
                  homeName={homeName}
                  awayName={awayName}
                />
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
