import type { ComparePlayer } from "@/lib/api";

type Row = {
  group: string;
  label: string;
  get: (p: ComparePlayer) => number | null;
  format?: (v: number) => string;
  lowerIsBetter?: boolean;
};

const money = (tenths: number) => `£${(tenths / 10).toFixed(1)}m`;
const fixed1 = (v: number) => v.toFixed(1);
const fixed2 = (v: number) => v.toFixed(2);
const int = (v: number) => v.toLocaleString("en-GB");
const ordinal = (v: number) =>
  v === 1 ? "1st" : v === 2 ? "2nd" : v === 3 ? "3rd" : `${v}th`;
const signed1 = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
const signedMoney = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "-" : ""}£${Math.abs(v).toFixed(1)}m`;
const per90 = (count: number, minutes: number) =>
  minutes > 0 ? (count / minutes) * 90 : null;

/** Change between FPL-Core-Insights snapshots (the FPL API only has current values). */
function trendDelta(
  p: ComparePlayer,
  field: "ep_next" | "selected_by_percent",
  since: "previous" | "start",
): number | null {
  const t = p.trend;
  if (t.length < 2) return null;
  const latest = t[t.length - 1][field];
  const base = (since === "previous" ? t[t.length - 2] : t[0])[field];
  if (latest === null || base === null) return null;
  return Math.round((latest - base) * 10) / 10;
}

const ROWS: Row[] = [
  {
    group: "Overview",
    label: "Price",
    get: (p) => p.now_cost,
    format: money,
    lowerIsBetter: true,
  },
  {
    group: "Overview",
    label: "Selected by",
    get: (p) => p.selected_by_percent,
    format: (v) => `${v.toFixed(1)}%`,
  },
  { group: "Overview", label: "Total points", get: (p) => p.total_points },
  { group: "Overview", label: "Last GW points", get: (p) => p.event_points },
  { group: "Overview", label: "Form", get: (p) => p.form, format: fixed1 },
  {
    group: "Overview",
    label: "Points per game",
    get: (p) => p.points_per_game,
    format: fixed1,
  },
  {
    group: "Overview",
    label: "Value (pts/£m)",
    get: (p) => p.value_season,
    format: fixed1,
  },
  {
    group: "Overview",
    label: "Dream team apps",
    get: (p) => p.dreamteam_count,
  },

  {
    group: "Projections & ranks",
    label: "Expected pts, next GW",
    get: (p) => p.ep_next,
    format: fixed1,
  },
  {
    group: "Projections & ranks",
    label: "Expected pts, this GW",
    get: (p) => p.ep_this,
    format: fixed1,
  },
  {
    group: "Projections & ranks",
    label: "Price change since start",
    get: (p) => p.cost_change_start,
    format: signedMoney,
  },
  {
    group: "Projections & ranks",
    label: "Form rank",
    get: (p) => p.form_rank,
    lowerIsBetter: true,
  },
  {
    group: "Projections & ranks",
    label: "Points-per-game rank",
    get: (p) => p.points_per_game_rank,
    lowerIsBetter: true,
  },
  {
    group: "Projections & ranks",
    label: "ICT rank",
    get: (p) => p.ict_index_rank,
    lowerIsBetter: true,
  },
  {
    group: "Projections & ranks",
    label: "Ownership rank",
    get: (p) => p.selected_rank,
    lowerIsBetter: true,
  },

  {
    group: "Trends",
    label: "Expected pts vs last GW",
    get: (p) => trendDelta(p, "ep_next", "previous"),
    format: signed1,
  },
  {
    group: "Trends",
    label: "Ownership change vs last GW",
    get: (p) => trendDelta(p, "selected_by_percent", "previous"),
    format: (v) => `${signed1(v)} pp`,
  },
  {
    group: "Trends",
    label: "Ownership change since GW1",
    get: (p) => trendDelta(p, "selected_by_percent", "start"),
    format: (v) => `${signed1(v)} pp`,
  },

  {
    group: "Set pieces",
    label: "Penalty order",
    get: (p) => p.penalties_order,
    format: ordinal,
    lowerIsBetter: true,
  },
  {
    group: "Set pieces",
    label: "Corners / indirect FK order",
    get: (p) => p.corners_and_indirect_freekicks_order,
    format: ordinal,
    lowerIsBetter: true,
  },
  {
    group: "Set pieces",
    label: "Direct FK order",
    get: (p) => p.direct_freekicks_order,
    format: ordinal,
    lowerIsBetter: true,
  },

  {
    group: "Playing time",
    label: "Minutes",
    get: (p) => p.minutes,
    format: int,
  },
  { group: "Playing time", label: "Starts", get: (p) => p.starts },

  { group: "Attack", label: "Goals", get: (p) => p.goals_scored },
  {
    group: "Attack",
    label: "Goals per 90",
    get: (p) => per90(p.goals_scored, p.minutes),
    format: fixed2,
  },
  { group: "Attack", label: "Assists", get: (p) => p.assists },
  {
    group: "Attack",
    label: "Assists per 90",
    get: (p) => per90(p.assists, p.minutes),
    format: fixed2,
  },
  {
    group: "Attack",
    label: "xG",
    get: (p) => p.expected_goals,
    format: fixed2,
  },
  {
    group: "Attack",
    label: "xA",
    get: (p) => p.expected_assists,
    format: fixed2,
  },
  {
    group: "Attack",
    label: "xGI",
    get: (p) => p.expected_goal_involvements,
    format: fixed2,
  },
  {
    group: "Attack",
    label: "xG per 90",
    get: (p) => p.expected_goals_per_90,
    format: fixed2,
  },
  {
    group: "Attack",
    label: "xA per 90",
    get: (p) => p.expected_assists_per_90,
    format: fixed2,
  },
  {
    group: "Attack",
    label: "xGI per 90",
    get: (p) => p.expected_goal_involvements_per_90,
    format: fixed2,
  },

  { group: "Defence", label: "Clean sheets", get: (p) => p.clean_sheets },
  {
    group: "Defence",
    label: "Clean sheets per 90",
    get: (p) => p.clean_sheets_per_90,
    format: fixed2,
  },
  {
    group: "Defence",
    label: "Goals conceded",
    get: (p) => p.goals_conceded,
    lowerIsBetter: true,
  },
  {
    group: "Defence",
    label: "xGC",
    get: (p) => p.expected_goals_conceded,
    format: fixed2,
    lowerIsBetter: true,
  },
  {
    group: "Defence",
    label: "xGC per 90",
    get: (p) => p.expected_goals_conceded_per_90,
    format: fixed2,
    lowerIsBetter: true,
  },
  {
    group: "Defence",
    label: "Defensive contribution",
    get: (p) => p.defensive_contribution,
  },
  {
    group: "Defence",
    label: "Def. contribution per 90",
    get: (p) => p.defensive_contribution_per_90,
    format: fixed2,
  },
  { group: "Defence", label: "Tackles", get: (p) => p.tackles },
  {
    group: "Defence",
    label: "Clearances, blocks, interceptions",
    get: (p) => p.clearances_blocks_interceptions,
  },
  { group: "Defence", label: "Recoveries", get: (p) => p.recoveries },
  { group: "Defence", label: "Saves", get: (p) => p.saves },
  {
    group: "Defence",
    label: "Saves per 90",
    get: (p) => p.saves_per_90,
    format: fixed2,
  },

  { group: "Bonus & ICT", label: "Bonus", get: (p) => p.bonus },
  { group: "Bonus & ICT", label: "BPS", get: (p) => p.bps },
  {
    group: "Bonus & ICT",
    label: "ICT index",
    get: (p) => p.ict_index,
    format: fixed1,
  },
  {
    group: "Bonus & ICT",
    label: "Influence",
    get: (p) => p.influence,
    format: fixed1,
  },
  {
    group: "Bonus & ICT",
    label: "Creativity",
    get: (p) => p.creativity,
    format: fixed1,
  },
  {
    group: "Bonus & ICT",
    label: "Threat",
    get: (p) => p.threat,
    format: fixed1,
  },

  {
    group: "Discipline",
    label: "Yellow cards",
    get: (p) => p.yellow_cards,
    lowerIsBetter: true,
  },
  {
    group: "Discipline",
    label: "Red cards",
    get: (p) => p.red_cards,
    lowerIsBetter: true,
  },

  {
    group: "Transfers (this GW)",
    label: "Transfers in",
    get: (p) => p.transfers_in_event,
    format: int,
  },
  {
    group: "Transfers (this GW)",
    label: "Transfers out",
    get: (p) => p.transfers_out_event,
    format: int,
    lowerIsBetter: true,
  },
];

const GROUPS = [...new Set(ROWS.map((r) => r.group))];

function bestValue(row: Row, players: ComparePlayer[]): number | null {
  const values = players.map(row.get).filter((v): v is number => v !== null);
  if (values.length < 2 || values.every((v) => v === values[0])) return null;
  return row.lowerIsBetter ? Math.min(...values) : Math.max(...values);
}

export function CompareTable({ players }: { players: ComparePlayer[] }) {
  return (
    <div className="border-border bg-surface overflow-x-auto rounded-lg border">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-background">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Stat</th>
            {players.map((p) => (
              <th
                key={p.id}
                className="px-3 py-2 text-right font-medium whitespace-nowrap"
              >
                {p.web_name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((group) => (
            <GroupRows key={group} group={group} players={players} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  group,
  players,
}: {
  group: string;
  players: ComparePlayer[];
}) {
  return (
    <>
      <tr className="border-border bg-background/60 border-t">
        <td
          colSpan={players.length + 1}
          className="text-muted px-3 py-1 text-xs font-medium tracking-wide uppercase"
        >
          {group}
        </td>
      </tr>
      {ROWS.filter((r) => r.group === group).map((row) => {
        const best = bestValue(row, players);
        return (
          <tr key={row.label} className="border-border border-t">
            <td className="text-muted px-3 py-1.5">{row.label}</td>
            {players.map((p) => {
              const v = row.get(p);
              const isBest = best !== null && v === best;
              return (
                <td
                  key={p.id}
                  className={`px-3 py-1.5 text-right whitespace-nowrap ${
                    v === null
                      ? "text-muted"
                      : isBest
                        ? "font-semibold text-green-600 dark:text-green-400"
                        : ""
                  }`}
                >
                  {v === null ? "–" : row.format ? row.format(v) : v}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
