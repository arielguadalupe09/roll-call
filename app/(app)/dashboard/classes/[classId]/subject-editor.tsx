"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/app/_components/toast";
import Button from "@/app/_components/button";
import { Input } from "@/app/_components/input";

export default function SubjectEditor({
  classId,
  initialSubject,
}: {
  classId: string;
  initialSubject: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [subject, setSubject] = useState(initialSubject);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialSubject ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const trimmed = value.trim() || null;

    const { error } = await supabase
      .from("classes")
      .update({ subject: trimmed })
      .eq("id", classId);

    setSaving(false);

    if (error) {
      showToast(error.message);
      return;
    }

    setSubject(trimmed);
    setEditing(false);
    router.refresh();
  }

  function cancelEdit() {
    setValue(subject ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <Input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Introduction to Programming"
          className="py-1 text-sm"
        />
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button variant="secondary" size="sm" onClick={cancelEdit}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {subject ? (
        <p className="text-sm text-ink/70">
          Subject: <span className="font-medium text-ink">{subject}</span>{" "}
          <button
            onClick={() => setEditing(true)}
            className="ml-1 text-slate underline underline-offset-2"
          >
            Edit
          </button>
        </p>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          Add subject
        </Button>
      )}
    </div>
  );
}
