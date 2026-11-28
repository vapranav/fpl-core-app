"use client";

import { useSyncExternalStore } from "react";

const KEY = "fpl-entry-id";
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  // pick up changes made in other tabs
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function setEntryId(id: string | null) {
  if (id === null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, id);
  listeners.forEach((cb) => cb());
}

/**
 * Connected FPL entry id from localStorage (null when not connected).
 * Hydration-safe: the server snapshot is always null.
 */
export function useEntryId(): [string | null, (id: string | null) => void] {
  const entryId = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(KEY),
    () => null,
  );
  return [entryId, setEntryId];
}
