"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/app/_components/toast";
import Button from "@/app/_components/button";
import { Textarea } from "@/app/_components/input";

// Instructions specific to this exam (e.g. "Non-programmable calculators
// allowed", "Show your solution for items 5-10") -- shown to students in
// the on-screen preview and printed on the official quiz paper, alongside
// (not instead of) the fixed General Instructions boilerplate there.
export default function ExamInstructionsForm({
  examId,
  initialDescription,
}: {
  examId: string;
  initialDescription: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [description, setDescription] = useState(initialDescription ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("exams")
      .update({ description: description.trim() || null })
      .eq("id", examId);
    setSaving(false);

    if (error) {
      showToast(error.message);
      return;
    }
    showToast("Instructions saved.");
    router.refresh();
  }

  return (
    <div className="mt-6 flex flex-col gap-2 rounded-[10px] border border-line bg-card p-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-ink">Instructions for this exam (optional)</span>
        <span className="text-sm text-muted">
          Shown to students on the exam and printed on the quiz paper -- e.g. materials allowed,
          scoring notes, or anything specific to this exam.
        </span>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="e.g. Non-programmable calculators allowed. Show your solution for items 5-10."
          className="mt-1"
        />
      </label>
      <Button size="sm" className="self-start" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save instructions"}
      </Button>
    </div>
  );
}
