import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow CORS for the MCP server API calls from client components
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  // Experimental features for better performance
  experimental: {},
};

export default nextConfig;
