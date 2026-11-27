"use client";

import Image from "next/image";
import { useState } from "react";

function Silhouette({ size }: { size: number }) {
  return (
    <span
      className="bg-border text-muted flex items-center justify-center rounded"
      style={{ width: size, height: size * 1.25 }}
      aria-label="No photo available"
    >
      <svg
        width={size * 0.55}
        height={size * 0.55}
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-3.3 3.6-5.5 8-5.5s8 2.2 8 5.5v1H4z" />
      </svg>
    </span>
  );
}

export function PlayerPhoto({
  src,
  alt,
  priority = false,
  size = 40,
}: {
  src: string | null;
  alt: string;
  priority?: boolean;
  size?: number; // width in px; photos are 4:5
}) {
  const [failed, setFailed] = useState(false);

  // PL CDN 404s for some player codes (e.g. recent signings) even though the
  // API can build a URL -> swap to the placeholder on load error too
  if (!src || failed) return <Silhouette size={size} />;

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size * 1.25}
      sizes={`${size}px`}
      priority={priority}
      onError={() => setFailed(true)}
      className="rounded"
    />
  );
}
