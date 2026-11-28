"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CompareTable } from "./compare-table";
import { FixtureStrip } from "./fixture-strip";
import { LineChart } from "./line-chart";
import { SearchBar } from "./search-bar";
import {
  badgeUrl,
  getPlayerCompare,
  MAX_COMPARE,
  type ComparePlayer,
} from "@/lib/api";
import { kitColors, needsOutline } from "@/lib/kit-colors";

type Metric =
  | "total_points"
  | "minutes"
  | "expected_goals"
  | "expected_assists"
  | "defcon_per_90";

const METRICS: { key: Metric; label: string }[] = [
  { key: "total_points", label: "Points" },
  { key: "minutes", label: "Minutes" },
  { key: "expected_goals", label: "xG" },
  { key: "expected_assists", label: "xA" },
  { key: "defcon_per_90", label: "DefCon per 90" },
];

type State =
  | { status: "idle" }
  | { status: "ok"; key: string; players: ComparePlayer[] }
  | { status: "error"; key: string; message: string };

function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  const ids = raw
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)].slice(0, MAX_COMPARE);
}

function series(p: ComparePlayer, metric: Metric) {
  // a player can play twice in a double gameweek: sum per GW
  const byGw = new Map<
    number,
    { value: number; minutes: number; dc: number }
  >();
  for (const h of p.history) {
    const acc = byGw.get(h.event) ?? { value: 0, minutes: 0, dc: 0 };
    acc.minutes += h.minutes;
    acc.dc += h.defensive_contribution;
    if (metric !== "defcon_per_90") acc.value += h[metric];
    byGw.set(h.event, acc);
  }
  return [...byGw].map(([x, a]) => ({
    x,
    y:
      metric === "defcon_per_90"
        ? a.minutes > 0
          ? Math.round((a.dc / a.minutes) * 90 * 10) / 10
          : null
        : Math.round(a.value * 100) / 100,
  }));
}

