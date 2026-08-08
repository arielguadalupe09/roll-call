"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { GradingConfig } from "@/lib/types";

const CATEGORY_FIELDS = [
  { key: "weight_assignment", label: "Assignment" },
  { key: "weight_recitation", label: "Recitation" },
  { key: "weight_quiz", label: "Quiz" },
  { key: "weight_written", label: "Written Activity" },
  { key: "weight_laboratory", label: "Laboratory Activity" },
  { key: "weight_major_exam", label: "Major Examination" },
] as const;

type FieldKey = (typeof CATEGORY_FIELDS)[number]["key"];

const SECTION_FIELDS = [
  { key: "show_assignment", label: "Assignment" },
  { key: "show_recitation", label: "Recitation" },
  { key: "show_quiz", label: "Quiz" },
  { key: "show_written", label: "Written Activity" },
  { key: "show_laboratory", label: "Laboratory Activity" },
  { key: "show_major_exam", label: "Major Exam" },
  { key: "show_attendance", label: "Attendance" },
] as const;

type SectionKey = (typeof SECTION_FIELDS)[number]["key"];

export default function SetupTab({
  classId,
  initialConfig,
}: {
  classId: string;
  initialConfig: GradingConfig;
}) {
  const [values, setValues] = useState<Record<FieldKey, string>>(() => {
    const initial = {} as Record<FieldKey, string>;
    for (const f of CATEGORY_FIELDS) initial[f.key] = String(initialConfig[f.key]);
    return initial;
  });
  const [midtermWeight, setMidtermWeight] = useState(String(initialConfig.midterm_weight));
  const [finalsWeight, setFinalsWeight] = useState(String(initialConfig.finals_weight));
  const [midtermEndDate, setMidtermEndDate] = useState(initialConfig.midterm_end_date ?? "");
  const [sections, setSections] = useState<Record<SectionKey, boolean>>(() => {
    const initial = {} as Record<SectionKey, boolean>;
    for (const f of SECTION_FIELDS) initial[f.key] = initialConfig[f.key];
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const weightSum = useMemo(
    () => CATEGORY_FIELDS.reduce((sum, f) => sum + (Number(values[f.key]) || 0), 0),
    [values],
  );
  const periodSum = (Number(midtermWeight) || 0) + (Number(finalsWeight) || 0);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const supabase = createClient();

    const payload: Partial<GradingConfig> & { class_id: string } = {
      class_id: classId,
      midterm_weight: Number(midtermWeight) || 0,
      finals_weight: Number(finalsWeight) || 0,
      midterm_end_date: midtermEndDate || null,
    };
    for (const f of CATEGORY_FIELDS) payload[f.key] = Number(values[f.key]) || 0;
    for (const f of SECTION_FIELDS) payload[f.key] = sections[f.key];

    const { error } = await supabase
      .from("grading_configs")
      .upsert(payload, { onConflict: "class_id" });

    setSaving(false);
    if (error) {
      window.alert(error.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mt-6 max-w-2xl">
      <p className="text-ink/70">
        Set how much each category counts toward the grade, and the date that
        splits recitation taps into Midterm vs. Finals.
      </p>

      <div className="mt-4 rounded-sm border border-rule bg-white p-4">
        <p className="font-mono text-xs uppercase tracking-wide text-ink/60">
          Category weights (%)
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CATEGORY_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-sm text-ink">{f.label}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={values[f.key]}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                className="rounded-sm border border-rule bg-white/60 px-3 py-2 font-mono text-ink outline-none focus:border-brass"
              />
            </label>
          ))}
        </div>
        <p
          className={`mt-3 text-sm ${
            weightSum === 100 ? "text-teal" : "text-danger"
          }`}
        >
          Total: {weightSum}% {weightSum !== 100 && "(should add up to 100%)"}
        </p>
      </div>

      <div className="mt-4 rounded-sm border border-rule bg-white p-4">
        <p className="font-mono text-xs uppercase tracking-wide text-ink/60">
          Combining Midterm + Finals into the Final Grade
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="flex w-36 flex-col gap-1">
            <span className="text-sm text-ink">Midterm weight (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={midtermWeight}
              onChange={(e) => setMidtermWeight(e.target.value)}
              className="rounded-sm border border-rule bg-white/60 px-3 py-2 font-mono text-ink outline-none focus:border-brass"
            />
          </label>
          <label className="flex w-36 flex-col gap-1">
            <span className="text-sm text-ink">Finals weight (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={finalsWeight}
              onChange={(e) => setFinalsWeight(e.target.value)}
              className="rounded-sm border border-rule bg-white/60 px-3 py-2 font-mono text-ink outline-none focus:border-brass"
            />
          </label>
        </div>
        <p
          className={`mt-3 text-sm ${
            periodSum === 100 ? "text-teal" : "text-danger"
          }`}
        >
          Total: {periodSum}% {periodSum !== 100 && "(should add up to 100%)"}
        </p>
      </div>

      <div className="mt-4 rounded-sm border border-rule bg-white p-4">
        <p className="font-mono text-xs uppercase tracking-wide text-ink/60">
          Recitation period cutoff
        </p>
        <label className="mt-3 flex w-56 flex-col gap-1">
          <span className="text-sm text-ink">Midterm ends on</span>
          <input
            type="date"
            value={midtermEndDate}
            onChange={(e) => setMidtermEndDate(e.target.value)}
            className="rounded-sm border border-rule bg-white/60 px-3 py-2 font-mono text-ink outline-none focus:border-brass"
          />
        </label>
        <p className="mt-2 text-sm text-ink/60">
          Recitation taps on or before this date count toward Midterm; taps
          after it count toward Finals.
        </p>
      </div>

      <div className="mt-4 rounded-sm border border-rule bg-white p-4">
        <p className="font-mono text-xs uppercase tracking-wide text-ink/60">
          Record Card sections
        </p>
        <p className="mt-1 text-sm text-ink/60">
          Choose which sections print on this class&apos;s Student Individual
          Record Card.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SECTION_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={sections[f.key]}
                onChange={(e) =>
                  setSections((prev) => ({ ...prev, [f.key]: e.target.checked }))
                }
              />
              {f.label}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save configuration"}
        </button>
        {saved && <p className="text-sm text-teal">Saved.</p>}
      </div>
    </div>
  );
}
