"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { inputClass } from "./select";
import { PlayerPhoto } from "./player-photo";
import { badgeUrl } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const DEBOUNCE_MS = 200;

export interface Suggestion {
  player_id: number;
  web_name: string;
  team_code: number;
  team_name: string;
  position: string;
  photo_url: string | null;
  total_points: number | null;
}

/**
 * Player typeahead. By default picking a player opens their page; pass
 * `onSelect` to handle the pick instead (the input is cleared afterwards).
 */
export function SearchBar({
  defaultValue = "",
  onSelect,
  excludeIds,
  disabled = false,
  placeholder = "Search player…",
}: {
  defaultValue?: string;
  onSelect?: (s: Suggestion) => void;
  excludeIds?: number[];
  disabled?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef(new Map<string, Suggestion[]>());
  const rootRef = useRef<HTMLDivElement>(null);

  // debounced fetch with race safety + repeat-query cache
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      abortRef.current?.abort();
      return;
    }
    const cached = cacheRef.current.get(q);
    if (cached) {
      setResults(cached);
      setOpen(true);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(
          `${API_URL}/api/search/players?q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { results: Suggestion[] };
        cacheRef.current.set(q, data.results);
        setResults(data.results);
        setActive(-1);
        setOpen(true);
      } catch (e) {
        if (e instanceof Error && e.name !== "AbortError") setOpen(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // close on click outside
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (s: Suggestion) => {
    setOpen(false);
    if (onSelect) {
      onSelect(s);
      setQuery("");
      setResults([]);
      setActive(-1);
    } else {
      router.push(`/players/${s.player_id}`);
    }
  };

  const shown = excludeIds
    ? results.filter((s) => !excludeIds.includes(s.player_id))
    : results;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || shown.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % shown.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + shown.length) % shown.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault(); // navigate instead of submitting the filter form
      go(shown[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        name="search"
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        className={`${inputClass} disabled:opacity-50 ${onSelect ? "w-full" : ""}`}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="player-search-results"
        aria-label="Search player"
      />
      {showDropdown && (
        <ul
          id="player-search-results"
          className="border-border bg-surface absolute z-20 mt-1 max-h-80 w-72 overflow-y-auto rounded-md border py-1 shadow-lg"
        >
          {shown.length === 0 && (
            <li className="text-muted px-3 py-2 text-sm">No players found</li>
          )}
          {shown.map((s, i) => (
            <li key={s.player_id}>
              <button
                type="button"
                onClick={() => go(s)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  i === active ? "bg-accent/10" : ""
                }`}
              >
                <PlayerPhoto src={s.photo_url} alt={s.web_name} size={28} />
                <span className="font-medium">{s.web_name}</span>
                <span className="text-muted flex items-center gap-1 text-xs">
                  <Image
                    src={badgeUrl(s.team_code)}
                    alt=""
                    width={14}
                    height={14}
                  />
                  {s.team_name} · {s.position.slice(0, 3).toUpperCase()}
                </span>
                <span className="text-muted ml-auto text-xs tabular-nums">
                  {s.total_points?.toFixed(0)} pts
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
