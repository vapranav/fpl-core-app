"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useEntryId } from "./entry-id";
import { LineChart, SERIES_COLORS } from "./line-chart";
import {
  ApiRequestError,
  getLeagueHistory,
  getLeagueOverlap,
  getManagerProfile,
  type LeagueMemberHistory,
  type LeagueOverlap,
  type MemberOverlap,
  type OverlapPlayer,
} from "@/lib/api";

// ---- shared bits ------------------------------------------------------------

/** Result of one request, tagged with the key it was made for. */
type Loaded<T> =
  | { key: string; ok: true; data: T }
  | { key: string; ok: false; status: number | null; detail: string | null };

/**
 * FastAPI's default 404 body is {"detail": "Not Found"}: the route itself is
 * missing, i.e. this frontend is talking to an API without these endpoints.
 */
const missingEndpoint = (r: { status: number | null; detail: string | null }) =>
  r.status === 404 && r.detail === "Not Found";

const OLD_API =
  "This API doesn't have the league features yet (it's running an older version).";

function useLoad<T>(key: string | null, load: () => Promise<T>) {
  const [res, setRes] = useState<Loaded<T> | null>(null);
  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    load()
      .then((data) => {
        if (!cancelled) setRes({ key, ok: true, data });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setRes({
            key,
            ok: false,
            status: err instanceof ApiRequestError ? err.status : null,
            detail: err instanceof ApiRequestError ? err.detail : null,
          });
      });
    return () => {
      cancelled = true;
    };
    // `load` is rebuilt every render; `key` captures everything it depends on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // a result for an earlier key means the current one is still loading
  return key !== null && res?.key === key ? res : null;
}

const muted =
  "text-muted border-border bg-surface rounded-lg border p-4 text-sm";
const errorBox =
  "rounded-lg border border-red-600/30 bg-red-600/10 p-4 text-sm text-red-700 dark:text-red-400";

function Toggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 text-xs">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-md px-2 py-1 ${
            value === o.key
              ? "bg-accent/10 text-accent font-semibold"
              : "border-border text-muted hover:text-foreground border"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- season comparison ------------------------------------------------------

type Metric = "total_points" | "points" | "overall_rank" | "value";
const METRICS: { key: Metric; label: string }[] = [
  { key: "total_points", label: "Total points" },
  { key: "points", label: "GW points" },
  { key: "overall_rank", label: "Overall rank" },
  { key: "value", label: "Team value" },
];

const compact = (v: number) =>
  v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}M`
    : v >= 10_000
      ? `${Math.round(v / 1000)}k`
      : v.toLocaleString("en-GB");

function metricValue(g: LeagueMemberHistory["series"][number], m: Metric) {
  if (m === "value") return g.value === null ? null : g.value / 10;
  return g[m];
}

function SeasonComparison({
  leagueId,
  me,
}: {
  leagueId: number;
  me: number | null;
}) {
  const [metric, setMetric] = useState<Metric>("total_points");
  const res = useLoad(`${leagueId}:${me}`, () =>
    getLeagueHistory(leagueId, me),
  );

  let body: React.ReactNode;
  if (!res) body = <p className={muted}>Loading member histories…</p>;
  else if (!res.ok)
    body = (
      <p className={errorBox}>
        {missingEndpoint(res)
          ? OLD_API
          : "Could not load season histories from FPL — try again shortly."}
      </p>
    );
  else if (res.data.members.every((m) => m.series.length === 0))
    body = <p className={muted}>No gameweeks played yet.</p>;
  else {
    const series = res.data.members.map((m, i) => ({
      name: m.entry === me ? `${m.player_name} (you)` : m.player_name,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      emphasis: m.entry === me,
      data: m.series.map((g) => ({ x: g.event, y: metricValue(g, metric) })),
    }));
    body = (
      <>
        <LineChart
          // remount on metric change so hidden series reset with the axis
          key={metric}
          series={series}
          reversed={metric === "overall_rank"}
          zeroBased={metric !== "overall_rank" && metric !== "value"}
          format={metric === "value" ? (v) => `£${v.toFixed(1)}m` : compact}
        />
        <p className="text-muted text-xs">
          {res.data.members.length} managers: the league&apos;s top 20
          {me ? " and you" : ""}. Click a name to hide or show their line.
        </p>
      </>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">
          Season comparison
        </h2>
        <Toggle value={metric} options={METRICS} onChange={setMetric} />
      </div>
      {body}
    </section>
  );
}

// ---- squad overlap ----------------------------------------------------------

const CHIPS: Record<string, string> = {
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
  freehit: "Free Hit",
  wildcard: "Wildcard",
  manager: "Assistant Manager",
};

const posShort = (p: string | null) => (p ? p.slice(0, 3).toUpperCase() : "");

function Chip({
  p,
  tone,
}: {
  p: OverlapPlayer;
  tone: "shared" | "mine" | "theirs";
}) {
  const cls = {
    shared: "bg-green-600/15 text-green-700 dark:text-green-400",
    mine: "bg-accent/10 text-accent",
    theirs: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${cls}`}
    >
      {p.web_name}
      <span className="opacity-70">{posShort(p.position)}</span>
      {p.squad_position > 11 && <span className="opacity-70">(B)</span>}
    </span>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="bg-border h-2 w-full overflow-hidden rounded-full">
      <div className="bg-accent h-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

