"use client";

import Image from "next/image";
import { useState } from "react";
import { H2HDialog } from "./h2h-dialog";
import { inputClass } from "./select";
import {
  badgeUrl,
  type FdrFixture,
  type FdrResponse,
  type FdrTeam,
} from "@/lib/api";

// FPL's FDR colours; the cells are filled, so they read the same in both themes
const FDR_STYLE: Record<number, string> = {
  1: "bg-[#257d5a] text-white",
  2: "bg-[#00ff86] text-neutral-900",
  3: "bg-[#e7e7e7] text-neutral-900",
  4: "bg-[#ff1751] text-white",
  5: "bg-[#80072d] text-white",
};
const SPAN_OPTIONS = [3, 5, 8, 10];
// a blank gameweek counts as the hardest possible week when ranking
const BLANK_SCORE = 5;

type Sort = "easiest" | "hardest" | "team";

function Cell({
  fixtures,
  onSelect,
}: {
  fixtures: FdrFixture[];
  onSelect: (f: FdrFixture) => void;
}) {
  if (!fixtures.length)
    return (
      <div className="text-muted bg-background flex h-full min-h-9 items-center justify-center rounded text-xs">
        Blank
      </div>
    );
  return (
    <div className="flex h-full flex-col gap-0.5">
      {fixtures.map((f, i) => (
        <button
          type="button"
          key={i}
          onClick={() => onSelect(f)}
          title={`${f.is_home ? "Home" : "Away"} vs ${f.opponent_short} · difficulty ${f.difficulty}${
            f.kickoff_time
              ? ` · ${new Date(f.kickoff_time).toLocaleString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : ""
          }. Click for the last 6 meetings`}
          className={`focus-visible:ring-accent flex min-h-9 flex-1 cursor-pointer items-center justify-center rounded px-1 text-xs font-semibold whitespace-nowrap transition hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none ${
            FDR_STYLE[f.difficulty] ?? FDR_STYLE[3]
          } ${f.finished ? "opacity-50" : ""}`}
        >
          {f.opponent_short} ({f.is_home ? "H" : "A"})
        </button>
      ))}
    </div>
  );
}

function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-muted inline-flex items-center gap-1.5 text-sm">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FdrTable({ data }: { data: FdrResponse }) {
  const lastEvent = data.events.at(-1)?.id ?? 38;
  const [from, setFrom] = useState(data.next_event ?? 1);
  const [span, setSpan] = useState(5);
  const [sort, setSort] = useState<Sort>("easiest");
  const [selected, setSelected] = useState<{
    team: FdrTeam;
    fixture: FdrFixture;
  } | null>(null);

  const to = Math.min(lastEvent, from + span - 1);
  const gws = Array.from({ length: to - from + 1 }, (_, i) => from + i);

  const byGw = (t: FdrTeam) =>
    gws.map((gw) => t.fixtures.filter((f) => f.event === gw));
  // average difficulty per gameweek: a double counts as the mean of its two
  // matches minus a bonus for the extra game, a blank as BLANK_SCORE
  const score = (t: FdrTeam) => {
    const weeks = byGw(t).map((fx) =>
      fx.length
        ? fx.reduce((s, f) => s + f.difficulty, 0) / fx.length - (fx.length - 1)
        : BLANK_SCORE,
    );
    return weeks.reduce((s, w) => s + w, 0) / Math.max(1, weeks.length);
  };
  const rows = data.teams
    .map((t) => ({ team: t, weeks: byGw(t), score: score(t) }))
    .sort((a, b) =>
      sort === "team"
        ? a.team.name.localeCompare(b.team.name)
        : (sort === "easiest" ? a.score - b.score : b.score - a.score) ||
          a.team.name.localeCompare(b.team.name),
    );

  const gwOptions: [string, string][] = data.events.map((e) => [
    String(e.id),
    `GW${e.id}`,
  ]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Picker
          label="From"
          value={String(from)}
          options={gwOptions}
          onChange={(v) => setFrom(Number(v))}
        />
        <Picker
          label="Show"
          value={String(span)}
          options={SPAN_OPTIONS.map((n) => [String(n), `${n} gameweeks`])}
          onChange={(v) => setSpan(Number(v))}
        />
        <Picker
          label="Sort"
          value={sort}
          options={[
            ["easiest", "Easiest first"],
            ["hardest", "Hardest first"],
            ["team", "Team name"],
          ]}
          onChange={(v) => setSort(v as Sort)}
        />
      </div>

      <div className="border-border bg-surface overflow-x-auto rounded-lg border">
        <table className="w-full border-separate border-spacing-1 text-sm tabular-nums">
          <thead>
            <tr className="text-left">
              <th className="bg-surface sticky left-0 z-10 px-2 py-1 font-medium">
                Team
              </th>
              {gws.map((gw) => (
                <th
                  key={gw}
                  className="min-w-[4.5rem] px-1 py-1 text-center font-medium"
                >
                  GW{gw}
                </th>
              ))}
              <th
                className="px-2 py-1 text-right font-medium"
                title="Average difficulty per gameweek over the range (doubles count easier, blanks as 5)"
              >
                Avg
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ team, weeks, score: s }) => (
              <tr key={team.id}>
                <th
                  scope="row"
                  className="bg-surface sticky left-0 z-10 px-2 py-1 text-left font-medium whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-2">
                    <Image
                      src={badgeUrl(team.code)}
                      alt=""
                      width={18}
                      height={18}
                    />
                    <span className="hidden sm:inline">{team.name}</span>
                    <span className="sm:hidden">{team.short_name}</span>
                  </span>
                </th>
                {weeks.map((fx, i) => (
                  <td key={gws[i]} className="h-px p-0 align-top">
                    <Cell
                      fixtures={fx}
                      onSelect={(fixture) => setSelected({ team, fixture })}
                    />
                  </td>
                ))}
                <td className="text-muted px-2 py-1 text-right">
                  {s.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-muted flex flex-wrap items-center gap-1.5 text-xs">
        <span>Difficulty:</span>
        {[1, 2, 3, 4, 5].map((d) => (
          <span
            key={d}
            className={`rounded px-2 py-0.5 font-semibold ${FDR_STYLE[d]}`}
          >
            {d}
          </span>
        ))}
        <span className="ml-1">
          · two cells in a gameweek = double gameweek · faded = already played ·
          click a fixture for the last 6 meetings
        </span>
      </div>

      {selected && (
        <H2HDialog
          key={`${selected.team.id}-${selected.fixture.opponent_id}-${selected.fixture.event}`}
          team={selected.team}
          fixture={selected.fixture}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
