import Image from "next/image";
import Link from "next/link";
import type { ManagerTeam, SquadPick } from "@/lib/api";

// Formation view in the style of the official FPL app: goalkeeper at the
// top, then defenders, midfielders and forwards; bench underneath in order.

const ROWS = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

const POS_SHORT: Record<string, string> = {
  Goalkeeper: "GKP",
  Defender: "DEF",
  Midfielder: "MID",
  Forward: "FWD",
};

const CHIPS: Record<string, string> = {
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
  freehit: "Free Hit",
  wildcard: "Wildcard",
  manager: "Assistant Manager",
};

/** Official FPL kit image; goalkeepers wear the `_1` shirt. */
function shirtUrl(teamCode: number, goalkeeper: boolean): string {
  return `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}${goalkeeper ? "_1" : ""}-110.webp`;
}

/** Points that count: GW points x multiplier (0 on the bench, so show raw). */
function shownPoints(p: SquadPick): number | null {
  if (p.gw_points === null) return null;
  return p.multiplier > 0 ? p.gw_points * p.multiplier : p.gw_points;
}

function Armband({ pick }: { pick: SquadPick }) {
  if (!pick.is_captain && !pick.is_vice_captain) return null;
  const label = pick.is_captain ? (pick.multiplier === 3 ? "TC" : "C") : "V";
  return (
    <span
      className={`absolute -top-1 right-0 z-10 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold shadow ring-1 sm:right-1 ${
        pick.is_captain
          ? "bg-neutral-900 text-white ring-white/70"
          : "bg-white text-neutral-900 ring-neutral-900/30"
      }`}
      title={
        pick.is_captain
          ? pick.multiplier === 3
            ? "Triple captain"
            : "Captain"
          : "Vice-captain"
      }
    >
      {label}
    </span>
  );
}

function PlayerTile({
  pick,
  subbedIn,
  subbedOut,
  label,
}: {
  pick: SquadPick;
  subbedIn?: boolean;
  subbedOut?: boolean;
  /** shown above a bench player: GKP, 1. DEF, 2. MID, ... */
  label?: string;
}) {
  const goalkeeper = pick.position === "Goalkeeper";
  const pts = shownPoints(pick);
  const played = (pick.minutes ?? 0) > 0;
  return (
    <Link
      href={`/players/${pick.element}`}
      className={`group relative flex w-16 flex-col items-center sm:w-20 ${subbedOut ? "opacity-50" : ""}`}
      title={`${pick.web_name}${pick.team_name ? ` · ${pick.team_name}` : ""}${
        pick.minutes !== null ? ` · ${pick.minutes} min` : ""
      }${subbedIn ? " · auto-subbed in" : subbedOut ? " · auto-subbed out" : ""}`}
    >
      {label && (
        <span className="mb-0.5 text-[10px] font-semibold tracking-wide text-neutral-600 uppercase dark:text-neutral-300">
          {label}
        </span>
      )}
      <div className="relative">
        <Armband pick={pick} />
        {subbedIn && (
          <span
            className="absolute -top-1 left-0 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-[11px] font-bold text-white shadow sm:left-1"
            aria-label="Auto-subbed in"
          >
            ↑
          </span>
        )}
        {pick.team_code !== null ? (
          <Image
            src={shirtUrl(pick.team_code, goalkeeper)}
            alt=""
            width={56}
            height={74}
            className="h-auto w-11 drop-shadow-md transition-transform group-hover:-translate-y-0.5 sm:w-14"
          />
        ) : (
          <div className="h-14 w-11 rounded-md bg-white/30 sm:h-[74px] sm:w-14" />
        )}
      </div>
      <div className="mt-0.5 w-full overflow-hidden rounded-[3px] text-center shadow-md">
        <div className="truncate bg-white px-1 py-0.5 text-[10px] font-semibold text-neutral-900 sm:text-xs">
          {pick.web_name}
        </div>
        <div
          className={`py-0.5 text-[10px] font-bold text-white tabular-nums sm:text-xs ${
            played || pts ? "bg-[#37003c]" : "bg-[#37003c]/70"
          }`}
        >
          {pts ?? "–"}
        </div>
      </div>
    </Link>
  );
}

