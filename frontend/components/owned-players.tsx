"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useEntryId } from "./entry-id";
import { getManagerTeam } from "@/lib/api";

/** Row style for a player in the connected manager's squad. */
export const OWNED_ROW = "bg-accent/10 shadow-[inset_3px_0_0_0_var(--accent)]";

const EMPTY = new Set<number>();

/**
 * Player ids in the connected manager's squad (see My Team), empty when no
 * team is connected or FPL can't be reached: highlighting is best-effort.
 */
export function useOwnedPlayers(gw?: number): Set<number> {
  const [entryId] = useEntryId();
  const [owned, setOwned] = useState<{ key: string; ids: Set<number> }>();
  const key = `${entryId}:${gw ?? ""}`;
  useEffect(() => {
    if (!entryId) return;
    let cancelled = false;
    getManagerTeam(Number(entryId), gw)
      .then((team) => {
        if (!cancelled)
          setOwned({ key, ids: new Set(team.picks.map((p) => p.element)) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entryId, gw, key]);
  return entryId && owned?.key === key ? owned.ids : EMPTY;
}

export function YoursBadge() {
  return (
    <span className="bg-accent text-background ml-1.5 rounded px-1 py-px text-[10px] font-semibold tracking-wide uppercase">
      Yours
    </span>
  );
}

// For server-rendered tables: one fetch for the provider, rows read it.
const OwnedContext = createContext<Set<number>>(EMPTY);

export function OwnedPlayersProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OwnedContext.Provider value={useOwnedPlayers()}>
      {children}
    </OwnedContext.Provider>
  );
}

/** A table row highlighted when the player is in the connected squad. */
export function OwnedRow({
  playerId,
  className = "",
  children,
}: {
  playerId: number;
  className?: string;
  children: React.ReactNode;
}) {
  const mine = useContext(OwnedContext).has(playerId);
  return (
    <tr className={`${className} ${mine ? OWNED_ROW : ""}`}>{children}</tr>
  );
}

/** "Yours" tag shown next to a name when the player is in the connected squad. */
export function OwnedBadge({ playerId }: { playerId: number }) {
  return useContext(OwnedContext).has(playerId) ? <YoursBadge /> : null;
}
