"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEntryId } from "./entry-id";
import { OWNED_ROW, YoursBadge, useOwnedPlayers } from "./owned-players";
import { inputClass } from "./select";
import { TransferSuggestions } from "./transfer-suggestions";
import {
  badgeUrl,
  getPriceChanges,
  type PricePlayer,
  type PricePrediction,
  type PriceChanges as PriceData,
} from "@/lib/api";

// Mirrors the tables on fantasy.premierleague.com/price-changes.

type Tab = "predictions" | "recent";
type Direction = "all" | "rise" | "drop" | "locked";
type Position = "all" | "GKP" | "DEF" | "MID" | "FWD";

const PAGE_SIZE = 20;
const POSITIONS: [Position, string][] = [
  ["all", "All positions"],
  ["GKP", "Goalkeepers"],
  ["DEF", "Defenders"],
  ["MID", "Midfielders"],
  ["FWD", "Forwards"],
];
const DIRECTIONS: [Direction, string][] = [
  ["all", "Rise & drop"],
  ["rise", "Rising"],
  ["drop", "Dropping"],
  ["locked", "Locked"],
];
const STATUS: Record<string, string> = {
  i: "Injured",
  s: "Suspended",
  d: "Doubtful",
  n: "Not available",
};

const RISE = "bg-green-600/15 text-green-700 dark:text-green-400";
const DROP = "bg-red-600/15 text-red-700 dark:text-red-400";
const NEUTRAL = "bg-border text-foreground";

const money = (tenths: number) => `£${(tenths / 10).toFixed(1)}m`;
// keep FPL's sign on zero too ("-0.0%" is a tiny drift towards a drop)
const pct = (v: number | null) =>
  v === null
    ? "–"
    : `${v > 0 ? "+" : v < 0 || Object.is(v, -0) ? "-" : ""}${Math.abs(v).toFixed(1)}%`;
const tone = (d: PricePrediction["direction"]) =>
  d === "rise" ? RISE : d === "drop" ? DROP : NEUTRAL;

type State =
  | { status: "loading" }
  | { status: "ok"; data: PriceData }
  | { status: "error" };

function Pill({ text, cls }: { text: string; cls: string }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}
    >
      {text}
    </span>
  );
}

function PlayerCell({ p, owned }: { p: PricePlayer; owned: boolean }) {
  const flag = STATUS[p.status];
  return (
    <td className="px-3 py-2">
      <div className="flex items-center gap-2">
        <Image src={badgeUrl(p.team_code)} alt="" width={18} height={18} />
        <div className="min-w-0">
          <Link
            href={`/players/${p.id}`}
            className="font-medium hover:underline"
          >
            {p.web_name}
          </Link>
          {owned && <YoursBadge />}
          <div className="text-muted text-xs whitespace-nowrap">
            {p.team_short} · {p.position_short}
            {flag && (
              <span
                className="text-amber-700 dark:text-amber-400"
                title={p.news || undefined}
              >
                {" "}
                · {flag}
              </span>
            )}
          </div>
        </div>
      </div>
    </td>
  );
}

function Picker<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={inputClass}
    >
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  );
}

function Countdown({ target, onDone }: { target: string; onDone: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, new Date(target).getTime() - now);
  // refresh once when the countdown hits zero, not on every tick after
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (left === 0 && fired.current !== target) {
      fired.current = target;
      onDone();
    }
  }, [left, target, onDone]);
  const s = Math.floor(left / 1000);
  const parts = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(
    (n) => String(n).padStart(2, "0"),
  );
  return (
    <span className="font-display text-2xl font-semibold tabular-nums">
      {parts.join(":")}
    </span>
  );
}

function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  const btn =
    "border-border rounded-md border px-3 py-1.5 text-sm disabled:opacity-40 enabled:hover:bg-surface";
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        className={btn}
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        ← Previous
      </button>
      <span className="text-muted text-sm">
        <span className="text-foreground font-semibold">{page + 1}</span> of{" "}
        {pages}
      </span>
      <button
        type="button"
        className={btn}
        disabled={page >= pages - 1}
        onClick={() => onPage(page + 1)}
      >
        Next →
      </button>
    </div>
  );
}

