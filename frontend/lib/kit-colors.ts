// Ported from fpl-dashboard.
// Approximate main shirt colour of each club's home, away and third kits, keyed by FPL short name.
// Kits change every season, so these are representative club colours rather than exact shades.
const KITS: Record<string, [home: string, away: string, third: string]> = {
  ARS: ["#DB0007", "#F6C543", "#1B365D"],
  AVL: ["#670E36", "#95BFE5", "#FFFFFF"],
  BOU: ["#DA291C", "#FFFFFF", "#1A1A1A"],
  BRE: ["#E30613", "#FFC20E", "#0A2240"],
  BHA: ["#0057B8", "#FDB913", "#FFFFFF"],
  BUR: ["#6C1D45", "#99D6EA", "#FFFFFF"],
  CHE: ["#034694", "#F2F2E9", "#DBA111"],
  COV: ["#70B8E8", "#FFFFFF", "#1A2B4C"],
  CRY: ["#1B458F", "#FFFFFF", "#C4122E"],
  EVE: ["#003399", "#FFFFFF", "#F2A900"],
  FUL: ["#FFFFFF", "#1A1A1A", "#CC0000"],
  HUL: ["#F5A12D", "#1A1A1A", "#FFFFFF"],
  IPS: ["#0044A9", "#DE2C37", "#FFFFFF"],
  LEE: ["#FFFFFF", "#1D428A", "#FFCD00"],
  LEI: ["#003090", "#FFFFFF", "#FDBE11"],
  LIV: ["#C8102E", "#FFFFFF", "#1A1A1A"],
  LUT: ["#F78F1E", "#002D62", "#FFFFFF"],
  MCI: ["#6CABDD", "#1C2C5B", "#FFFFFF"],
  MID: ["#E21B23", "#FFFFFF", "#1A1A1A"],
  MUN: ["#DA291C", "#FFFFFF", "#1A1A1A"],
  NEW: ["#241F20", "#FFFFFF", "#7CC3E6"],
  NFO: ["#DD0000", "#FFFFFF", "#1A1A1A"],
  NOR: ["#FFF200", "#00A650", "#1A1A1A"],
  SHU: ["#EE2737", "#FFFFFF", "#1A1A1A"],
  SOU: ["#D71920", "#FFFFFF", "#1A1A1A"],
  SUN: ["#EB172B", "#1A1A1A", "#FFFFFF"],
  TOT: ["#FFFFFF", "#132257", "#D3E26A"],
  WAT: ["#FBEE23", "#ED2127", "#1A1A1A"],
  WBA: ["#122F67", "#FFFFFF", "#1A1A1A"],
  WHU: ["#7A263A", "#FFFFFF", "#1BB1E7"],
  WOL: ["#FDB913", "#231F20", "#FFFFFF"],
};

// Used for unknown clubs, or when every kit of a club clashes with colours already taken.
const FALLBACK = [
  "#059669",
  "#2563eb",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#65a30d",
];

function toOklab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** True when two colours would be hard to tell apart as chart lines (e.g. Liverpool red vs Arsenal red). */
function clashes(a: string, b: string) {
  const [l1, a1, b1] = toOklab(a);
  const [l2, a2, b2] = toOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) < 0.12;
}

/** Perceptual lightness check, used to spot near-white / near-black kits that need an outline to stay visible. */
export function needsOutline(hex: string) {
  const [l] = toOklab(hex);
  return l > 0.93 || l < 0.3;
}

/**
 * One line colour per player, in order: the club's home shirt colour, falling back to the away
 * (then third) kit when that colour is already taken by an earlier player, then to a neutral palette.
 */
export function kitColors(teamShorts: string[]): string[] {
  const used: string[] = [];
  return teamShorts.map((team) => {
    const options = [...(KITS[team] ?? []), ...FALLBACK];
    const pick =
      options.find((c) => !used.some((u) => clashes(u, c))) ?? options[0];
    used.push(pick);
    return pick;
  });
}
