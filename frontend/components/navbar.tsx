"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/my-team", label: "My Team" },
  { href: "/leagues", label: "Leagues" },
  { href: "/players", label: "Players" },
  { href: "/compare", label: "Compare" },
  { href: "/prices", label: "Prices" },
  { href: "/fdr", label: "FDR" },
  { href: "/differentials", label: "Differentials" },
  { href: "/rotation", label: "Rotation" },
  { href: "/matches", label: "Matches" },
];

export function Navbar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // the menu is open for the page it was opened on, so following a link
  // (a new pathname) closes it without an effect
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const close = () => setOpenOn(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      // focus the current page's link (or the first) for keyboard users
      const links = panelRef.current?.querySelectorAll<HTMLAnchorElement>("a");
      const current = panelRef.current?.querySelector<HTMLAnchorElement>(
        'a[aria-current="page"]',
      );
      (current ?? links?.[0])?.focus();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpenOn(null);
      };
      document.addEventListener("keydown", onKey);
      const overflow = document.body.style.overflow;
      document.body.style.overflow = "hidden"; // no page scroll behind the menu
      return () => {
        document.removeEventListener("keydown", onKey);
        document.body.style.overflow = overflow;
      };
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      burgerRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  return (
    <>
      <nav className="border-border bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
          <button
            ref={burgerRef}
            type="button"
            onClick={() => setOpenOn(open ? null : pathname)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="site-menu"
            className="text-muted hover:bg-surface hover:text-foreground -ml-2 rounded-md p-2 transition-colors"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link
            href="/"
            className="font-display shrink-0 text-base font-bold tracking-tight sm:text-lg"
          >
            FPL Core
          </Link>
          <span className="text-muted hidden truncate text-sm sm:inline">
            {LINKS.find((l) => l.href !== "/" && isActive(l.href))?.label}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <a
              href="https://github.com/vapranav/fpl-core-app"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              className="text-muted hover:bg-surface hover:text-foreground rounded-md p-2 transition-colors"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.15c-3.2.69-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.75 2.69 1.25 3.35.95.1-.74.4-1.25.72-1.53-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.14c0 .3.21.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
            </a>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* outside <nav>: its backdrop-blur would trap position:fixed children */}
      <div
        onClick={close}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        ref={panelRef}
        id="site-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        inert={!open}
        className={`border-border bg-surface fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <Link
            href="/"
            className="font-display text-lg font-bold tracking-tight"
          >
            FPL Core
          </Link>
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="text-muted hover:bg-background hover:text-foreground rounded-md p-2 transition-colors"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {LINKS.map((l) => {
            const active = isActive(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-md border-l-2 px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? "border-accent bg-accent/10 text-accent font-semibold"
                      : "text-muted hover:bg-background hover:text-foreground border-transparent"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
