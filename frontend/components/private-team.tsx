"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { normalizeToken, tokenExpiry, useFplToken } from "./fpl-token";
import { PlayerPhoto } from "./player-photo";
import { inputClass } from "./select";
import {
  ApiRequestError,
  getMe,
  getPrivateTeam,
  type PrivateChip,
  type PrivateTeam as PrivateTeamData,
} from "@/lib/api";

const CHIP_LABELS: Record<string, string> = {
  wildcard: "Wildcard",
  freehit: "Free Hit",
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
  manager: "Assistant Manager",
};

function fmtMoney(m: number | null): string {
  return m === null ? "–" : `£${m.toFixed(1)}m`;
}

function fmtExpiry(exp: Date | null): string | null {
  if (!exp) return null;
  const mins = Math.round((exp.getTime() - Date.now()) / 60000);
  if (mins <= 0) return "expired";
  if (mins < 120) return `expires in ${mins} min`;
  return `expires ${exp.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}`;
}

/**
 * The token-protected part of My Team: selling prices, free transfers and chip
 * availability. Needs the user's own FPL access token (see the extension).
 */
export function PrivateTeam({ entryId }: { entryId: number }) {
  const [token, setToken] = useFplToken();
  if (token === null)
    return <TokenForm entryId={entryId} onSave={(t) => setToken(t)} />;
  return (
    <PrivateView
      key={token}
      entryId={entryId}
      token={token}
      onForget={() => setToken(null)}
    />
  );
}

// ---- token entry ------------------------------------------------------------

function TokenForm({
  entryId,
  onSave,
}: {
  entryId: number;
  onSave: (token: string) => void;
}) {
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = normalizeToken(value);
    if (!token) {
      setError("Paste your FPL access token");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const me = await getMe(token);
      if (me.entry_id !== entryId) {
        setError(
          `That token belongs to team ${me.entry_id}, not ${entryId}. Connect that team instead, or sign in to FPL with the right account.`,
        );
        setChecking(false);
        return;
      }
      onSave(token);
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.status === 401
          ? "FPL rejected that token — it may have expired. Copy a fresh one."
          : "Could not check the token with FPL — try again",
      );
      setChecking(false);
    }
  }

  return (
    <section className="border-border bg-surface mb-6 rounded-lg border p-4 sm:p-6">
      <h2 className="font-display text-lg font-semibold">
        Unlock private team data
      </h2>
      <p className="text-muted mt-1 text-sm">
        Selling prices, free transfers and remaining chips are only visible to
        you on FPL. Paste your FPL access token to see them here. The FPL Core
        Chrome extension copies it in one click from a signed-in
        fantasy.premierleague.com tab.
      </p>
      <form
        onSubmit={onSubmit}
        className="mt-4 flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="fpl-token" className="sr-only">
          FPL access token
        </label>
        <input
          id="fpl-token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="eyJhbGciOi…"
          className={`${inputClass} min-w-0 flex-1 font-mono`}
        />
        <button
          type="submit"
          disabled={checking}
          className="bg-accent rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:text-neutral-900"
        >
          {checking ? "Checking…" : "Save token"}
        </button>
      </form>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      <p className="text-muted mt-2 text-xs">
        Stored only in this browser and sent to FPL through our API, which never
        keeps it. FPL tokens expire after a while; copy a fresh one when asked.
      </p>
    </section>
  );
}

// ---- private view -----------------------------------------------------------

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string; expired: boolean }
  | { status: "ok"; data: PrivateTeamData };

