// server components fetch API_URL (compose network / Vercel runtime), the
// browser fetches NEXT_PUBLIC_API_URL (host-reachable); same value in dev
const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

export interface PlayerStats {
  total_points: number | null;
  event_points: number | null;
  form: number | null;
  now_cost: number | null;
  selected_by_percent: number | null;
  expected_goals: number | null;
  expected_assists: number | null;
  goals_scored: number | null;
  assists: number | null;
  minutes: number | null;
  defensive_contribution: number | null;
  ict_index: number | null;
  points_per_game: number | null;
}

export interface Player {
  season: string;
  player_id: number;
  player_code: number | null;
  first_name: string;
  second_name: string;
  web_name: string;
  team_code: number;
  position: string;
  photo_url: string | null;
  team_name: string;
  stats: PlayerStats;
}

export interface PlayersResponse {
  season: string;
  total: number;
  limit: number;
  offset: number;
  players: Player[];
}

export interface Team {
  code: number;
  id: number;
  name: string;
  short_name: string;
  elo: number | null;
  badge_url: string | null;
}

export interface PlayersQuery {
  season?: string;
  team_code?: string;
  position?: string;
  search?: string;
  sort?: string;
  order?: string;
  limit?: string;
  offset?: string;
}

export function badgeUrl(teamCode: number): string {
  return `https://resources.premierleague.com/premierleague/badges/50/t${teamCode}.png`;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`API ${res.status} for ${path}`);
  return res.json();
}

export function getPlayers(q: PlayersQuery): Promise<PlayersResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) qs.set(k, v);
  return get(`/api/players?${qs.toString()}`);
}

export function getTeams(season?: string): Promise<{ teams: Team[] }> {
  return get(`/api/teams${season ? `?season=${season}` : ""}`);
}

export interface Gameweek {
  id: number;
  name: string;
  deadline_time: string | null;
  is_current: boolean;
  is_next: boolean;
  finished: boolean;
  highest_score: number | null;
}

export function getGameweeks(
  season?: string,
): Promise<{ gameweeks: Gameweek[] }> {
  return get(`/api/gameweeks${season ? `?season=${season}` : ""}`);
}

// ---- player detail --------------------------------------------------------

export interface PlayerDetail extends Omit<Player, "stats" | "team_name"> {
  season_stats: PlayerStats | null;
  team_history: { gw: number; team_code: number }[];
}

export interface GameweekStat {
  gw: number;
  event_points: number | null;
  total_points: number | null;
  goals_scored: number | null;
  assists: number | null;
  minutes: number | null;
  expected_goals: number | null;
  expected_assists: number | null;
  defensive_contribution: number | null;
  now_cost: number | null;
  selected_by_percent: number | null;
}

export interface MatchInfo {
  match_id: string;
  gameweek: number | null;
  kickoff_time: string | null;
  home_team: number | null;
  away_team: number | null;
  home_score: number | null;
  away_score: number | null;
  home_team_elo: number | null;
  away_team_elo: number | null;
  finished: boolean | null;
}

export interface PlayerMatchRow {
  gw: number | null;
  match_id: string;
  minutes_played: number | null;
  goals: number | null;
  assists: number | null;
  xg: number | null;
  xa: number | null;
  total_shots: number | null;
  shots_on_target: number | null;
  tackles_won: number | null;
  interceptions: number | null;
  clearances: number | null;
  blocks: number | null;
  match: MatchInfo;
}

export function getPlayer(id: number, season?: string): Promise<PlayerDetail> {
  return get(`/api/players/${id}${season ? `?season=${season}` : ""}`);
}

export function getPlayerGameweeks(
  id: number,
  season?: string,
): Promise<{ gameweeks: GameweekStat[] }> {
  return get(
    `/api/players/${id}/gameweeks${season ? `?season=${season}` : ""}`,
  );
}

export function getPlayerMatches(
  id: number,
  season?: string,
): Promise<{ matches: PlayerMatchRow[] }> {
  return get(`/api/players/${id}/matches${season ? `?season=${season}` : ""}`);
}

// ---- matches ---------------------------------------------------------------

export interface MatchesQuery {
  season?: string;
  gw?: string;
  team_code?: string;
  finished?: string;
  limit?: string;
  offset?: string;
}

export function getMatches(
  q: MatchesQuery,
): Promise<{ season: string; total: number; matches: MatchInfo[] }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) qs.set(k, v);
  return get(`/api/matches?${qs.toString()}`);
}

// ---- match timeline --------------------------------------------------------

