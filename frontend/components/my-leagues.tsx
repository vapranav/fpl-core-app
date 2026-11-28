"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useEntryId } from "./entry-id";
import { LeagueCards } from "./league-cards";
import { getManagerProfile, type ManagerProfile } from "@/lib/api";

type State =
  | { status: "ok"; entryId: string; profile: ManagerProfile }
  | { status: "error"; entryId: string };

/** The connected manager's classic mini-leagues. */
export function MyLeagues() {
  const [entryId] = useEntryId();
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    if (!entryId) return;
    let cancelled = false;
    getManagerProfile(Number(entryId))
      .then((profile) => {
        if (!cancelled) setState({ status: "ok", entryId, profile });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", entryId });
      });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  const box =
    "text-muted border-border bg-surface rounded-lg border p-6 text-sm";

  if (!entryId)
    return (
      <p className={box}>
        <Link href="/my-team" className="text-accent underline">
          Connect your FPL team
        </Link>{" "}
        to see your mini-leagues, compare season histories and find out how much
        your squad overlaps with your rivals&apos;.
      </p>
    );
  // a result for a previously connected entry counts as still loading
  if (!state || state.entryId !== entryId)
    return <p className={box}>Loading your leagues…</p>;
  if (state.status === "error")
    return (
      <p className="rounded-lg border border-red-600/30 bg-red-600/10 p-4 text-sm text-red-700 dark:text-red-400">
        Could not load your leagues from FPL — try again shortly.
      </p>
    );

  const { profile } = state;
  return (
    <div className="space-y-3">
      <p className="text-muted text-sm">
        {profile.team_name} · {profile.manager_name}
      </p>
      {profile.leagues.length === 0 ? (
        <p className={box}>You&apos;re not in any classic leagues.</p>
      ) : (
        <LeagueCards leagues={profile.leagues} />
      )}
    </div>
  );
}
