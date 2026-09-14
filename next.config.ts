import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The production image copies .next/standalone and runs server.js, so the
  // runtime stage needs no node_modules and no npm install.
  output: "standalone",

  images: {
    // Search results show IGDB's own thumbnails. Anything actually added to the
    // shelf gets its cover downloaded to /data/covers and served locally, so
    // this pattern only ever covers transient search art.
    remotePatterns: [{ protocol: "https", hostname: "images.igdb.com" }],
  },
};

export default nextConfig;
