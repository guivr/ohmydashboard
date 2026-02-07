import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude native modules from webpack bundling (they run server-side only)
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