function StatusBadge({ p }: { p: ComparePlayer }) {
  if (p.status === "a" && !p.news) return null;
  const bad = p.status === "i" || p.status === "s" || p.status === "u";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
        bad
          ? "bg-red-600/15 text-red-700 dark:text-red-400"
          : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      }`}
      title={p.news}
    >
      {p.chance_of_playing_next_round != null
        ? `${p.chance_of_playing_next_round}%`
        : p.status.toUpperCase()}
    </span>
  );
}

export function PlayerCompare() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // selection lives in state so rapid picks don't race the URL update;
  // the URL is kept in sync so a comparison can be shared
  const [ids, setIdsState] = useState(() => parseIds(searchParams.get("ids")));
  const [names, setNames] = useState<Record<number, string>>({});
  const [metric, setMetric] = useState<Metric>("total_points");
  const [state, setState] = useState<State>({ status: "idle" });
  // last loaded comparison, kept on screen while the next one loads
  const [shown, setShown] = useState<ComparePlayer[]>([]);

  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    getPlayerCompare(key.split(",").map(Number))
      .then((data) => {
        if (cancelled) return;
        setShown(data.players);
        setState({ status: "ok", key, players: data.players });
      })
      .catch(() => {
        if (!cancelled)
          setState({
            status: "error",
            key,
            message: "Could not load player stats from FPL — try again",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const setIds = (next: number[]) => {
    setIdsState(next);
    router.replace(
      next.length ? `/compare?ids=${next.join(",")}` : "/compare",
      {
        scroll: false,
      },
    );
  };

  const players = shown.filter((p) => ids.includes(p.id));
  // each player's club kit colour: home shirt, else away, else third kit
  // when an earlier player already has a similar colour (selection order)
  const kit = kitColors(players.map((p) => p.team_short));
  const color = (id: number) => {
    const i = players.findIndex((p) => p.id === id);
    return i >= 0 ? kit[i] : "#737373";
  };
  const nameOf = (id: number) =>
    names[id] ?? shown.find((p) => p.id === id)?.web_name ?? `#${id}`;
  // the last response is for a different selection until the new one lands
  const loading =
    ids.length > 0 && (state.status === "idle" || state.key !== key);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Compare players
        </h1>
        <p className="text-muted text-sm">
          Pick up to {MAX_COMPARE} players to compare their season, gameweek by
          gameweek, and upcoming fixtures. Live from the official FPL API.
        </p>
        <div className="max-w-md">
          <SearchBar
            onSelect={(s) => {
              setNames((n) => ({ ...n, [s.player_id]: s.web_name }));
              setIds([...ids, s.player_id]);
            }}
            excludeIds={ids}
            disabled={ids.length >= MAX_COMPARE}
            placeholder={
              ids.length >= MAX_COMPARE
                ? `Maximum of ${MAX_COMPARE} players`
                : "Add a player…"
            }
          />
        </div>
        {ids.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {ids.map((id) => (
              <span
                key={id}
                className="border-border bg-surface inline-flex items-center gap-2 rounded-full border py-1 pr-2 pl-3 text-sm"
              >
                <span
                  className="border-muted inline-block h-2.5 w-2.5 rounded-full border"
                  style={{ background: color(id) }}
                />
                {nameOf(id)}
                <button
                  type="button"
                  onClick={() => setIds(ids.filter((x) => x !== id))}
                  aria-label={`Remove ${nameOf(id)}`}
                  className="text-muted hover:text-foreground px-1"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setIds([])}
              className="text-muted text-xs underline"
            >
              Clear all
            </button>
          </div>
        )}
      </header>

      {ids.length === 0 ? (
        <p className="text-muted border-border bg-surface rounded-lg border p-6 text-sm">
          Search for a player above to get started.
        </p>
      ) : state.status === "error" && state.key === key ? (
        <p className="rounded-lg border border-red-600/30 bg-red-600/10 p-4 text-sm text-red-700 dark:text-red-400">
          {state.message}
        </p>
      ) : players.length === 0 ? (
        <p className="text-muted border-border bg-surface rounded-lg border p-6 text-sm">
          Loading stats…
        </p>
      ) : (
        <div
          className={`space-y-8 transition-opacity ${loading ? "opacity-60" : ""}`}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {players.map((p) => (
              <div
                key={p.id}
                className="border-border bg-surface rounded-lg border p-3"
                style={{
                  borderTopColor: color(p.id),
                  borderTopWidth: 4,
                  // white/black kits need an edge to show on the card
                  boxShadow: needsOutline(color(p.id))
                    ? "inset 0 1px 0 #71717a"
                    : undefined,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/players/${p.id}`}
                      className="font-semibold hover:underline"
                    >
                      {p.web_name}
                    </Link>
                    <p className="text-muted truncate text-xs">{p.full_name}</p>
                  </div>
                  <StatusBadge p={p} />
                </div>
                <p className="text-muted mt-2 flex items-center gap-1 text-xs">
                  <Image
                    src={badgeUrl(p.team_code)}
                    alt=""
                    width={14}
                    height={14}
                  />
                  {p.team_short} · {p.position_short} · £
                  {(p.now_cost / 10).toFixed(1)}m
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {p.total_points}{" "}
                  <span className="text-muted text-xs font-normal">pts</span>
                </p>
                <p className="text-muted mt-2 mb-1 text-[11px] tracking-wide uppercase">
                  Next fixtures
                </p>
                <FixtureStrip fixtures={p.fixtures} />
                {p.news && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    {p.news}
                  </p>
                )}
              </div>
            ))}
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">
                Gameweek by gameweek
              </h2>
              <div className="flex flex-wrap gap-1 text-xs">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMetric(m.key)}
                    className={`rounded-md px-2 py-1 ${
                      metric === m.key
                        ? "bg-accent/10 text-accent font-semibold"
                        : "border-border text-muted hover:text-foreground border"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            {players.every((p) => p.history.length === 0) ? (
              <p className="text-muted text-sm">No gameweeks played yet.</p>
            ) : (
              <LineChart
                series={players.map((p) => ({
                  name: p.web_name,
                  color: color(p.id),
                  data: series(p, metric),
                }))}
              />
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold">Season stats</h2>
            <CompareTable players={players} />
            <p className="text-muted text-xs">
              Best value in each row is highlighted (lower is better for price,
              ranks, set-piece order, goals conceded, cards and transfers out).
              Trends compare FPL-Core-Insights gameweek snapshots.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
