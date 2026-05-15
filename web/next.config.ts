import type { NextConfig } from "next";

const config: NextConfig = {
  // better-sqlite3 is a native module; mark it external for server bundles
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    typedRoutes: false,
  },
};

export default config;
