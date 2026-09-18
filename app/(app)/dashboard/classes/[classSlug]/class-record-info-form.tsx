"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/app/_components/toast";
import type { ClassRow } from "@/lib/types";
import Button from "@/app/_components/button";
import { Input, Select } from "@/app/_components/input";
import { FormField } from "@/app/_components/form-field";

const PROGRAM_TYPES = ["Non-board program", "Board program", "Board program (Medicine)"];

const CLASS_FIELDS: { key: keyof ClassRow; label: string; placeholder: string }[] = [
  { key: "academic_year", label: "Academic year", placeholder: "e.g. 2026-2027" },
  { key: "semester", label: "Semester", placeholder: "e.g. First Semester" },
  { key: "course_code", label: "Course code", placeholder: "e.g. CSS 113" },
  { key: "total_units", label: "Total units", placeholder: "e.g. 3/1" },
  { key: "course_type", label: "Course type", placeholder: "e.g. Lecture" },
  { key: "year_level", label: "Year level", placeholder: "e.g. Second Year" },
  { key: "campus", label: "Campus", placeholder: "e.g. DHVSU Bacolor" },
  { key: "college", label: "College", placeholder: "e.g. College of Computing Studies" },
  { key: "department", label: "Department", placeholder: "e.g. Information Technology" },
  { key: "program", label: "Program", placeholder: "e.g. BS Information Technology" },
  {
    key: "session_schedule",
    label: "Session schedule",
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
        className="text-sm text-slate underline underline-offset-2"
      >
        {expanded ? "Hide class record info" : "Class record info (for Excel export)"}
      </button>

      {expanded && (
        <div className="mt-3 rounded-[10px] border border-line bg-card p-4">
          <p className="text-sm text-ink/60">
            Used to fill the header of your official Class Record Excel export.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Program type">
              <Select value={programType} onChange={(e) => setProgramType(e.target.value)}>
                <option value="">Not set</option>
                {PROGRAM_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </FormField>
            {CLASS_FIELDS.map((f) => (
              <FormField key={f.key} label={f.label}>
                <Input
                  type="text"
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                  placeholder={f.placeholder}
                />
              </FormField>
            ))}
            <FormField label="Faculty rank">
              <Input
                type="text"
                value={facultyRank}
                onChange={(e) => setFacultyRank(e.target.value)}
                placeholder="e.g. Instructor I"
              />
            </FormField>
          </div>
          <Button onClick={handleSave} disabled={saving} className="mt-4">
            {saving ? "Saving..." : "Save class record info"}
          </Button>
        </div>
      )}
    </div>
  );
}
