"use client";

import { useSyncExternalStore } from "react";

// The user's own FPL access token, used only for the token-protected FPL
// endpoints (their private squad view). Kept in this browser's localStorage and
// sent to our API per request, which passes it to FPL and never stores it.
const KEY = "fpl-api-token";
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function setFplToken(token: string | null) {
  if (token === null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, token);
  listeners.forEach((cb) => cb());
}

/** Strips whitespace, quotes and a leading "Bearer " from a pasted token. */
export function normalizeToken(raw: string): string {
  return raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^bearer\s+/i, "")
    .trim();
}

/** Expiry of a JWT access token (null if it isn't a JWT or has no exp). */
export function tokenExpiry(token: string): Date | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = JSON.parse(json)?.exp;
    return typeof exp === "number" ? new Date(exp * 1000) : null;
  } catch {
    return null;
  }
}

/** Stored FPL token (null when none). Hydration-safe: server snapshot is null. */
export function useFplToken(): [string | null, (t: string | null) => void] {
  const token = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(KEY),
    () => null,
  );
  return [token, setFplToken];
}
