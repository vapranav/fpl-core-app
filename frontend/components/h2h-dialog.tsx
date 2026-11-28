"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  badgeUrl,
  getHeadToHead,
  type FdrFixture,
  type FdrTeam,
  type H2HMatch,
  type HeadToHead,
} from "@/lib/api";

const RESULT_STYLE: Record<H2HMatch["result"], string> = {
  W: "bg-green-600 text-white",
  D: "bg-neutral-400 text-white dark:bg-neutral-600",
  L: "bg-red-600 text-white",
};

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; data: HeadToHead };

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function pair(a: number | null, b: number | null): string | null {
  return a === null || b === null ? null : `${a}–${b}`;
}

/** The last meetings of a fixture's two clubs, from the clicked team's side. */
export function H2HDialog({
  team,
  fixture,
  onClose,
}: {
  team: FdrTeam;
  fixture: FdrFixture;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    getHeadToHead(team.id, fixture.opponent_id)
      .then((data) => !cancelled && setState({ status: "ok", data }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [team.id, fixture.opponent_id]);

  const kickoff = fixture.kickoff_time
    ? new Date(fixture.kickoff_time).toLocaleString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // click on the backdrop (the dialog element itself) closes it
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="h2h-title"
      className="border-border bg-surface text-foreground m-auto w-[calc(100%-2rem)] max-w-xl rounded-lg border p-0 shadow-xl backdrop:bg-black/50"
    >
      <div className="p-4 sm:p-5">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              id="h2h-title"
              className="font-display flex items-center gap-2 text-lg font-semibold"
            >
              <Image src={badgeUrl(team.code)} alt="" width={22} height={22} />
              {team.short_name}
              <span className="text-muted font-normal">vs</span>
              <Image
                src={badgeUrl(fixture.opponent_code)}
                alt=""
                width={22}
                height={22}
              />
              {fixture.opponent_short}
            </h2>
            <p className="text-muted mt-0.5 text-xs">
              GW{fixture.event} · {fixture.is_home ? "Home" : "Away"} ·
              difficulty {fixture.difficulty}
              {kickoff ? ` · ${kickoff}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="text-muted hover:text-foreground -m-1 rounded p-1 text-xl leading-none"
          >
            ×
          </button>
        </header>

        <h3 className="mb-2 text-sm font-semibold">Last 6 meetings</h3>
        {state.status === "loading" && (
          <p className="text-muted py-6 text-center text-sm">
            Loading head-to-head…
          </p>
        )}
        {state.status === "error" && (
          <p className="py-6 text-center text-sm text-red-600 dark:text-red-400">
            Could not load past meetings — try again shortly.
          </p>
        )}
        {state.status === "ok" && <Body data={state.data} />}
      </div>
    </dialog>
  );
}

function Body({ data }: { data: HeadToHead }) {
  const { summary: s, matches, team } = data;
  if (!matches.length)
    return (
      <p className="text-muted py-6 text-center text-sm">
        These clubs haven&apos;t met in the top two divisions since 1993-94.
      </p>
    );
  return (
    <>
      <div className="mb-3 grid grid-cols-4 gap-2 text-center">
        {(
          [
            [
              `${team.short_name} won`,
              s.wins,
              "text-green-600 dark:text-green-400",
            ],
            ["Drawn", s.draws, "text-muted"],
            [
              `${team.short_name} lost`,
              s.losses,
              "text-red-600 dark:text-red-400",
            ],
            ["Goals", `${s.goals_for}–${s.goals_against}`, ""],
          ] as [string, string | number, string][]
        ).map(([label, value, tone]) => (
          <div key={label} className="bg-background rounded-md p-2">
            <div className={`text-lg font-semibold tabular-nums ${tone}`}>
              {value}
            </div>
            <div className="text-muted text-[11px]">{label}</div>
          </div>
        ))}
      </div>
      <ul className="divide-border divide-y">
        {matches.map((m) => (
          <MatchRow key={`${m.date}-${m.home}`} m={m} />
        ))}
      </ul>
      <p className="text-muted mt-3 text-[11px]">
        League meetings only (Premier League and second tier) · source{" "}
        <a
          href="https://www.football-data.co.uk/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          football-data.co.uk
        </a>
      </p>
    </>
  );
}

function MatchRow({ m }: { m: H2HMatch }) {
  const ht = pair(m.home_ht, m.away_ht);
  const shots = pair(m.home_shots, m.away_shots);
  const onTarget = pair(m.home_shots_on_target, m.away_shots_on_target);
  const reds = (m.home_red ?? 0) + (m.away_red ?? 0);
  const details = [
    ht && `HT ${ht}`,
    shots && `shots ${shots}${onTarget ? ` (${onTarget} on target)` : ""}`,
    reds > 0 && `${reds} red${reds > 1 ? "s" : ""}`,
    m.referee && `ref ${m.referee}`,
  ].filter(Boolean);

  return (
    <li className="py-2">
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-bold ${RESULT_STYLE[m.result]}`}
          title={{ W: "Win", D: "Draw", L: "Loss" }[m.result]}
        >
          {m.result}
        </span>
        <span className="min-w-0 flex-1 truncate text-right">
          <span className={m.team_is_home ? "font-semibold" : ""}>
            {m.home}
          </span>
        </span>
        <span className="bg-background shrink-0 rounded px-2 py-0.5 font-semibold tabular-nums">
          {m.home_score}–{m.away_score}
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className={m.team_is_home ? "" : "font-semibold"}>
            {m.away}
          </span>
        </span>
      </div>
      <div className="text-muted mt-0.5 pl-7 text-[11px]">
        {fmtDate(m.date)} · {m.competition}
        {m.competition !== "Premier League" ? "" : ` ${m.season}`}
        {details.length ? ` · ${details.join(" · ")}` : ""}
      </div>
    </li>
  );
}