function ChipRow({
  label,
  players,
  tone,
}: {
  label: string;
  players: OverlapPlayer[];
  tone: "shared" | "mine" | "theirs";
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-muted mr-1 w-20 text-xs tracking-wide uppercase">
        {label}
      </span>
      {players.length ? (
        players.map((p) => <Chip key={p.element} p={p} tone={tone} />)
      ) : (
        <span className="text-muted text-xs">none</span>
      )}
    </div>
  );
}

function MemberRow({ m, squadSize }: { m: MemberOverlap; squadSize: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-border hover:bg-background border-t">
        <td className="px-3 py-2">{m.rank}</td>
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="text-left"
          >
            <span className="font-medium">
              {open ? "▾" : "▸"} {m.entry_name}
            </span>
            <span className="text-muted block text-xs">{m.player_name}</span>
          </button>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="w-10 tabular-nums">
              {m.shared.length}/{squadSize}
            </span>
            <div className="hidden w-32 sm:block">
              <Bar value={m.shared.length} max={squadSize} />
            </div>
          </div>
        </td>
        <td className="px-3 py-2 text-xs">
          {m.captain ? (
            <span
              className={
                m.same_captain ? "text-green-600 dark:text-green-400" : ""
              }
            >
              {m.captain.web_name}
              {m.same_captain && " (same)"}
            </span>
          ) : (
            "–"
          )}
        </td>
        <td className="text-muted hidden px-3 py-2 text-xs sm:table-cell">
          {m.active_chip ? (CHIPS[m.active_chip] ?? m.active_chip) : ""}
        </td>
      </tr>
      {open && (
        <tr className="border-border bg-background/60 border-t">
          <td colSpan={5} className="space-y-2 px-3 py-3">
            <ChipRow label="Shared" players={m.shared} tone="shared" />
            <ChipRow label="Only you" players={m.mine_only} tone="mine" />
            <ChipRow label="Only them" players={m.theirs_only} tone="theirs" />
          </td>
        </tr>
      )}
    </>
  );
}

