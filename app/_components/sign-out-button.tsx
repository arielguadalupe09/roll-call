"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SidebarIcon from "./sidebar-icons";
import Button from "./button";

export default function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();

  return (
    <Button
      variant="danger"
      className={`gap-2 rounded-md ${className}`}
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
      }}
    >
      <SidebarIcon name="logout" className="h-4 w-4" />
      Sign out
    </Button>
  );
}
