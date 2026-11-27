/** "22 Nov 2026, 15:00" — DB stores naive UTC, so pin rendering to UTC. */
export function fmtKickoff(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  const date = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return `${date}, ${time}`;
}
