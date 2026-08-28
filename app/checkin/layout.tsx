import type { Metadata, Viewport } from "next";

// Scoped to this one route (not the root layout) so installing this as an
// app only affects the student check-in page, not the teacher-facing
// dashboard that lives under the rest of the site.
export const metadata: Metadata = {
  title: "Roll Call Check-in",
  manifest: "/checkin-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Check-in",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1e33",
};

export default function CheckinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
