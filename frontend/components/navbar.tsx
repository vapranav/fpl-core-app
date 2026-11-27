"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/players", label: "Players" },
  { href: "/differentials", label: "Differentials" },
  { href: "/compare", label: "Compare" },
];

export function Navbar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-6 sm:px-6">
        <Link
          href="/"
          className="shrink-0 font-display text-base font-bold tracking-tight sm:text-lg"
        >
          FPL Core
        </Link>
        <div className="flex items-center gap-0.5 overflow-x-auto sm:gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-md px-2 py-1.5 text-xs transition-colors sm:px-3 sm:text-sm ${
                isActive(l.href)
                  ? "bg-accent/10 font-semibold text-accent"
                  : "text-muted hover:bg-surface hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
