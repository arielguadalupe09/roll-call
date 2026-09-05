"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/app/_components/toast";
import type { ClassRow } from "@/lib/types";

const PROGRAM_TYPES = ["Non-board program", "Board program", "Board program (Medicine)"];

const CLASS_FIELDS: { key: keyof ClassRow; label: string; placeholder: string }[] = [
  { key: "academic_year", label: "Academic Year", placeholder: "e.g. 2026-2027" },
  { key: "semester", label: "Semester", placeholder: "e.g. First Semester" },
  { key: "course_code", label: "Course Code", placeholder: "e.g. CSS 113" },
  { key: "total_units", label: "Total Units", placeholder: "e.g. 3/1" },
  { key: "course_type", label: "Course Type", placeholder: "e.g. Lecture" },
  { key: "year_level", label: "Year Level", placeholder: "e.g. Second Year" },
  { key: "campus", label: "Campus", placeholder: "e.g. DHVSU Bacolor" },
  { key: "college", label: "College", placeholder: "e.g. College of Computing Studies" },
  { key: "department", label: "Department", placeholder: "e.g. Information Technology" },
  { key: "program", label: "Program", placeholder: "e.g. BS Information Technology" },
  {
    key: "session_schedule",
    label: "Session Schedule",
    placeholder: "e.g. Tuesday 3:30-5:00pm, Friday 2:00-3:30pm",
  },
];

export default function ClassRecordInfoForm({
  classId,
  initialClass,
  initialFacultyRank,
}: {
  classId: string;
  initialClass: ClassRow;
  initialFacultyRank: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of CLASS_FIELDS) initial[f.key] = (initialClass[f.key] as string | null) ?? "";
    return initial;
  });
  const [facultyRank, setFacultyRank] = useState(initialFacultyRank ?? "");
  const [programType, setProgramType] = useState(initialClass.program_type ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    const classPayload: Record<string, string | null> = {};
    for (const f of CLASS_FIELDS) classPayload[f.key] = values[f.key].trim() || null;
    classPayload.program_type = programType || null;

    const [{ error: classError }, { error: teacherError }] = await Promise.all([
      supabase.from("classes").update(classPayload).eq("id", classId),
      supabase
        .from("teachers")
        .update({ faculty_rank: facultyRank.trim() || null })
        .eq("id", initialClass.teacher_id),
    ]);

    setSaving(false);

    if (classError || teacherError) {
      showToast((classError ?? teacherError)?.message ?? "Could not save.");
      return;
    }

    showToast("Class record info saved");
    router.refresh();
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="text-sm text-teal underline underline-offset-2"
      >
        {expanded ? "Hide class record info" : "Class record info (for Excel export)"}
      </button>

      {expanded && (
        <div className="mt-3 rounded-2xl border border-rule/60 bg-white p-4 shadow-sm">
          <p className="text-sm text-ink/60">
            Used to fill the header of your official Class Record Excel export.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ink">Program Type</span>
              <select
                value={programType}
                onChange={(e) => setProgramType(e.target.value)}
                className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-sm text-ink outline-none focus:border-brass"
              >
                <option value="">Not set</option>
                {PROGRAM_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            {CLASS_FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="text-sm font-medium text-ink">{f.label}</span>
                <input
                  type="text"
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                  placeholder={f.placeholder}
                  className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-sm text-ink outline-none focus:border-brass"
                />
              </label>
            ))}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ink">Faculty Rank</span>
              <input
                type="text"
                value={facultyRank}
                onChange={(e) => setFacultyRank(e.target.value)}
                placeholder="e.g. Instructor I"
                className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-sm text-ink outline-none focus:border-brass"
              />
            </label>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-4 rounded-sm bg-brass px-4 py-2 text-sm font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save class record info"}
          </button>
        </div>
      )}
    </div>
  );
}
