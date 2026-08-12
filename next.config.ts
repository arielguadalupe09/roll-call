import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  devIndicators: false,
  allowedDevOrigins: ["192.168.100.131"],
  // The DHVSU export route reads this .xlsx template from disk at request
  // time (fs.readFileSync), which Vercel's build-time file tracing can miss
  // since it's not a static `import` -- without this, the export API route
  // would 500 in production despite building successfully.
  outputFileTracingIncludes: {
    "/api/export/dhvsu-class-record/[classId]": ["./lib/templates/**"],
  },
};

export default nextConfig;
