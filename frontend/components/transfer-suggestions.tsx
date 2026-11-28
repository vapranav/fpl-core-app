"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useEntryId } from "./entry-id";
import { useFplToken } from "./fpl-token";
import {
  ApiRequestError,
  badgeUrl,
  getTransferSuggestions,
  type SuggestionOption,
  type SuggestionPlayer,
  type TransferSuggestion,
  type TransferSuggestions as Data,
} from "@/lib/api";

const money = (tenths: number) => `£${(tenths / 10).toFixed(1)}m`;
const pct = (v: number | null) =>
  v === null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(0)}%`;

const REASON_STYLE: Record<
  TransferSuggestion["reasons"][number]["kind"],
  string
> = {
  unavailable: "bg-red-600/15 text-red-700 dark:text-red-400",
  doubtful: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  selling: "bg-red-600/15 text-red-700 dark:text-red-400",
  fixtures: "bg-border text-foreground",
  form: "bg-border text-foreground",
};
const FDR_STYLE: Record<number, string> = {
  1: "bg-[#257d5a] text-white",
  2: "bg-[#00ff86] text-neutral-900",
  3: "bg-[#e7e7e7] text-neutral-900",
  4: "bg-[#ff1751] text-white",
  5: "bg-[#80072d] text-white",
};
const PRICED_OUT: Record<
  NonNullable<SuggestionOption["priced_out_risk"]>,
  string
> = {
  rise: "is likely to rise tonight, which would put them over your budget",
  drop: "your player is likely to drop tonight, shrinking your budget below their price",
  both: "their likely rise and your player's likely drop tonight together would put them out of reach",
};

function Fixtures({ p }: { p: SuggestionPlayer }) {
  if (!p.fixtures.length) return null;
  return (
    <span className="inline-flex gap-0.5">
      {p.fixtures.map((f, i) => (
        <span
          key={i}
          title={`GW${f.event} · difficulty ${f.difficulty}`}
          className={`rounded px-1 text-[10px] leading-4 font-semibold ${FDR_STYLE[f.difficulty] ?? FDR_STYLE[3]}`}
        >
          {f.opponent_short}
          {f.is_home ? "" : " (A)"}
        </span>
      ))}
    </span>
  );
}

function Name({ p }: { p: SuggestionPlayer }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
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
    </span>
  );
}

function Option({ o, deadline }: { o: SuggestionOption; deadline: string }) {
  return (
    <li
      className={`space-y-1 rounded-md border p-2 ${
        o.priced_out_risk
          ? "border-amber-500/50 bg-amber-500/10"
          : "border-border bg-background"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <Name p={o} />
        <span
          className="rounded bg-green-600/15 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-green-700 dark:text-green-400"
          title="FPL's predicted progress towards a price rise at the next update"
        >
          ▲ {pct(o.predicted_progress ?? o.progress)}
          {o.likely_rise ? " · rising tonight" : ""}
        </span>
      </div>
      <div className="text-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span>Form {o.form.toFixed(1)}</span>
        <span title="Transfers in this gameweek">
          {o.transfers_in_event.toLocaleString("en-GB")} in
        </span>
        <span>{money(o.bank_after)} left</span>
        <Fixtures p={o} />
      </div>
      {o.priced_out_risk && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          ⚠ Priced-out risk: {o.web_name} {PRICED_OUT[o.priced_out_risk]}.
          Transfer before{" "}
          {new Date(deadline).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          to lock in {money(o.now_cost)}.
        </p>
      )}
    </li>
  );
}

function Suggestion({
  s,
  deadline,
}: {
  s: TransferSuggestion;
  deadline: string;
}) {
  const o = s.out;
  return (
    <div className="border-border space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-red-700 uppercase dark:text-red-400">
          Out
        </span>
        <Name p={o} />
        {s.reasons.map((r) => (
          <span
            key={r.kind}
            className={`rounded px-1.5 py-0.5 text-xs font-medium ${REASON_STYLE[r.kind]}`}
          >
            {r.label}
          </span>
        ))}
      </div>
      {o.news && <p className="text-muted text-xs">{o.news}</p>}
      <p className="text-muted text-xs">
        Budget {money(s.budget)} (sells for {money(o.selling_price)})
      </p>
      {s.options.length ? (
        <ul className="grid gap-2 md:grid-cols-3">
          {s.options.map((opt) => (
            <Option key={opt.id} o={opt} deadline={deadline} />
          ))}
        </ul>
      ) : (
        <p className="text-muted text-sm">
          No rising {o.position_short} in good form fits this budget right now.
        </p>
      )}
    </div>
  );
}

type State =
  { status: "loading" } | { status: "ok"; data: Data } | { status: "error" };

/** Transfer ideas for the connected squad, at the top of the prices page. */
export function TransferSuggestions() {
  const [entryId] = useEntryId();
  const [token] = useFplToken();
  const [result, setResult] = useState<{ key: string; state: State }>();
  const key = `${entryId}:${token ?? ""}`;

  useEffect(() => {
    if (!entryId) return;
    let cancelled = false;
    const id = Number(entryId);
    getTransferSuggestions(id, token)
      // an expired token shouldn't hide the suggestions: estimate instead
      .catch((e) =>
        token && e instanceof ApiRequestError && e.status === 401
          ? getTransferSuggestions(id)
          : Promise.reject(e),
      )
      .then(
        (data) =>
          !cancelled && setResult({ key, state: { status: "ok", data } }),
      )
      .catch(
        () => !cancelled && setResult({ key, state: { status: "error" } }),
      );
    return () => {
      cancelled = true;
    };
  }, [entryId, token, key]);

  if (!entryId) return null;
  const state: State =
    result?.key === key ? result.state : { status: "loading" };

  return (
    <section className="border-border bg-surface space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-1">
        <h2 className="font-semibold">Suggested transfers</h2>
        {state.status === "ok" && (
          <p className="text-muted text-xs">
            Bank {money(state.data.bank)}
            {state.data.exact ? "" : " (last gameweek)"}
          </p>
        )}
      </div>
      {state.status === "loading" ? (
        <p className="text-muted text-sm">Checking your squad…</p>
      ) : state.status === "error" ? (
        <p className="text-muted text-sm">
          Could not load suggestions from FPL — try again shortly.
        </p>
      ) : (
        <>
          {state.data.suggestions.length === 0 ? (
            <p className="text-muted text-sm">
              Nothing to act on: everyone is fit and nobody is being sold off.
            </p>
          ) : (
            <div className="space-y-3">
              {state.data.suggestions.map((s) => (
                <Suggestion
                  key={s.out.id}
                  s={s}
                  deadline={state.data.next_price_update}
                />
              ))}
            </div>
          )}
          <p className="text-muted text-xs">
            Replacements play the same position, are in form, are being bought
            and are close to a price rise, and fit your budget and the
            three-per-club rule.{" "}
            {state.data.exact ? (
              "Budgets use your real selling prices."
            ) : (
              <>
                Budgets use current prices, not your selling prices —{" "}
                <Link href="/my-team" className="underline">
                  add your FPL token
                </Link>{" "}
                for exact figures.
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
}
