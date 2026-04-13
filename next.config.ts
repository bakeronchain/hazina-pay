import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for @stacks/connect wallet pop-ups in some environments
  reactStrictMode: true,
};

export default nextConfig;
