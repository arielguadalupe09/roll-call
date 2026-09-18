"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/app/_components/toast";
import Button from "@/app/_components/button";

export default function PublishToggle({
  examId,
  initialPublished,
}: {
  examId: string;
  initialPublished: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [published, setPublished] = useState(initialPublished);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !published;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("exams").update({ published: next }).eq("id", examId);
    setSaving(false);

    if (error) {
      showToast(error.message);
      return;
    }
    setPublished(next);
    router.refresh();
  }

  return (
    <Button variant="primary" size="sm" onClick={toggle} disabled={saving}>
      {saving ? "Saving..." : published ? "Unpublish" : "Publish"}
    </Button>
  );
}
