"use client";

import Image from "next/image";
import Link from "next/link";
import { SquadPitch } from "./squad-pitch";
import { useEffect, useState } from "react";
import { useEntryId } from "./entry-id";
import { PlayerPhoto } from "./player-photo";
import { RankMovement } from "./rank-movement";
import { inputClass } from "./select";
import {
  ApiRequestError,
  badgeUrl,
  getManagerProfile,
  getManagerTeam,
  type ManagerLeague,
  type ManagerProfile,
  type ManagerTeam,
  type SquadPick,
} from "@/lib/api";

/** Accepts a raw entry id ("123456") or an FPL entry URL (".../entry/123456/..."). */
function parseEntryId(raw: string): number | null {
  const s = raw.trim();
  const digits = s.match(/entry\/(\d+)/)?.[1] ?? s;
  if (!/^\d+$/.test(digits)) return null;
  return Number(digits);
}

function fmtRank(rank: number | null): string {
  return rank === null ? "–" : rank.toLocaleString("en-GB");
}

function fmtMoney(millions: number): string {
  return `£${millions.toFixed(1)}m`;
}

export function MyTeam() {
  const [entryId, setEntryId] = useEntryId();

  if (entryId === null) return <ConnectCard onConnect={setEntryId} />;
  return (
    <Connected
      entryId={Number(entryId)}
      onDisconnect={() => setEntryId(null)}
    />
  );
}

// ---- connect form ---------------------------------------------------------

function ConnectCard({ onConnect }: { onConnect: (id: string) => void }) {
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = parseEntryId(value);
    if (id === null) {
      setError("Enter a numeric entry ID or an FPL entry URL");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      // validate against the API before saving
      await getManagerProfile(id);
      onConnect(String(id));
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.status === 404
          ? "Manager not found — check your ID"
          : "Could not reach the FPL API — try again",
      );
      setChecking(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <header className="mb-6 text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          My Team
        </h1>
        <p className="text-muted mt-1 text-sm">
          Connect your Fantasy Premier League team to see your squad and league
          standings.
        </p>
      </header>
      <form
        onSubmit={onSubmit}
        className="border-border bg-surface rounded-lg border p-6"
      >
        <label htmlFor="entry-id" className="mb-1 block text-sm font-medium">
          Entry ID or team URL
        </label>
        <input
          id="entry-id"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 10358528 or fantasy.premierleague.com/entry/10358528/"
          className={`${inputClass} w-full`}
          autoFocus
        />
        <p className="text-muted mt-1 text-xs">
          Find it in the URL of your team page on the official FPL site. Stored
          only in your browser.
        </p>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <button
          type="submit"
          disabled={checking}
          className="bg-accent mt-4 w-full rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:text-neutral-900"
        >
          {checking ? "Connecting…" : "Connect team"}
        </button>
      </form>
    </div>
  );
}

// ---- connected view -------------------------------------------------------

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; profile: ManagerProfile; team: ManagerTeam };

