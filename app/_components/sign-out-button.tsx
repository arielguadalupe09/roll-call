"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SidebarIcon from "./sidebar-icons";

export default function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      // Tinted, not a solid fill -- matches how every other danger-toned
      // element in the app reads (StatusPill, TileIcon, the "Need
      // attention" StatCard), instead of a heavy CTA-style button that
      // stood out against this menu's otherwise plain text/link items.
      className={`flex items-center justify-center gap-2 rounded-lg border border-danger/20 bg-danger/10 px-3 py-1.5 text-sm font-medium text-danger transition hover:bg-danger/15 ${className}`}
    >
      <SidebarIcon name="logout" className="h-4 w-4" />
      Sign out
    </button>
  );
}
