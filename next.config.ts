import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@whop/sdk", "@opennextjs/cloudflare"],
};

export default nextConfig;
