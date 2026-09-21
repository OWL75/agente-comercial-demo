import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal, self-contained server bundle (.next/standalone) —
  // needed for a lean Docker image instead of shipping the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
