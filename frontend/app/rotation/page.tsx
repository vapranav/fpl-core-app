import Image from "next/image";
import Link from "next/link";
import { PlayerPhoto } from "@/components/player-photo";
import { Select } from "@/components/select";
import { badgeUrl, getRotationRisk, type RotationRisk } from "@/lib/api";

const DAY_OPTIONS = ["2", "3", "4", "5"];

const RISK_STYLES: Record<RotationRisk["risk_label"], string> = {
  High: "bg-red-600/15 text-red-700 dark:text-red-400",
  Medium: "bg-orange-600/15 text-orange-700 dark:text-orange-400",
  Low: "bg-green-600/15 text-green-700 dark:text-green-400",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "–";
  return new Date(`${iso}Z`).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function RotationPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const days = sp.days ?? "3";
  const data = await getRotationRisk({ days });

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Rotation &amp; fatigue radar
        </h1>
        <p className="text-muted text-sm">
          Season {data.season} · players whose club played a cup/European match
          within {data.days} day{data.days === 1 ? "" : "s"} of their next
          league fixture
        </p>
      </header>

      <form method="GET" className="mb-4 flex flex-wrap items-center gap-2">
        <Select name="days" defaultValue={days}>
          {DAY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              Within {d} days
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
          No midweek fixtures inside the window — nobody is at rotation risk
          right now.
        </p>
      ) : (
        <div className="border-border bg-surface overflow-x-auto rounded-lg border">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-background text-left">
              <tr>
                {[
                  "Player",
                  "Midweek match",
                  "Next fixture",
                  "Min Δ",
                  "Risk",
                ].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.players.map((p) => (
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
                        <div className="text-muted flex items-center gap-1 text-xs">
                          <Image
                            src={badgeUrl(p.team_code)}
                            alt=""
                            width={14}
                            height={14}
                          />
                          {p.team_name} · {p.position.slice(0, 3).toUpperCase()}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="bg-background text-muted mr-1.5 rounded px-1.5 py-0.5 text-xs">
                      {p.midweek.competition}
                    </span>
                    <span className="text-muted">
                      {fmtDate(p.midweek.kickoff_time)}
                    </span>
                    <span className="ml-1.5 font-medium">
                      {p.midweek.minutes}&prime;
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      {p.next_fixture.opp_code !== null && (
                        <Image
                          src={badgeUrl(p.next_fixture.opp_code)}
                          alt=""
                          width={16}
                          height={16}
                        />
                      )}
                      {p.next_fixture.opp_name ?? "?"}
                      <span className="text-muted text-xs">
                        ({p.next_fixture.home ? "H" : "A"})
                      </span>
                    </span>
                    <div className="text-muted text-xs">
                      {fmtDate(p.next_fixture.kickoff_time)}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {p.history.delta === null ? (
                      <span
                        className="text-muted"
                        title="No previous post-midweek league matches"
                      >
                        –
                      </span>
                    ) : (
                      <span
                        className={
                          p.history.delta < 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-green-600 dark:text-green-400"
                        }
                        title={`Avg ${p.history.avg_minutes_after}' after midweek vs ${p.history.baseline_minutes}' baseline (n=${p.history.sample})`}
                      >
                        {p.history.delta > 0 ? "+" : ""}
                        {p.history.delta}&prime;
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${RISK_STYLES[p.risk_label]}`}
                    >
                      {p.risk_label} {p.risk.toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-muted mt-2 text-xs">
        Risk = midweek minutes / 90 + minutes-drop penalty. Min Δ = average
        league minutes after midweek matches vs. season baseline (their own
        history, when available).
      </p>
    </main>
  );
}
