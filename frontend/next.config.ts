import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "resources.premierleague.com" },
    ],
    // player photos/badges are keyed by code; a new photo means a new URL,
    // so long edge caching is safe regardless of upstream cache headers
    minimumCacheTTL: 2592000, // 30 days
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
