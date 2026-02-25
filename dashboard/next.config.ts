import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {
    turbo: {},
  },
  // Proxy API calls to the gateway during development
  async rewrites() {
    return [
      { source: "/api/gateway/:path*", destination: "http://localhost:3100/api/:path*" },
      { source: "/metrics", destination: "http://localhost:3100/metrics" },
    ];
  },
};

export default config;
