"use client";

import { useSyncExternalStore } from "react";

// hydration-safe mounted flag: server snapshot false, flips to true on
// hydration and schedules a re-render (same pattern as the theme toggle)
const subscribe = () => () => {};

/**
 * Renders a timestamp in the USER's timezone.
 * The API stores naive-UTC datetimes, so we pin with Z before parsing.
 * Pre-hydration we render a deterministic UTC string (identical on server
 * and client, so no mismatch); after mount we swap to the browser's tz.
 */
export function LocalTime({
  iso,
  variant = "datetime",
  className,
}: {
  iso: string | null;
  variant?: "datetime" | "short" | "date";
  className?: string;
}) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!iso) return <span className={className}>–</span>;
  const src = iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`;
  const d = new Date(src);
  const opts: Intl.DateTimeFormatOptions =
    variant === "date"
      ? { day: "numeric", month: "short", year: "numeric" }
      : variant === "short"
        ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
        : {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          };
  return (
    <span className={className}>
      {mounted
        ? d.toLocaleString("en-GB", opts)
        : d.toLocaleString("en-GB", { ...opts, timeZone: "UTC" })}
    </span>
  );
}
