import type { Metadata } from "next";
import { MyTeam } from "@/components/my-team";

export const metadata: Metadata = {
  title: "My Team · FPL Core",
  description: "Your FPL squad, gameweek points and league standings",
};

export default function MyTeamPage() {
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <MyTeam />
    </main>
  );
}
