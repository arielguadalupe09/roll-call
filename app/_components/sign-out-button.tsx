"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SidebarIcon from "./sidebar-icons";

export default function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      className={`flex items-center justify-center gap-2 rounded-md bg-danger px-3 py-2 text-sm font-medium text-paper transition hover:brightness-110 ${className}`}
    >
      <SidebarIcon name="logout" className="h-4 w-4" />
      Sign out
    </button>
  );
}
