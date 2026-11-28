import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueInsights } from "@/components/league-insights";
import { StandingsTable } from "@/components/standings-table";
import {
  ApiRequestError,
  getLeagueStandings,
  type LeagueStandings,
} from "@/lib/api";

export const metadata: Metadata = {
  title: "League standings · FPL Core",
};

export default async function LeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const leagueId = Number(id);
  if (!Number.isInteger(leagueId) || leagueId <= 0) notFound();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  let data: LeagueStandings;
  try {
    data = await getLeagueStandings(leagueId, page, true);
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) notFound();
    throw err;
  }

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <header className="mb-6">
        <Link href="/leagues" className="text-muted text-sm hover:underline">
          ← My leagues
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {data.league_name ?? `League ${leagueId}`}
        </h1>
        <p className="text-muted text-sm">Classic league · page {data.page}</p>
      </header>

      <StandingsTable rows={data.standings} />

      <nav className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted">Page {data.page}</span>
        <div className="flex gap-2">
          {data.page > 1 && (
            <Link
              href={`/leagues/${leagueId}?page=${data.page - 1}`}
              className="border-border bg-surface rounded-md border px-3 py-1.5"
            >
              ← Prev
            </Link>
          )}
          {data.has_next && (
            <Link
              href={`/leagues/${leagueId}?page=${data.page + 1}`}
              className="border-border bg-surface rounded-md border px-3 py-1.5"
            >
              Next →
            </Link>
          )}
        </div>
      </nav>

      <LeagueInsights leagueId={leagueId} />
    </main>
  );
}
