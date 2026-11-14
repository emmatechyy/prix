import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Published snapshots and the thresholds file are read from disk at runtime.
  outputFileTracingIncludes: { "/**": ["./data/snapshots/*.json", "./thresholds/*.yaml"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Old routes keep working (frontend spec §2): 308 permanent redirects.
  async redirects() {
    return [
      { source: "/rankings", destination: "/tokens", permanent: true },
      { source: "/thesis", destination: "/", permanent: true },
      { source: "/flows", destination: "/capital#flows", permanent: true },
      { source: "/whales", destination: "/tokens?view=whales", permanent: true },
      { source: "/launches", destination: "/tokens?view=launches", permanent: true },
      { source: "/methodology", destination: "/method", permanent: true },
      { source: "/depth", destination: "/capital#depth", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
