"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/app/_components/toast";
import { useConfirm } from "@/app/_components/confirm-provider";

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
  const { showToast } = useToast();
  const confirm = useConfirm();

  async function setArchived(next: boolean) {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("classes")
      .update({ archived: next })
      .eq("id", classId);
    setLoading(false);

    if (error) {
      showToast(error.message);
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

  async function handleClick() {
    if (!archived) {
      const confirmed = await confirm(
        `Archive "${name}"? It'll be hidden from your dashboard and sidebar — you can unarchive it anytime.`,
        { confirmLabel: "Archive" },
      );
      if (!confirmed) return;
    }
    setArchived(!archived);
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
