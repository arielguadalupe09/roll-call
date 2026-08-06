"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
      className={`rounded-sm border border-rule/30 px-3 py-1.5 text-sm text-paper transition hover:bg-white/5 ${className}`}
    >
      Sign out
    </button>
  );
}