function PrivateView({
  entryId,
  token,
  onForget,
}: {
  entryId: number;
  token: string;
  onForget: () => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const expiry = fmtExpiry(tokenExpiry(token));

  useEffect(() => {
    let cancelled = false;
    getPrivateTeam(entryId, token)
      .then((data) => !cancelled && setState({ status: "ok", data }))
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = err instanceof ApiRequestError ? err.status : 0;
        setState({
          status: "error",
          expired: status === 401,
          message:
            status === 401
              ? "FPL rejected your saved token — it has probably expired."
              : status === 404
                ? "FPL only shows this to the team's owner — is this your team?"
                : "Failed to load your private team data — try again",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [entryId, token]);

  const header = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-display text-lg font-semibold">
        Next deadline{" "}
        <span className="text-muted text-xs font-normal">
          · private{expiry ? ` · token ${expiry}` : ""}
        </span>
      </h2>
      <button
        type="button"
        onClick={onForget}
        className="border-border bg-background text-muted hover:text-foreground rounded-md border px-3 py-1 text-xs"
      >
        Remove token
      </button>
    </div>
  );

  if (state.status === "loading")
    return (
      <section className="mb-6">
        {header}
        <p className="text-muted border-border bg-surface rounded-lg border p-4 text-sm">
          Loading private team data…
        </p>
      </section>
    );

  if (state.status === "error")
    return (
      <section className="mb-6">
        {header}
        <div className="border-border bg-surface rounded-lg border p-4 text-sm">
          <p className="text-red-600 dark:text-red-400">{state.message}</p>
          {state.expired && (
            <button
              type="button"
              onClick={onForget}
              className="bg-accent mt-3 rounded-md px-3 py-1.5 text-sm font-medium text-white dark:text-neutral-900"
            >
              Paste a new token
            </button>
          )}
        </div>
      </section>
    );

  const { transfers, chips, picks } = state.data;
  const stats = [
    {
      label: "Free transfers",
      value: transfers.free === null ? "Unlimited" : String(transfers.free),
    },
    { label: "Made this GW", value: String(transfers.made ?? "–") },
    { label: "Hit per extra", value: `${transfers.cost ?? 4} pts` },
    { label: "Bank", value: fmtMoney(transfers.bank) },
    { label: "Selling value", value: fmtMoney(transfers.value) },
  ];

  return (
    <section className="mb-6">
      {header}
      <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="border-border bg-surface rounded-md border p-3"
          >
            <dt className="text-muted text-xs">{s.label}</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      {chips.length > 0 && <Chips chips={chips} />}

      <div className="border-border bg-surface overflow-x-auto rounded-lg border">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-background text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-3 py-2 text-right font-medium">Bought</th>
              <th className="px-3 py-2 text-right font-medium">Now</th>
              <th className="px-3 py-2 text-right font-medium">Sell</th>
              <th className="px-3 py-2 text-right font-medium">+/–</th>
            </tr>
          </thead>
          <tbody>
            {picks.map((p) => {
              const diff =
                p.selling_price !== null && p.purchase_price !== null
                  ? p.selling_price - p.purchase_price
                  : null;
              return (
                <tr
                  key={p.element}
                  className={`border-border border-t ${p.squad_position > 11 ? "text-muted" : ""}`}
                >
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <PlayerPhoto src={p.photo_url} alt={p.web_name} />
                      <Link
                        href={`/players/${p.element}`}
                        className="font-medium hover:underline"
                      >
                        {p.web_name}
                      </Link>
                      <span className="text-muted text-xs">
                        {p.team_short ?? ""}
                      </span>
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
                  <td className="px-3 py-1.5 text-right">
                    {fmtMoney(p.purchase_price)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {fmtMoney(p.now_cost)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold">
                    {fmtMoney(p.selling_price)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right ${
                      diff === null || diff === 0
                        ? "text-muted"
                        : diff > 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {diff === null
                      ? "–"
                      : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Chips({ chips }: { chips: PrivateChip[] }) {
  return (
    <ul className="mb-4 flex flex-wrap gap-2">
      {chips.map((c, i) => {
        const label = CHIP_LABELS[c.name] ?? c.name;
        const window =
          c.start_event && c.stop_event
            ? `GW${c.start_event}–${c.stop_event}`
            : null;
        const tone = c.is_pending
          ? "border-accent text-accent"
          : c.status === "available"
            ? "border-green-600/40 text-green-700 dark:text-green-400"
            : "border-border text-muted line-through";
        const detail = c.is_pending
          ? "active"
          : c.status === "played"
            ? `played GW${c.played_events.join(", ")}`
            : c.status === "available"
              ? `available${window ? ` ${window}` : ""}`
              : (c.status ?? "");
        return (
          <li
            key={`${c.name}-${i}`}
            className={`rounded-md border px-2.5 py-1 text-xs ${tone}`}
            title={detail}
          >
            <span className="font-semibold">{label}</span>{" "}
            <span className="no-underline opacity-80">{detail}</span>
          </li>
        );
      })}
    </ul>
  );
}
