// Match-slug parsing helpers. Same logic as the player detail page; kept in
// lib/ so the matches pages can share it.

export const COMPETITIONS: Record<string, string> = {
  prem: "PL",
  "champions-league": "UCL",
  "europa-league": "UEL",
  "conference-league": "UECL",
  "fa-cup": "FA Cup",
  "league-cup": "EFL Cup",
  "efl-cup": "EFL Cup",
  "pre-season": "Friendly",
};

export function competitionOf(matchId: string): string {
  // slug shape: "25-26-prem-arsenal-vs-chelsea" or legacy numeric id
  const slug = matchId.split("-").slice(2).join("-");
  for (const [key, label] of Object.entries(COMPETITIONS)) {
    if (slug.startsWith(key)) return label;
  }
  return "Cup";
}

const tidyName = (s: string) =>
  s
    .split("-")
    // 26/27 slugs append a date (…-2026-09-08): drop all-digit tokens
    .filter((w) => w && !/^\d+$/.test(w))
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** Club names from the slug — needed when a team code is null (non-PL opponents
 *  in cups/Europe aren't in the FPL teams table). */
export function slugClubs(matchId: string): { home: string; away: string } {
  const rest = matchId.split("-").slice(2).join("-");
  const [left = "", right = ""] = rest.split("-vs-");
  let home = left;
  for (const key of Object.keys(COMPETITIONS).sort(
    (a, b) => b.length - a.length,
  )) {
    if (home.startsWith(key + "-")) {
      home = home.slice(key.length + 1);
      break;
    }
  }
  return { home: tidyName(home), away: tidyName(right) };
}
