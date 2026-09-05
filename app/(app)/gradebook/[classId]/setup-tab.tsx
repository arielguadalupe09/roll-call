"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { GradingConfig } from "@/lib/types";
import {
  DEFAULT_SECTION_TITLES,
  moveSection,
  resolveSectionOrder,
  type RecordCardSectionKey,
} from "@/lib/record-card-layout";
import { useToast } from "@/app/_components/toast";

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

const SHOW_FIELD_BY_SECTION: Record<RecordCardSectionKey, SectionKey> = {
  assignment: "show_assignment",
  recitation: "show_recitation",
  quiz: "show_quiz",
  written: "show_written",
  laboratory: "show_laboratory",
  major_exam: "show_major_exam",
  attendance: "show_attendance",
};

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
  const [usePrelims, setUsePrelims] = useState(initialConfig.use_prelims);
  const [prelimWeight, setPrelimWeight] = useState(String(initialConfig.prelim_weight));
  const [midtermWeight, setMidtermWeight] = useState(String(initialConfig.midterm_weight));
  const [finalsWeight, setFinalsWeight] = useState(String(initialConfig.finals_weight));
  const [prelimEndDate, setPrelimEndDate] = useState(initialConfig.prelim_end_date ?? "");
  const [midtermEndDate, setMidtermEndDate] = useState(initialConfig.midterm_end_date ?? "");
  const [sections, setSections] = useState<Record<SectionKey, boolean>>(() => {
    const initial = {} as Record<SectionKey, boolean>;
    for (const f of SECTION_FIELDS) initial[f.key] = initialConfig[f.key];
    return initial;
  });
  const [order, setOrder] = useState<RecordCardSectionKey[]>(() =>
    resolveSectionOrder(initialConfig.record_card_layout),
  );
  const [titles, setTitles] = useState<Record<RecordCardSectionKey, string>>(() => {
    const initial = {} as Record<RecordCardSectionKey, string>;
    for (const key of Object.keys(DEFAULT_SECTION_TITLES) as RecordCardSectionKey[]) {
      initial[key] = initialConfig.record_card_layout?.titles?.[key] ?? "";
    }
    return initial;
  });
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const weightSum = useMemo(
    () => CATEGORY_FIELDS.reduce((sum, f) => sum + (Number(values[f.key]) || 0), 0),
    [values],
  );
  const periodSum =
    (usePrelims ? Number(prelimWeight) || 0 : 0) +
    (Number(midtermWeight) || 0) +
    (Number(finalsWeight) || 0);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    const payload: Partial<GradingConfig> & { class_id: string } = {
      class_id: classId,
      use_prelims: usePrelims,
      prelim_weight: Number(prelimWeight) || 0,
      midterm_weight: Number(midtermWeight) || 0,
      finals_weight: Number(finalsWeight) || 0,
      prelim_end_date: usePrelims ? prelimEndDate || null : null,
      midterm_end_date: midtermEndDate || null,
    };
    for (const f of CATEGORY_FIELDS) payload[f.key] = Number(values[f.key]) || 0;
    for (const f of SECTION_FIELDS) payload[f.key] = sections[f.key];
    payload.record_card_layout = {
      order,
      titles: Object.fromEntries(
        Object.entries(titles).filter(([, v]) => v.trim() !== ""),
      ),
    };

    const { error } = await supabase
      .from("grading_configs")
      .upsert(payload, { onConflict: "class_id" });

    setSaving(false);
    if (error) {
      showToast(error.message);
      return;
    }
    showToast("Your grading configuration has been saved successfully.");
  }

  return (
    <div className="mt-6 max-w-2xl">
      <p className="text-ink/70">
        Set how much each category counts toward the grade, and the date that
        splits recitation taps into Midterm vs. Finals.
      </p>

      <div className="mt-4 rounded-2xl border border-rule/60 bg-white p-4 shadow-sm">
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

      <div className="mt-4 rounded-2xl border border-rule/60 bg-white p-4 shadow-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={usePrelims}
            onChange={(e) => setUsePrelims(e.target.checked)}
          />
          <span className="text-sm font-medium text-ink">
            Use Prelims (3 grading periods)
          </span>
        </label>
        <p className="mt-1 text-sm text-ink/60">
          For schools that grade Prelims, Midterms, and Finals separately
          instead of just Midterm/Finals.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-rule/60 bg-white p-4 shadow-sm">
        <p className="font-mono text-xs uppercase tracking-wide text-ink/60">
          Combining {usePrelims ? "Prelim + Midterm + Finals" : "Midterm + Finals"} into the Final Grade
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {usePrelims && (
            <label className="flex w-36 flex-col gap-1">
              <span className="text-sm text-ink">Prelims weight (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={prelimWeight}
                onChange={(e) => setPrelimWeight(e.target.value)}
                className="rounded-sm border border-rule bg-white/60 px-3 py-2 font-mono text-ink outline-none focus:border-brass"
              />
            </label>
          )}
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

      <div className="mt-4 rounded-2xl border border-rule/60 bg-white p-4 shadow-sm">
        <p className="font-mono text-xs uppercase tracking-wide text-ink/60">
          Recitation period cutoff{usePrelims ? "s" : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {usePrelims && (
            <label className="flex w-56 flex-col gap-1">
              <span className="text-sm text-ink">Prelims ends on</span>
              <input
                type="date"
                value={prelimEndDate}
                onChange={(e) => setPrelimEndDate(e.target.value)}
                className="rounded-sm border border-rule bg-white/60 px-3 py-2 font-mono text-ink outline-none focus:border-brass"
              />
            </label>
          )}
          <label className="flex w-56 flex-col gap-1">
            <span className="text-sm text-ink">Midterm ends on</span>
            <input
              type="date"
              value={midtermEndDate}
              onChange={(e) => setMidtermEndDate(e.target.value)}
              className="rounded-sm border border-rule bg-white/60 px-3 py-2 font-mono text-ink outline-none focus:border-brass"
            />
          </label>
        </div>
        <p className="mt-2 text-sm text-ink/60">
          {usePrelims
            ? "Recitation taps on or before the Prelims date count toward Prelims; taps after it up to the Midterm date count toward Midterm; anything later counts toward Finals."
            : "Recitation taps on or before this date count toward Midterm; taps after it count toward Finals."}
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-rule/60 bg-white p-4 shadow-sm">
        <p className="font-mono text-xs uppercase tracking-wide text-ink/60">
          Record Card layout
        </p>
        <p className="mt-1 text-sm text-ink/60">
          Choose which sections print, their order, and a custom title for
          each on this class&apos;s Student Individual Record Card.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {order.map((key, index) => (
            <div
              key={key}
              className="flex items-center gap-3 rounded-sm border border-rule/60 p-2"
            >
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => setOrder((prev) => moveSection(prev, key, "up"))}
                  disabled={index === 0}
                  aria-label={`Move ${DEFAULT_SECTION_TITLES[key]} up`}
                  className="text-ink/50 hover:text-ink disabled:opacity-25"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M4 10l4-4 4 4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setOrder((prev) => moveSection(prev, key, "down"))}
                  disabled={index === order.length - 1}
                  aria-label={`Move ${DEFAULT_SECTION_TITLES[key]} down`}
                  className="text-ink/50 hover:text-ink disabled:opacity-25"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M4 6l4 4 4-4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>

              <input
                type="checkbox"
                checked={sections[SHOW_FIELD_BY_SECTION[key]]}
                onChange={(e) =>
                  setSections((prev) => ({
                    ...prev,
                    [SHOW_FIELD_BY_SECTION[key]]: e.target.checked,
                  }))
                }
                aria-label={`Show ${DEFAULT_SECTION_TITLES[key]}`}
              />

              <input
                type="text"
                value={titles[key]}
                onChange={(e) =>
                  setTitles((prev) => ({ ...prev, [key]: e.target.value }))
                }
                placeholder={DEFAULT_SECTION_TITLES[key]}
                className="flex-1 rounded-sm border border-rule bg-white/60 px-2 py-1 text-sm text-ink outline-none focus:border-brass"
              />
            </div>
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
      </div>
    </div>
  );
}