function OverlapView({ data }: { data: LeagueOverlap }) {
  const { my_squad, members, squad_size, total_members } = data;
  const avg = members.length
    ? members.reduce((s, m) => s + m.shared.length, 0) / members.length
    : 0;
  const card = "border-border bg-surface rounded-lg border p-3";
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={card}>
          <p className="text-muted text-xs">Average overlap</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">
            {avg.toFixed(1)}/{squad_size}
          </p>
        </div>
        <div className={card}>
          <p className="text-muted text-xs">Most similar squad</p>
          <p className="mt-0.5 truncate text-lg font-semibold">
            {members[0]
              ? `${members[0].player_name} (${members[0].shared.length})`
              : "–"}
          </p>
        </div>
        <div className={card}>
          <p className="text-muted text-xs">Your differentials</p>
          <p className="mt-0.5 text-lg font-semibold">
            {my_squad.filter((p) => p.owned_by === 0).length}
            <span className="text-muted text-sm font-normal">
              {" "}
              owned by no rival
            </span>
          </p>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">
          Your squad: how many rivals own each player
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {my_squad.map((p) => (
            <div
              key={p.element}
              className={`border-border rounded-lg border p-2 text-sm ${
                p.squad_position > 11 ? "bg-background" : "bg-surface"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate font-medium">
                  {p.web_name}
                  {p.is_captain && (
                    <span className="text-muted ml-1 text-xs">(C)</span>
                  )}
                </span>
                <span className="text-muted shrink-0 text-xs">
                  {posShort(p.position)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Bar value={p.owned_by} max={total_members} />
                <span className="text-muted w-10 text-right text-xs tabular-nums">
                  {p.owned_by}/{total_members}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-border bg-surface overflow-x-auto rounded-lg border">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-background text-left">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Manager</th>
              <th className="px-3 py-2 font-medium">Shared</th>
              <th className="px-3 py-2 font-medium">Captain</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">
                Chip
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <MemberRow key={m.entry} m={m} squadSize={squad_size} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted text-xs">
        Click a manager to see shared players and differentials. (B) marks bench
        players.
      </p>
    </div>
  );
}

function SquadOverlap({ leagueId, me }: { leagueId: number; me: number }) {
  const profile = useLoad(`${me}`, () => getManagerProfile(me));
  const currentEvent =
    profile?.ok === true ? profile.data.current_event : undefined;
  const [picked, setPicked] = useState<number | null>(null);
  const gw = picked ?? currentEvent ?? null;
  const overlap = useLoad(gw ? `${leagueId}:${me}:${gw}` : null, () =>
    getLeagueOverlap(leagueId, me, gw ?? undefined),
  );

  let body: React.ReactNode;
  if (!profile) body = <p className={muted}>Loading…</p>;
  else if (!profile.ok)
    body = <p className={errorBox}>Could not load your team from FPL.</p>;
  else if (!currentEvent)
    body = <p className={muted}>The season hasn&apos;t started yet.</p>;
  else if (!overlap) body = <p className={muted}>Comparing squads…</p>;
  else if (!overlap.ok)
    body = missingEndpoint(overlap) ? (
      <p className={errorBox}>{OLD_API}</p>
    ) : overlap.status === 404 && overlap.detail?.startsWith("no picks") ? (
      <p className={muted}>
        Picks for GW{gw} aren&apos;t available until the deadline passes.
      </p>
    ) : overlap.status === 404 ? (
      <p className={muted}>
        {overlap.detail
          ? `${overlap.detail[0].toUpperCase()}${overlap.detail.slice(1)}.`
          : "Not found."}
      </p>
    ) : (
      <p className={errorBox}>
        Could not compare squads — FPL may be busy, try again shortly.
      </p>
    );
  else if (overlap.data.members.length === 0)
    body = (
      <p className={muted}>No other squads available for this gameweek.</p>
    );
  else body = <OverlapView data={overlap.data} />;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Squad overlap</h2>
        {currentEvent ? (
          <label className="text-muted flex items-center gap-2 text-sm">
            Gameweek
            <select
              value={gw ?? currentEvent}
              onChange={(e) => setPicked(Number(e.target.value))}
              className="border-border bg-surface text-foreground rounded-md border px-2 py-1 text-sm"
            >
              {Array.from(
                { length: currentEvent },
                (_, i) => currentEvent - i,
              ).map((n) => (
                <option key={n} value={n}>
                  GW{n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {body}
    </section>
  );
}

// ---- page section -----------------------------------------------------------

/** Season chart and (for a connected manager) squad overlap for one league. */
export function LeagueInsights({ leagueId }: { leagueId: number }) {
  const [entryId] = useEntryId();
  const me = entryId === null ? null : Number(entryId);
  return (
    <div className="mt-10 space-y-10">
      <SeasonComparison leagueId={leagueId} me={me} />
      {me !== null ? (
        <SquadOverlap leagueId={leagueId} me={me} />
      ) : (
        <p className="text-muted text-sm">
          <Link href="/my-team" className="text-accent underline">
            Connect your team
          </Link>{" "}
          to see how your squad overlaps with this league&apos;s.
        </p>
      )}
    </div>
  );
}
