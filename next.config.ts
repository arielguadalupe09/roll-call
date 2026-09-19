import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  devIndicators: false,
  // The standalone Participation page was removed (Records shows the same
  // recitation/activity logs per day) -- keep old bookmarks and links working.
  async redirects() {
    return [{ source: "/participation/:classSlug", destination: "/records/:classSlug", permanent: false }];
  },
  allowedDevOrigins: ["192.168.100.131"],
  // pdf-parse pulls in pdfjs-dist, which resolves its worker script relative
  // to its own file layout on disk at runtime -- bundling it rewrites those
  // paths and breaks worker setup ("Cannot find module '.../pdf.worker.mjs'").
  // Left external, Node just requires it normally from node_modules.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  // The DHVSU export route reads this .xlsx template from disk at request
  // time (fs.readFileSync), which Vercel's build-time file tracing can miss
  // since it's not a static `import` -- without this, the export API route
  // would 500 in production despite building successfully. Same class of
  // issue for the exam PDF parser: pdfjs-dist requires @napi-rs/canvas's
  // platform-specific native binary (to polyfill DOMMatrix for text-position
  // math, not just image rendering) via a dynamically-computed path that
  // Vercel's static file tracer can't follow, so it gets dropped from the
  // deployed function and PDF parsing 500s with "DOMMatrix is not defined"
  // despite `npm run build` succeeding locally.
  outputFileTracingIncludes: {
    "/api/export/dhvsu-class-record/[classId]": ["./lib/templates/**"],
    // Includes the *entire* pdfjs-dist/pdf-parse trees, not just the worker
    // file -- both packages resolve internal files (worker scripts, cmaps,
    // standard fonts) relative to their own layout on disk at runtime using
    // paths the static file tracer can't follow, so narrower includes kept
    // missing one file at a time across several rounds of prod-only 500s.
    "/api/exams/parse-upload": [
      "./node_modules/@napi-rs/canvas/**",
      "./node_modules/@napi-rs/canvas-*/**",
      "./node_modules/pdfjs-dist/**",
      "./node_modules/pdf-parse/**",
    ],
  },
};

export default nextConfig;
