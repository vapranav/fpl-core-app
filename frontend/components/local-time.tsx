"use client";

/**
 * Renders a timestamp in the USER's timezone.
 * The API stores naive-UTC datetimes, so we pin with Z before parsing.
 * suppressHydrationWarning: the server render shows server-tz text and the
 * browser replaces it on hydration — intentional, avoids a blank flash.
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
    <span className={className} suppressHydrationWarning>
      {d.toLocaleString("en-GB", opts)}
    </span>
  );
}
