import type { Metadata, Viewport } from "next";

// Scoped to this one route (not the root layout) so installing this as an
// app only affects the student portal, not the teacher-facing dashboard
// that lives under the rest of the site. Reuses the checkin-* manifest/
// icons/service-worker filenames from when this was a separate /checkin
// app -- renaming them has no user-visible effect, so it's not worth the
// churn (see CLAUDE.md's note on lingering old names).
export const metadata: Metadata = {
  title: "GAINS Student",
  manifest: "/checkin-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "GAINS",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1e33",
};

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
