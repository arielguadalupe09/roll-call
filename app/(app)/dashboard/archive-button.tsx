"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ArchiveButton({
  classId,
  archived,
}: {
  classId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("classes")
      .update({ archived: !archived })
      .eq("id", classId);
    setLoading(false);

    if (error) {
      window.alert(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`shrink-0 whitespace-nowrap text-sm underline underline-offset-2 disabled:opacity-60 ${
        archived ? "text-teal" : "text-ink/60 hover:text-ink"
      }`}
    >
      {loading ? "..." : archived ? "Unarchive" : "Archive"}
    </button>
  );
}