export interface ShotRow {
  match_id: string;
  shot_index: number;
  gw: number | null;
  minute: number | null;
  added_time: number | null;
  is_home: boolean | null;
  player_id: number | null;
  player_name: string | null;
  outcome: string | null;
  situation: string | null;
  body_part: string | null;
  xg: number | null;
  xgot: number | null;
  start_x: number | null;
  start_y: number | null;
  goal_mouth_y: number | null;
  goal_mouth_z: number | null;
  goal_mouth_location: string | null;
}

export interface MomentumPoint {
  match_id: string;
  gw: number | null;
  minute: number;
  value: number | null;
}

export interface XgMinutePoint {
  match_id: string;
  gw: number | null;
  minute: number;
  home_xg: number | null;
  away_xg: number | null;
  home_cumulative_xg: number | null;
  away_cumulative_xg: number | null;
}

export interface MatchTimeline {
  season: string;
  match: MatchInfo & {
    home_team_name: string | null;
    away_team_name: string | null;
  };
  shots: ShotRow[];
  momentum: MomentumPoint[];
  xg_by_minute: XgMinutePoint[];
}

export function getMatchTimeline(
  matchId: string,
  season?: string,
): Promise<MatchTimeline> {
  return get(
    `/api/matches/${encodeURIComponent(matchId)}/timeline${season ? `?season=${season}` : ""}`,
  );
}

// ---- differentials ---------------------------------------------------------

export interface NextFixture {
  gw: number | null;
  home: boolean;
  opp_code: number | null;
  opp_name: string | null;
  opp_elo: number | null;
}

export interface Differential {
  player_id: number;
  web_name: string;
  team_code: number;
  team_name: string | null;
  position: string;
  photo_url: string | null;
  ownership: number | null;
  form: number | null;
  points_per_game: number | null;
  xgi_per_90: number;
  fixture_ease: number;
  score: number;
  next_fixtures: NextFixture[];
}

export interface DifferentialsResponse {
  season: string;
  max_ownership: number;
  league_avg_elo: number;
  total: number;
  differentials: Differential[];
}

export function getDifferentials(q: {
  season?: string;
  max_ownership?: string;
  position?: string;
}): Promise<DifferentialsResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) qs.set(k, v);
  return get(`/api/differentials?${qs.toString()}`);
}

// ---- rotation risk -----------------------------------------------------------

export interface RotationRisk {
  player_id: number;
  web_name: string;
  team_code: number;
  team_name: string | null;
  position: string;
  photo_url: string | null;
  next_fixture: {
    gw: number | null;
    kickoff_time: string | null;
    home: boolean;
    opp_code: number | null;
    opp_name: string | null;
  };
  midweek: {
    match_id: string;
    competition: string;
    kickoff_time: string | null;
    minutes: number;
  };
  history: {
    sample: number;
    avg_minutes_after: number | null;
    baseline_minutes: number | null;
    delta: number | null;
  };
  risk: number;
  risk_label: "High" | "Medium" | "Low";
}

export function getRotationRisk(q: {
  season?: string;
  days?: string;
}): Promise<{
  season: string;
  days: number;
  total: number;
  players: RotationRisk[];
}> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) qs.set(k, v);
  return get(`/api/rotation-risk?${qs.toString()}`);
}

// ---- defensive contributions (CBIT) -------------------------------------------

export interface DefconEntry {
  player_id: number;
  web_name: string;
  team_code: number;
  team_name: string | null;
  position: string;
  photo_url: string | null;
  cbit_total: number;
  matches_played: number;
  minutes_total: number;
  cbit_per_90: number;
  cbit_per_match: number;
  threshold_rate: number;
  clearances_per_90: number;
  blocks_per_90: number;
  interceptions_per_90: number;
  tackles_won_per_90: number;
  avg_opp_elo: number | null;
}

export interface DefconResponse {
  season: string;
  total: number;
  players: DefconEntry[];
}

export function getDefcon(q: {
  season?: string;
  position?: string;
  min_minutes?: string;
}): Promise<DefconResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) qs.set(k, v);
  return get(`/api/defcon?${qs.toString()}`);
}

export const POSITIONS = [
  "Goalkeeper",
  "Defender",
  "Midfielder",
  "Forward",
] as const;