function Connected({
  entryId,
  onDisconnect,
}: {
  entryId: number;
  onDisconnect: () => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getManagerProfile(entryId), getManagerTeam(entryId)])
      .then(([profile, team]) => {
        if (!cancelled) setState({ status: "ok", profile, team });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const notFound = err instanceof ApiRequestError && err.status === 404;
        setState({
          status: "error",
          message: notFound
            ? "Manager not found — check your ID"
            : "Failed to load your team — try again",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  if (state.status === "loading") {
    return (
      <p className="text-muted border-border bg-surface rounded-lg border p-6 text-sm">
        Loading your team…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <div className="border-border bg-surface mx-auto max-w-md rounded-lg border p-6 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
        <button
          type="button"
          onClick={onDisconnect}
          className="border-border bg-background hover:bg-surface mt-4 rounded-md border px-4 py-2 text-sm"
        >
          Connect a different team
        </button>
      </div>
    );
  }

  const { profile, team } = state;
  return (
    <>
      <TeamHeader profile={profile} team={team} onDisconnect={onDisconnect} />
      <SquadSection team={team} />
      <LeagueCards leagues={profile.leagues} />
    </>
  );
}

function TeamHeader({
  profile,
  team,
  onDisconnect,
}: {
  profile: ManagerProfile;
  team: ManagerTeam;
  onDisconnect: () => void;
}) {
  const stats: { label: string; value: string }[] = [
    { label: "Overall rank", value: fmtRank(profile.overall_rank) },
    {
      label: "Overall points",
      value: profile.overall_points?.toLocaleString("en-GB") ?? "–",
    },
    {
      label: `GW${team.gw} points`,
      value: team.gw_points?.toLocaleString("en-GB") ?? "–",
    },
    { label: "Bank", value: fmtMoney(team.bank) },
    { label: "Squad value", value: fmtMoney(team.squad_value) },
    {
      label: "GW transfers",
      value:
        team.event_transfers === null
          ? "–"
          : `${team.event_transfers} (${team.event_transfers_cost ?? 0} pts)`,
    },
  ];

  return (
    <header className="border-border bg-surface mb-6 rounded-lg border p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {profile.team_name ?? "My Team"}
          </h1>
          <p className="text-muted text-sm">
            {profile.manager_name ?? "–"} · GW{team.gw}
          </p>
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          className="border-border bg-background hover:bg-background/60 text-muted hover:text-foreground rounded-md border px-3 py-1.5 text-sm transition-colors"
        >
          Disconnect
        </button>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="bg-background rounded-md p-3">
            <dt className="text-muted text-xs">{s.label}</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

// ---- squad: pitch or list ---------------------------------------------------

type SquadView = "pitch" | "list";

function SquadSection({ team }: { team: ManagerTeam }) {
  const [view, setView] = useState<SquadView>("pitch");
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Squad</h2>
        <div
          role="tablist"
          aria-label="Squad view"
          className="border-border bg-surface flex rounded-md border p-0.5 text-xs"
        >
          {(
            [
              ["pitch", "Pitch"],
              ["list", "List"],
            ] as [SquadView, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`rounded px-3 py-1 ${
                view === v
                  ? "bg-accent/10 text-accent font-semibold"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {view === "pitch" ? (
        <SquadPitch team={team} />
      ) : (
        <SquadTable picks={team.picks} />
      )}
    </section>
  );
}

function SquadTable({ picks }: { picks: SquadPick[] }) {
  const starters = picks.filter((p) => p.squad_position <= 11);
  const bench = picks.filter((p) => p.squad_position > 11);

  return (
    <div>
      <div className="border-border bg-surface overflow-x-auto rounded-lg border">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-background text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">
                Pos
              </th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                Form
              </th>
              <th className="px-3 py-2 text-right font-medium">Pts</th>
            </tr>
          </thead>
          <tbody>
            {starters.map((p, i) => (
              <PickRow key={p.element} pick={p} priority={i < 6} />
            ))}
            <tr className="border-border bg-background border-t">
              <td
                colSpan={6}
                className="text-muted px-3 py-1.5 text-xs font-medium tracking-wide uppercase"
              >
                Bench
              </td>
            </tr>
            {bench.map((p) => (
              <PickRow key={p.element} pick={p} dimmed />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PickRow({
  pick: p,
  dimmed = false,
  priority = false,
}: {
  pick: SquadPick;
  dimmed?: boolean;
  priority?: boolean;
}) {
  return (
    <tr
      className={`border-border hover:bg-background border-t transition-colors ${
        dimmed ? "text-muted" : ""
      }`}
    >
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <PlayerPhoto src={p.photo_url} alt={p.web_name} priority={priority} />
          <Link
            href={`/players/${p.element}`}
            className="font-medium hover:underline"
          >
            {p.web_name}
          </Link>
          {p.is_captain && (
            <span className="bg-accent/15 text-accent rounded px-1.5 py-0.5 text-[10px] font-bold">
              C
            </span>
          )}
          {p.is_vice_captain && (
            <span className="bg-border/50 text-muted rounded px-1.5 py-0.5 text-[10px] font-bold">
              VC
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          {p.team_code !== null && (
            <Image
              src={badgeUrl(p.team_code)}
              alt={p.team_name ?? ""}
              width={18}
              height={18}
              sizes="18px"
              priority={priority}
            />
          )}
          <span className="hidden sm:inline">{p.team_name ?? "–"}</span>
        </div>
      </td>
      <td className="hidden px-3 py-1.5 md:table-cell">
        {p.position?.slice(0, 3).toUpperCase() ?? "–"}
      </td>
      <td className="px-3 py-1.5 text-right">
        {p.now_cost === null ? "–" : fmtMoney(p.now_cost)}
      </td>
      <td className="hidden px-3 py-1.5 text-right sm:table-cell">
        {p.form?.toFixed(1) ?? "–"}
      </td>
      <td className="px-3 py-1.5 text-right font-semibold">
        {p.total_points ?? "–"}
      </td>
    </tr>
  );
}

// ---- league cards ---------------------------------------------------------

function LeagueCards({ leagues }: { leagues: ManagerLeague[] }) {
  if (leagues.length === 0) return null;
  return (
    <section>
      <h2 className="font-display mb-2 text-lg font-semibold">Leagues</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {leagues.map((lg) => (
          <Link
            key={lg.id}
            href={`/leagues/${lg.id}`}
            className="border-border bg-surface hover:bg-background flex items-center justify-between gap-2 rounded-lg border p-4 transition-colors"
          >
            <span className="truncate text-sm font-medium">{lg.name}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums">
              <RankMovement
                rank={lg.entry_rank}
                lastRank={lg.entry_last_rank}
              />
              <span className="font-semibold">{fmtRank(lg.entry_rank)}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
