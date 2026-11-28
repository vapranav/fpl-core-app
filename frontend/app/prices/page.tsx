import type { Metadata } from "next";
import { PriceChanges } from "@/components/price-changes";

export const metadata: Metadata = {
  title: "Price changes · FPL Core",
  description:
    "FPL price rise and drop predictions, live from the official API, with your squad highlighted",
};

export default function PricesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <PriceChanges />
    </main>
  );
}
