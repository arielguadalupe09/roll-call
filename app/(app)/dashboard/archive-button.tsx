"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Toast, { useToast } from "@/app/_components/toast";

export default function ArchiveButton({
  classId,
  name,
  archived,
}: {
  classId: string;
  name: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { message, action, showToast } = useToast(5000);

  async function setArchived(next: boolean) {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("classes")
      .update({ archived: next })
      .eq("id", classId);
    setLoading(false);

    if (error) {
      window.alert(error.message);
      return;
    }
    router.refresh();

    if (next) {
      showToast(`"${name}" archived.`, {
        label: "Undo",
        onClick: () => setArchived(false),
      });
    }
  }

  function handleClick() {
    if (!archived) {
      const confirmed = window.confirm(
        `Archive "${name}"? It'll be hidden from your dashboard and sidebar — you can unarchive it anytime.`,
      );
      if (!confirmed) return;
    }
    setArchived(!archived);
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`shrink-0 whitespace-nowrap text-sm underline underline-offset-2 disabled:opacity-60 ${
          archived ? "text-teal" : "text-ink/60 hover:text-ink"
        }`}
      >
        {loading ? "..." : archived ? "Unarchive" : "Archive"}
      </button>
      <Toast message={message} action={action} />
    </>
  );
}
