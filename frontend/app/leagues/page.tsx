import type { Metadata } from "next";
import { MyLeagues } from "@/components/my-leagues";

export const metadata: Metadata = {
  title: "My leagues · FPL Core",
  description:
    "Your FPL mini-leagues: standings, season history and squad overlap with your rivals",
};

export default function LeaguesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          My leagues
        </h1>
      </header>
      <MyLeagues />
    </main>
  );
}
