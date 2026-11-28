import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayerCompare } from "@/components/player-compare";

export const metadata: Metadata = {
  title: "Compare players · FPL Core",
  description:
    "Compare up to five FPL players side by side: season stats, gameweek history and fixtures",
};

export default function ComparePage() {
  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      {/* useSearchParams needs a Suspense boundary for static rendering */}
      <Suspense>
        <PlayerCompare />
      </Suspense>
    </main>
  );
}
