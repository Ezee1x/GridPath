import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Earlier pages now live inside each site's steps.
  async redirects() {
    return [
      { source: "/explorer", destination: "/new", permanent: false },
      { source: "/verification", destination: "/", permanent: false },
      { source: "/documents", destination: "/", permanent: false },
      { source: "/sources", destination: "/settings", permanent: false },
    ];
  },
  cacheComponents: false,
  partialPrefetching: false,
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
