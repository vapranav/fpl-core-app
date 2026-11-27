"use client";

import Image from "next/image";
import { useState } from "react";

function Silhouette() {
  return (
    <span
      className="flex h-[50px] w-[40px] items-center justify-center rounded bg-border text-muted"
      aria-label="No photo available"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-3.3 3.6-5.5 8-5.5s8 2.2 8 5.5v1H4z" />
      </svg>
    </span>
  );
}

export function PlayerPhoto({
  src,
  alt,
  priority,
}: {
  src: string | null;
  alt: string;
  priority: boolean;
}) {
  const [failed, setFailed] = useState(false);

  // PL CDN 404s for some player codes (e.g. recent signings) even though the
  // API can build a URL -> swap to the placeholder on load error too
  if (!src || failed) return <Silhouette />;

  return (
    <Image
      src={src}
      alt={alt}
      width={40}
      height={50}
      sizes="40px"
      priority={priority}
      onError={() => setFailed(true)}
      className="rounded"
    />
  );
}