/** Half a pitch, drawn in white lines over striped grass. */
function PitchMarkings() {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <g
        fill="none"
        stroke="white"
        strokeOpacity={0.45}
        strokeWidth={0.6}
        vectorEffect="non-scaling-stroke"
      >
        <rect x="2" y="1.5" width="96" height="97" />
        {/* penalty area, six-yard box and arc at the goalkeeper's end */}
        <rect x="22" y="1.5" width="56" height="17" />
        <rect x="37" y="1.5" width="26" height="6" />
        <path d="M40 18.5 Q50 25 60 18.5" />
        {/* halfway line and centre circle at the bottom */}
        <path d="M2 98.5 H98" />
        <path d="M36 98.5 A14 12 0 0 1 64 98.5" />
      </g>
    </svg>
  );
}

export function SquadPitch({ team }: { team: ManagerTeam }) {
  const starters = team.picks.filter((p) => p.squad_position <= 11);
  const bench = team.picks.filter((p) => p.squad_position > 11);
  const subbedIn = new Set(team.automatic_subs.map((s) => s.element_in));
  const subbedOut = new Set(team.automatic_subs.map((s) => s.element_out));
  const unknown = starters.filter(
    (p) => !p.position || !ROWS.includes(p.position),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold">
          GW{team.gw}: {team.gw_points ?? "–"} pts
          {(team.event_transfers_cost ?? 0) > 0 && (
            <span className="ml-2 font-normal text-red-600 dark:text-red-400">
              (−{team.event_transfers_cost} hit)
            </span>
          )}
        </span>
        <span className="text-muted flex flex-wrap items-center gap-3">
          {team.active_chip && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              {CHIPS[team.active_chip] ?? team.active_chip}
            </span>
          )}
          <span>Bench: {team.points_on_bench ?? "–"} pts</span>
        </span>
      </div>

      <div
        className="relative overflow-hidden rounded-xl px-1 py-4 sm:px-4 sm:py-6"
        style={{
          // mowing stripes, like the official app's pitch
          backgroundColor: "#0e8a3e",
          backgroundImage:
            "repeating-linear-gradient(180deg, rgba(255,255,255,0.06) 0 32px, rgba(0,0,0,0.03) 32px 64px)",
        }}
      >
        <PitchMarkings />
        <div className="relative flex flex-col gap-4 sm:gap-6">
          {ROWS.map((row) => {
            const players = starters.filter((p) => p.position === row);
            if (players.length === 0) return null;
            return (
              <div
                key={row}
                className="flex justify-center gap-1 sm:gap-6"
                aria-label={`${row}s`}
              >
                {players.map((p) => (
                  <PlayerTile
                    key={p.element}
                    pick={p}
                    subbedIn={subbedIn.has(p.element)}
                    subbedOut={subbedOut.has(p.element)}
                  />
                ))}
              </div>
            );
          })}
          {unknown.length > 0 && (
            <div className="flex justify-center gap-1 sm:gap-6">
              {unknown.map((p) => (
                <PlayerTile key={p.element} pick={p} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-[#d6f5e3] px-1 py-3 sm:px-4 dark:bg-[#123d26]">
        <p className="sr-only">Bench</p>
        <div className="flex justify-center gap-2 sm:gap-8">
          {bench.map((p, i) => (
            <PlayerTile
              key={p.element}
              pick={p}
              label={
                p.position === "Goalkeeper"
                  ? "GKP"
                  : `${i + (bench[0]?.position === "Goalkeeper" ? 0 : 1)}. ${
                      POS_SHORT[p.position ?? ""] ?? ""
                    }`
              }
              subbedIn={subbedIn.has(p.element)}
              subbedOut={subbedOut.has(p.element)}
            />
          ))}
        </div>
      </div>
      <p className="text-muted text-xs">
        Live GW points (captain counted double). Bench players show what they
        scored; it only counts with Bench Boost or an automatic sub.
      </p>
    </div>
  );
}
