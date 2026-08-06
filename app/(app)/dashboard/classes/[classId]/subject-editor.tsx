"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SubjectEditor({
  classId,
  initialSubject,
}: {
  classId: string;
  initialSubject: string | null;
}) {
  const router = useRouter();
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
      window.alert(error.message);
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
        <input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Introduction to Programming"
          className="rounded-sm border border-rule bg-white/60 px-2 py-1 text-sm text-ink outline-none focus:border-brass"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm text-teal underline underline-offset-2 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={cancelEdit}
          className="text-sm text-ink/60 underline underline-offset-2"
        >
          Cancel
        </button>
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
            className="ml-1 text-teal underline underline-offset-2"
          >
            Edit
          </button>
        </p>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="rounded-sm border border-rule px-3 py-1.5 text-sm text-ink transition hover:bg-ink/5"
        >
          Add subject
        </button>
      )}
    </div>
  );
}