// hide: columns dropped on smaller screens (mobile shows the essentials)
export const SORTABLE: { key: string; label: string; hide?: string }[] = [
  { key: "total_points", label: "Pts" },
  { key: "form", label: "Form" },
  { key: "now_cost", label: "Price" },
  { key: "selected_by_percent", label: "Own%" },
  { key: "expected_goals", label: "xG" },
  { key: "expected_assists", label: "xA", hide: "hidden md:table-cell" },
  { key: "goals_scored", label: "G", hide: "hidden md:table-cell" },
  { key: "assists", label: "A", hide: "hidden md:table-cell" },
  { key: "minutes", label: "Min", hide: "hidden md:table-cell" },
  {
    key: "defensive_contribution",
    label: "DefCon",
    hide: "hidden lg:table-cell",
  },
  { key: "ict_index", label: "ICT", hide: "hidden lg:table-cell" },
  { key: "points_per_game", label: "PPG", hide: "hidden lg:table-cell" },
];

// ---- FPL manager (official public FPL API, proxied) -------------------------

export class ApiRequestError extends Error {
  readonly status: number;
  /** FastAPI's `detail` message, when the response had one */
  readonly detail: string | null;

  constructor(status: number, path: string, detail: string | null = null) {
    super(`API ${status} for ${path}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.detail = detail;
  }
}

// plain fetch (no Next cache): manager data is live and usually loaded
// client-side, where the `next` fetch options do not apply anyway
async function getLive<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : null;
    throw new ApiRequestError(res.status, path, detail);
  }
  return res.json();
}

export interface ManagerLeague {
  id: number;
  name: string;
  entry_rank: number | null;
  entry_last_rank: number | null;
}

export interface ManagerProfile {
  entry_id: number;
  manager_name: string | null;
  team_name: string | null;
  overall_points: number | null;
  overall_rank: number | null;
  current_event: number | null;
  started_event: number | null;
  leagues: ManagerLeague[];
}

export interface SquadPick {
  element: number;
  squad_position: number; // 1-11 starters, 12-15 bench
  is_captain: boolean;
  is_vice_captain: boolean;
  multiplier: number;
  web_name: string;
  team_code: number | null;
  team_name: string | null;
  position: string | null;
  photo_url: string | null;
  now_cost: number | null;
  total_points: number | null;
  form: number | null;
  // this GW, live from FPL (null if the live feed is unavailable)
  team_short: string | null;
  gw_points: number | null;
  minutes: number | null;
}

export interface ManagerTeam {
  entry_id: number;
  team_name: string | null;
  manager_name: string | null;
  gw: number;
  gw_points: number | null;
  event_transfers: number | null;
  event_transfers_cost: number | null;
  bank: number; // £m
  squad_value: number; // £m
  overall_rank: number | null;
  picks: SquadPick[];
  points_on_bench: number | null;
  active_chip: string | null;
  automatic_subs: { element_in: number; element_out: number }[];
}

export interface LeagueStandingRow {
  rank: number;
  last_rank: number | null;
  entry: number;
  entry_name: string;
  player_name: string;
  event_total: number;
  total: number;
  team_value: number | null; // £m at the last deadline (only with values)
  bank: number | null; // £m
}

export interface LeagueStandings {
  league_id: number;
  league_name: string | null;
  page: number;
  has_next: boolean;
  standings: LeagueStandingRow[];
}

export function getManagerProfile(entryId: number): Promise<ManagerProfile> {
  return getLive(`/api/manager/${entryId}`);
}

export function getManagerTeam(
  entryId: number,
  gw?: number,
): Promise<ManagerTeam> {
  return getLive(`/api/manager/${entryId}/team${gw ? `?gw=${gw}` : ""}`);
}

export function getLeagueStandings(
  leagueId: number,
  page = 1,
  withValues = false,
): Promise<LeagueStandings> {
  return getLive(
    `/api/leagues/${leagueId}/standings?page=${page}${withValues ? "&values=true" : ""}`,
  );
}

// ---- league insights (official FPL API, one request per member) ------------

export interface MemberGameweek {
  event: number;
  points: number;
  total_points: number;
  overall_rank: number | null;
  value: number | null; // tenths of £m
  bank: number | null;
  points_on_bench: number | null;
  event_transfers_cost: number | null;
}

export interface LeagueMemberHistory {
  entry: number;
  entry_name: string;
  player_name: string;
  series: MemberGameweek[];
}

export function getLeagueHistory(
  leagueId: number,
  include?: number | null,
): Promise<{ league_id: number; members: LeagueMemberHistory[] }> {
  return getLive(
    `/api/leagues/${leagueId}/history${include ? `?include=${include}` : ""}`,
  );
}

export interface OverlapPlayer {
  element: number;
  web_name: string;
  team_short: string | null;
  position: string | null;
  squad_position: number; // 12-15 = bench
}

export interface MemberOverlap {
  entry: number;
  entry_name: string;
  player_name: string;
  rank: number;
  active_chip: string | null;
  /** every chip played this season, in GW order (null if unavailable) */
  chips_used: { name: string; event: number }[] | null;
  captain: OverlapPlayer | null;
  same_captain: boolean;
  shared: OverlapPlayer[];
  mine_only: OverlapPlayer[];
  theirs_only: OverlapPlayer[];
}

export interface LeagueOverlap {
  league_id: number;
  entry_id: number;
  gw: number;
  squad_size: number;
  total_members: number;
  my_squad: (OverlapPlayer & { is_captain: boolean; owned_by: number })[];
  members: MemberOverlap[];
}

export function getLeagueOverlap(
  leagueId: number,
  entryId: number,
  gw?: number,
): Promise<LeagueOverlap> {
  return getLive(
    `/api/leagues/${leagueId}/overlap?entry=${entryId}${gw ? `&gw=${gw}` : ""}`,
  );
}

// ---- price changes (official FPL API, live) ---------------------------------

export interface PricePlayer {
  id: number;
  web_name: string;
  team_code: number;
  team_short: string;
  team_name: string;
  position_short: "GKP" | "DEF" | "MID" | "FWD";
  status: string;
  news: string;
  now_cost: number; // tenths of £m
  selected_by_percent: number;
}

export interface PricePrediction extends PricePlayer {
  progress: number;
  predicted_progress: number | null;
  likelihood: number;
  status_label: string;
  locked: boolean;
  direction: "rise" | "drop" | null;
  trend: "up" | "down";
  hourly_rate: number;
  locked_until: string | null;
  calibrating: boolean;
}

export interface RecentPriceChange extends PricePlayer {
  event: number | null;
  changed_at: string;
  cost_before: number;
  cost_after: number;
}

export interface PriceChanges {
  fetched_at: string;
  next_update_at: string;
  current_event: number | null;
  predictions: PricePrediction[];
  recent_changes: RecentPriceChange[];
}

export function getPriceChanges(): Promise<PriceChanges> {
  return getLive("/api/prices");
}

// ---- player comparison (official FPL API + dataset snapshots) ----------------

export const MAX_COMPARE = 5;

export interface CompareGameweek {
  event: number;
  opponent_short: string;
  was_home: boolean;
  total_points: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  expected_goals: number;
  expected_assists: number;
  defensive_contribution: number;
  value: number;
}

export interface CompareFixture {
  event: number | null;
  opponent_short: string;
  is_home: boolean;
  difficulty: number;
  kickoff_time: string | null;
}

/** One FPL-Core-Insights snapshot (now_cost in £m, unlike the live tenths). */
export interface CompareTrendPoint {
  gw: number;
  ep_next: number | null;
  selected_by_percent: number | null;
  now_cost: number | null;
  form: number | null;
}

export interface ComparePlayer {
  id: number;
  web_name: string;
  full_name: string;
  team_code: number;
  team_short: string;
  team_name: string;
  position_short: string;
  status: string;
  news: string;
  chance_of_playing_next_round: number | null;
  now_cost: number; // tenths of £m
  selected_by_percent: number;
  total_points: number;
  event_points: number;
  form: number;
  points_per_game: number;
  minutes: number;
  starts: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  bonus: number;
  bps: number;
  expected_goals: number;
  expected_assists: number;
  expected_goal_involvements: number;
  expected_goals_conceded: number;
  ict_index: number;
  influence: number;
  creativity: number;
  threat: number;
  defensive_contribution: number;
  saves: number;
  yellow_cards: number;
  red_cards: number;
  transfers_in_event: number;
  transfers_out_event: number;
  value_season: number;
  dreamteam_count: number;
  ep_next: number | null;
  ep_this: number | null;
  cost_change_start: number; // £m
  penalties_order: number | null;
  corners_and_indirect_freekicks_order: number | null;
  direct_freekicks_order: number | null;
  expected_goals_per_90: number;
  expected_assists_per_90: number;
  expected_goal_involvements_per_90: number;
  expected_goals_conceded_per_90: number;
  saves_per_90: number;
  clean_sheets_per_90: number;
  defensive_contribution_per_90: number;
  tackles: number;
  clearances_blocks_interceptions: number;
  recoveries: number;
  form_rank: number | null;
  ict_index_rank: number | null;
  selected_rank: number | null;
  points_per_game_rank: number | null;
  now_cost_rank: number | null;
  history: CompareGameweek[];
  fixtures: CompareFixture[];
  trend: CompareTrendPoint[];
}

export function getPlayerCompare(
  ids: number[],
): Promise<{ season: string | null; players: ComparePlayer[] }> {
  return getLive(`/api/compare?${ids.map((id) => `ids=${id}`).join("&")}`);
}
