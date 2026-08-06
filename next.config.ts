import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  devIndicators: false,
  allowedDevOrigins: ["192.168.100.131"],
};

export default nextConfig;
