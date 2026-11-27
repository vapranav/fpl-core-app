import Image from "next/image";
import Link from "next/link";
import { PlayerPhoto } from "@/components/player-photo";
import {
  badgeUrl,
  getDifferentials,
  getGameweeks,
  getPlayers,
} from "@/lib/api";

const FEATURES = [
  {
    href: "/players",
    title: "Players explorer",
    desc: "Every player, sortable by points, form, price, xG, defensive contribution and more — with photos and club badges.",
  },
  {
    href: "/differentials",
    title: "Differentials finder",
    desc: "Low-ownership players in form with soft upcoming fixtures, scored with team Elo. Find the gems the crowd is sleeping on.",
  },
  {
    href: "/compare",
    title: "Compare players",
    desc: "Side-by-side season stats and per-gameweek points charts for up to four players.",
  },
];

export default async function HomePage() {
  const [gameweeks, formPlayers, differentials] = await Promise.all([
    getGameweeks(),
    getPlayers({ sort: "form", order: "desc", limit: "5" }),
    getDifferentials({ max_ownership: "5" }),
  ]);

  // first unfinished GW: that's the one worth planning for. is_current lags
  // (it marks the GW still being scored, whose deadline has already passed)
  const gw = gameweeks.gameweeks.find((g) => !g.finished);
  const now = new Date();
  // API stores naive UTC datetimes; without the Z, JS would parse as local
  const deadlineAt = gw?.deadline_time
    ? new Date(`${gw.deadline_time}Z`)
    : null;
  const inProgress = deadlineAt !== null && now >= deadlineAt;
  const deadline = deadlineAt?.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <section className="mt-8 mb-10">
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
          FPL Core
        </h1>
        <p className="text-muted mt-3 max-w-xl">
          Fantasy Premier League analytics: official FPL data fused with
          Opta-like match stats and team Elo ratings, refreshed twice daily.
        </p>
        {gw && (
          <p className="border-border bg-surface mt-3 inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border px-3 py-1.5 text-sm">
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  inProgress
                    ? "bg-green-600 dark:bg-green-400"
                    : "bg-orange-700 dark:bg-orange-500"
                }`}
                title={
                  inProgress
                    ? "Gameweek in progress"
                    : "Deadline not reached yet"
                }
              />
              <span className="font-medium">{gw.name}</span>
            </span>
            {deadline && (
              <span className="text-muted">deadline {deadline}</span>
            )}
            <span className="text-muted text-xs">
              {inProgress ? "in progress" : "upcoming"}
            </span>
          </p>
        )}
      </section>

      <section className="mb-10 grid gap-3 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="group border-border bg-surface hover:border-accent rounded-lg border p-5 transition-colors"
          >
            <h2 className="font-display group-hover:text-accent text-lg font-semibold">
              {f.title}
            </h2>
            <p className="text-muted mt-1.5 text-sm">{f.desc}</p>
          </Link>
        ))}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold">In form</h2>
            <Link
              href="/players?sort=form"
              className="text-muted text-sm hover:underline"
            >
              All players →
            </Link>
          </div>
          <div className="border-border bg-surface overflow-hidden rounded-lg border">
            {formPlayers.players.map((p, i) => (
              <Link
                key={p.player_id}
                href={`/players/${p.player_id}`}
                className={`hover:bg-background flex items-center gap-3 px-4 py-2.5 transition-colors ${
                  i > 0 ? "border-border border-t" : ""
                }`}
              >
                <PlayerPhoto src={p.photo_url} alt={p.web_name} size={32} />
                <span className="font-medium">{p.web_name}</span>
                <span className="text-muted flex items-center gap-1 text-xs">
                  <Image
                    src={badgeUrl(p.team_code)}
                    alt=""
                    width={14}
                    height={14}
                  />
                  {p.team_name}
                </span>
                <span className="text-muted ml-auto text-sm tabular-nums">
                  form{" "}
                  <span className="text-foreground font-semibold">
                    {p.stats.form?.toFixed(1)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold">
              Top differentials
            </h2>
            <Link
              href="/differentials"
              className="text-muted text-sm hover:underline"
            >
              All differentials →
            </Link>
          </div>
          <div className="border-border bg-surface overflow-hidden rounded-lg border">
            {differentials.differentials.slice(0, 5).map((d, i) => (
              <Link
                key={d.player_id}
                href={`/players/${d.player_id}`}
                className={`hover:bg-background flex items-center gap-3 px-4 py-2.5 transition-colors ${
                  i > 0 ? "border-border border-t" : ""
                }`}
              >
                <PlayerPhoto src={d.photo_url} alt={d.web_name} size={32} />
                <span className="font-medium">{d.web_name}</span>
                <span className="text-muted text-xs">{d.team_name}</span>
                <span className="text-muted ml-auto text-sm tabular-nums">
                  {d.ownership?.toFixed(1)}% own · score{" "}
                  <span className="text-accent font-semibold">
                    {d.score.toFixed(1)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
