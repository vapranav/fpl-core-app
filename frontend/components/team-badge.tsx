import Image from "next/image";
import { BadgePlaceholder } from "@/components/badge-placeholder";
import { badgeUrl } from "@/lib/api";

/** Club badge with a shield fallback for teams without an FPL code. */
export function TeamBadge({
  code,
  size = 20,
}: {
  code: number | null;
  size?: number;
}) {
  if (code === null) return <BadgePlaceholder size={size / 4} />;
  return <Image src={badgeUrl(code)} alt="" width={size} height={size} />;
}