const TABLE = "border-border bg-surface overflow-x-auto rounded-lg border";
const TH = "px-3 py-2 font-medium whitespace-nowrap";

function PredictionsTable({
  rows,
  owned,
}: {
  rows: PricePrediction[];
  owned: Set<number>;
}) {
  return (
    <div className={TABLE}>
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-background text-left">
          <tr>
            <th className={TH}>Player</th>
            <th className={`${TH} hidden sm:table-cell`}>Status</th>
            <th
              className={`${TH} text-right`}
              title="How far the player is towards a price change now"
            >
              Progress
            </th>
            <th
              className={`${TH} hidden text-right sm:table-cell`}
              title="Where FPL expects them to be at the next price update"
            >
              Predicted
            </th>
            <th className={`${TH} hidden md:table-cell`}>Transfers</th>
            <th className={`${TH} text-right`}>Price</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const cls = tone(r.direction);
            const mine = owned.has(r.id);
            return (
              <tr
                key={r.id}
                className={`border-border border-t ${mine ? OWNED_ROW : ""}`}
              >
                <PlayerCell p={r} owned={mine} />
                <td className="hidden px-3 py-2 sm:table-cell">
                  <Pill text={r.status_label} cls={cls} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Pill text={pct(r.progress)} cls={cls} />
                </td>
                <td className="hidden px-3 py-2 text-right sm:table-cell">
                  <Pill text={pct(r.predicted_progress)} cls={cls} />
                </td>
                <td
                  className={`hidden px-3 py-2 whitespace-nowrap md:table-cell ${
                    r.trend === "up"
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                  title={`About ${Math.abs(r.hourly_rate).toLocaleString("en-GB")} net transfers ${r.trend === "up" ? "in" : "out"} per hour`}
                >
                  {r.trend === "up" ? "↗ In" : "↘ Out"}
                </td>
                <td className="px-3 py-2 text-right">{money(r.now_cost)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RecentTable({
  rows,
  owned,
}: {
  rows: PriceData["recent_changes"];
  owned: Set<number>;
}) {
  return (
    <div className={TABLE}>
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-background text-left">
          <tr>
            <th className={TH}>Player</th>
            <th className={TH}>Change</th>
            <th className={`${TH} text-right`}>Price</th>
            <th className={`${TH} hidden text-right sm:table-cell`}>When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const up = c.cost_after > c.cost_before;
            const mine = owned.has(c.id);
            return (
              <tr
                key={`${c.id}-${c.changed_at}`}
                className={`border-border border-t ${mine ? OWNED_ROW : ""}`}
              >
                <PlayerCell p={c} owned={mine} />
                <td className="px-3 py-2">
                  <Pill
                    text={`${up ? "▲ +" : "▼ "}${((c.cost_after - c.cost_before) / 10).toFixed(1)}`}
                    cls={up ? RISE : DROP}
                  />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <span className="text-muted">{money(c.cost_before)} → </span>
                  {money(c.cost_after)}
                </td>
                <td className="text-muted hidden px-3 py-2 text-right whitespace-nowrap sm:table-cell">
                  {new Date(c.changed_at).toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                  {c.event ? ` · GW${c.event}` : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const RECENT_DAYS = 7;

function SquadRow({
  p,
  right,
  cls,
}: {
  p: PricePlayer;
  right: string;
  cls: string;
}) {
  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <Image src={badgeUrl(p.team_code)} alt="" width={16} height={16} />
        <Link
          href={`/players/${p.id}`}
          className="truncate font-medium hover:underline"
        >
          {p.web_name}
        </Link>
        <span className="text-muted text-xs whitespace-nowrap">
          {p.team_short} · {money(p.now_cost)}
        </span>
      </div>
      <Pill text={right} cls={cls} />
    </li>
  );
}

function SquadColumn({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <div className="min-w-0">
      <h3 className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">
        {title} <span className="font-normal">({children.length})</span>
      </h3>
      {children.length ? (
        <ul className="divide-border divide-y text-sm">{children}</ul>
      ) : (
        <p className="text-muted py-1.5 text-sm">{empty}</p>
      )}
    </div>
  );
}

/** The connected squad's players FPL expects to change tonight, and recent changes. */
function SquadSummary({
  data,
  owned,
}: {
  data: PriceData;
  owned: Set<number>;
}) {
  const mine = data.predictions.filter((r) => owned.has(r.id));
  const strength = (r: PricePrediction) =>
    Math.abs(r.predicted_progress ?? r.progress);
  const rising = mine
    .filter((r) => r.direction === "rise")
    .sort((a, b) => strength(b) - strength(a));
  const dropping = mine
    .filter((r) => r.direction === "drop")
    .sort((a, b) => strength(b) - strength(a));
  // relative to the fetch, so render stays pure
  const since = new Date(data.fetched_at).getTime() - RECENT_DAYS * 86400_000;
  const recent = data.recent_changes.filter(
    (c) => owned.has(c.id) && new Date(c.changed_at).getTime() >= since,
  );

  return (
    <section className="border-border bg-surface space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-1">
        <h2 className="font-semibold">Your squad</h2>
        <p className="text-muted text-xs">At the next price update</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SquadColumn title="Likely to drop" empty="Nobody at risk">
          {dropping.map((r) => (
            <SquadRow
              key={r.id}
              p={r}
              cls={DROP}
              right={pct(r.predicted_progress ?? r.progress)}
            />
          ))}
        </SquadColumn>
        <SquadColumn title="Likely to rise" empty="Nobody expected to rise">
          {rising.map((r) => (
            <SquadRow
              key={r.id}
              p={r}
              cls={RISE}
              right={pct(r.predicted_progress ?? r.progress)}
            />
          ))}
        </SquadColumn>
        <SquadColumn
          title={`Changed, last ${RECENT_DAYS} days`}
          empty="No recent changes"
        >
          {recent.map((c) => {
            const up = c.cost_after > c.cost_before;
            return (
              <SquadRow
                key={`${c.id}-${c.changed_at}`}
                p={c}
                cls={up ? RISE : DROP}
                right={`${up ? "▲ +" : "▼ "}${((c.cost_after - c.cost_before) / 10).toFixed(1)}`}
              />
            );
          })}
        </SquadColumn>
      </div>
    </section>
  );
}

export function PriceChanges() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [entryId] = useEntryId();
  const [tab, setTab] = useState<Tab>("predictions");
  const [direction, setDirection] = useState<Direction>("all");
  const [position, setPosition] = useState<Position>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  const load = useCallback(() => {
    getPriceChanges()
      .then((data) => setState({ status: "ok", data }))
      .catch(() => setState({ status: "error" }));
  }, []);
  useEffect(load, [load]);

  // highlight the connected manager's squad (see My Team)
  const currentEvent =
    state.status === "ok" ? state.data.current_event : undefined;
  const owned = useOwnedPlayers(currentEvent ?? undefined);

  if (state.status === "loading")
    return (
      <p className="text-muted border-border bg-surface rounded-lg border p-6 text-sm">
        Fetching price changes from FPL…
      </p>
    );
  if (state.status === "error")
    return (
      <p className="rounded-lg border border-red-600/30 bg-red-600/10 p-4 text-sm text-red-700 dark:text-red-400">
        Could not load price changes from FPL — try again shortly.
      </p>
    );

  const d = state.data;
  const mine = owned;
  const q = search.trim().toLocaleLowerCase();
  const matches = (p: PricePlayer) =>
    (position === "all" || p.position_short === position) &&
    (!q ||
      p.web_name.toLocaleLowerCase().includes(q) ||
      p.team_name.toLocaleLowerCase().includes(q));
  const predictions = d.predictions.filter(
    (r) =>
      matches(r) &&
      (direction === "all" ||
        (direction === "locked" && r.locked) ||
        (direction === "rise" && !r.locked && r.progress > 0) ||
        (direction === "drop" && !r.locked && r.progress < 0)),
  );
  const recent = d.recent_changes.filter(
    (c) =>
      matches(c) &&
      (direction === "all" ||
        direction === "locked" ||
        (direction === "rise") === c.cost_after > c.cost_before),
  );
  const rows = tab === "predictions" ? predictions : recent;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const from = current * PAGE_SIZE;
  const to = from + PAGE_SIZE;

  // any filter change starts again from the first page
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(0);
    };
  const time = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(iso).toLocaleString("en-GB", opts);
  const directions =
    tab === "predictions"
      ? DIRECTIONS
      : DIRECTIONS.filter(([v]) => v !== "locked");

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Price changes
          </h1>
          <p className="text-muted text-sm">
            FPL&apos;s own predictions for the next price update, live from the
            official API.
          </p>
        </div>
        <a
          href="https://fantasy.premierleague.com/price-changes"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted text-xs underline"
        >
          Same data as FPL&apos;s price changes page
        </a>
      </header>

      <TransferSuggestions />

      <div className="border-border bg-surface flex flex-wrap items-end justify-between gap-3 rounded-lg border p-4">
        <div>
          <p className="text-muted text-sm">Next price update in</p>
          <Countdown target={d.next_update_at} onDone={load} />
          <p className="text-muted text-xs">
            at {time(d.next_update_at, { hour: "2-digit", minute: "2-digit" })}{" "}
            your time
          </p>
        </div>
        <p className="text-muted text-xs sm:text-right">
          Last updated{" "}
          {time(d.fetched_at, {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
          <br />
          FPL refreshes predictions every ~15 minutes
        </p>
      </div>

      {mine.size > 0 && <SquadSummary data={d} owned={mine} />}

      <div className="flex gap-1">
        {(
          [
            ["predictions", "Predictions"],
            ["recent", "Recent changes"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setPage(0);
              if (t === "recent" && direction === "locked") setDirection("all");
            }}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === t
                ? "bg-accent/10 text-accent font-semibold"
                : "text-muted hover:bg-surface hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => reset(setSearch)(e.target.value)}
          placeholder="Search by name or club"
          aria-label="Search by name or club"
          className={`${inputClass} w-full sm:w-64`}
        />
        <Picker
          label="Direction"
          value={direction}
          options={directions}
          onChange={reset(setDirection)}
        />
        <Picker
          label="Position"
          value={position}
          options={POSITIONS}
          onChange={reset(setPosition)}
        />
        <button
          type="button"
          className="text-muted ml-auto text-sm underline"
          aria-expanded={showHelp}
          onClick={() => setShowHelp((v) => !v)}
        >
          How this works
        </button>
      </div>

      {showHelp && (
        <div className="border-border bg-surface space-y-2 rounded-lg border p-4 text-sm">
          <p>
            <strong>Progress</strong> is how far a player has moved towards a
            price rise (positive) or drop (negative) right now.{" "}
            <strong>Predicted</strong> is FPL&apos;s estimate of where
            they&apos;ll be at the next update; past 100% a change is very
            likely.
          </p>
          <p className="text-muted">
            <strong className="text-foreground">Transfers</strong> shows whether
            managers are currently moving the player in or out. Players whose
            price just changed are locked for a few days. These are FPL&apos;s
            own predictions, not a guarantee.
          </p>
        </div>
      )}

      {mine.size > 0 ? (
        <p className="text-muted flex items-center text-xs">
          <YoursBadge />
          <span className="ml-1">rows are players in your current squad.</span>
        </p>
      ) : !entryId ? (
        <p className="text-muted text-xs">
          <Link href="/my-team" className="underline">
            Connect your team
          </Link>{" "}
          to highlight your players.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-muted border-border bg-surface rounded-lg border p-4 text-sm">
          No players match these filters.
        </p>
      ) : tab === "predictions" ? (
        <PredictionsTable rows={predictions.slice(from, to)} owned={mine} />
      ) : (
        <RecentTable rows={recent.slice(from, to)} owned={mine} />
      )}
      <Pager page={current} pages={pages} onPage={setPage} />
    </div>
  );
}
