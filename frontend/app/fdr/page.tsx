import type { Metadata } from "next";
import { FdrTable } from "@/components/fdr-table";
import { getFdr, type FdrResponse } from "@/lib/api";

export const metadata: Metadata = {
  title: "Fixture difficulty · FPL Core",
  description:
    "FPL's fixture difficulty rating (FDR) for every team, gameweek by gameweek",
};

export default async function FdrPage() {
  let data: FdrResponse | null = null;
  try {
    data = await getFdr();
  } catch {
    // shown below
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Fixture difficulty
          </h1>
          <p className="text-muted text-sm">
            FPL&apos;s own difficulty rating for every fixture, 1 (easiest) to 5
            (hardest).
          </p>
        </div>
        <a
          href="https://fantasy.premierleague.com/fixtures/fdr"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted text-xs underline"
        >
          Same data as FPL&apos;s FDR page
        </a>
      </header>
      {data ? (
        <FdrTable data={data} />
      ) : (
        <p className="rounded-lg border border-red-600/30 bg-red-600/10 p-4 text-sm text-red-700 dark:text-red-400">
          Could not load fixtures from FPL — try again shortly.
        </p>
      )}
    </main>
  );
}
