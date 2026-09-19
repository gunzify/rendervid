import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rendervid/shared", "@rendervid/core"],
  serverExternalPackages: ["pg", "postgres", "bullmq", "ioredis", "stripe"],
  webpack: (config) => {
    // Core packages are NodeNext TS source; map `.js` imports to `.ts` for webpack.
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

export default nextConfig;
