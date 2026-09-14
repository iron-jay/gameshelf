import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The production image copies .next/standalone and runs server.js, so the
  // runtime stage needs no node_modules and no npm install.
  output: "standalone",
};

export default nextConfig;
