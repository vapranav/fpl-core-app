const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

export const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Forward"] as const;

export const SORTABLE: { key: string; label: string }[] = [
  { key: "total_points", label: "Pts" },
  { key: "form", label: "Form" },
  { key: "now_cost", label: "Price" },
  { key: "selected_by_percent", label: "Own%" },
  { key: "expected_goals", label: "xG" },
  { key: "expected_assists", label: "xA" },
  { key: "goals_scored", label: "G" },
  { key: "assists", label: "A" },
  { key: "minutes", label: "Min" },
  { key: "defensive_contribution", label: "DefCon" },
  { key: "ict_index", label: "ICT" },
  { key: "points_per_game", label: "PPG" },
];
