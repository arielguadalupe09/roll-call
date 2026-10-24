"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { GradingConfig } from "@/lib/types";
import {
  DEFAULT_SECTION_TITLES,
  moveSection,
  resolveSectionOrder,
  type RecordCardSectionKey,
} from "@/lib/record-card-layout";
import { useToast } from "@/app/_components/toast";
import Button from "@/app/_components/button";
import { Input, Select } from "@/app/_components/input";
import {
  CLASS_STANDING_SLOTS,
  COURSE_TYPE_PRESETS,
  COURSE_TYPES,
  CRITERION_PERCENTS,
  DHVSU_CRITERIA_NAMES,
  PERCENTS,
  PROGRAM_TYPES,
  GRADING_CONFIG_SAVED_EVENT,
  type CriterionKey,
  type CriterionSlot,
} from "@/lib/grading-criteria";
import { FormField } from "@/app/_components/form-field";

const SECTION_FIELDS = [
  { key: "show_recitation", section: "recitation" },
  { key: "show_quiz", section: "quiz" },
  { key: "show_written", section: "written" },
  { key: "show_laboratory", section: "laboratory" },
  { key: "show_other", section: "other" },
  { key: "show_major_exam", section: "major_exam" },
  { key: "show_attendance", section: "attendance" },
] as const;

type SectionKey = (typeof SECTION_FIELDS)[number]["key"];

const SHOW_FIELD_BY_SECTION: Record<RecordCardSectionKey, SectionKey> = Object.fromEntries(
  SECTION_FIELDS.map((f) => [f.section, f.key]),
) as Record<RecordCardSectionKey, SectionKey>;

type WeightField = "weight_attendance" | "weight_major_exam" | CriterionSlot["weightField"];

// A 5%-step dropdown like the template's, keeping any older off-step value
// (e.g. 12%) selectable so opening Setup never silently changes it.
function PercentSelect({
  value,
  options,
  onChange,
  label,
}: {
  value: number;
  options: readonly number[];
  onChange: (value: number) => void;
  label: string;
}) {
  const all = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <Select
      value={String(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={label}
      className="!w-24 font-mono"
    >
      {all.map((p) => (
        <option key={p} value={p}>
          {p}%
        </option>
      ))}
    </Select>
  );
}

export default function SetupTab({
  classId,
  initialConfig,
  initialProgramType,
  initialCourseType,
}: {
  classId: string;
  initialConfig: GradingConfig;
  initialProgramType: string | null;
  initialCourseType: string | null;
}) {
  const [weights, setWeights] = useState<Record<WeightField, number>>(() => {
    const initial = {} as Record<WeightField, number>;
    const fields: WeightField[] = ["weight_attendance", "weight_major_exam", ...CLASS_STANDING_SLOTS.map((s) => s.weightField)];
    for (const f of fields) initial[f] = Number(initialConfig[f]) || 0;
    return initial;
  });
  const [labels, setLabels] = useState<Record<CriterionKey, string>>(() => {
    const initial = {} as Record<CriterionKey, string>;
    for (const slot of CLASS_STANDING_SLOTS) {
      initial[slot.key] = initialConfig.criteria_labels?.[slot.key]?.trim() || slot.defaultLabel;
    }
    return initial;
  });
  const [programType, setProgramType] = useState(initialProgramType ?? "");
  const [courseType, setCourseType] = useState(initialCourseType ?? "");
  const [usePrelims, setUsePrelims] = useState(initialConfig.use_prelims);
  const [prelimWeight, setPrelimWeight] = useState(Number(initialConfig.prelim_weight) || 0);
  const [midtermWeight, setMidtermWeight] = useState(Number(initialConfig.midterm_weight) || 0);
  const [finalsWeight, setFinalsWeight] = useState(Number(initialConfig.finals_weight) || 0);
  const [prelimEndDate, setPrelimEndDate] = useState(initialConfig.prelim_end_date ?? "");
  const [midtermEndDate, setMidtermEndDate] = useState(initialConfig.midterm_end_date ?? "");
  const [sections, setSections] = useState<Record<SectionKey, boolean>>(() => {
    const initial = {} as Record<SectionKey, boolean>;
    for (const f of SECTION_FIELDS) initial[f.key] = initialConfig[f.key] ?? true;
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
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const setWeight = (field: WeightField, value: number) => setWeights((prev) => ({ ...prev, [field]: value }));
  const classStanding = CLASS_STANDING_SLOTS.reduce((sum, s) => sum + weights[s.weightField], 0);
  const total = weights.weight_attendance + weights.weight_major_exam + classStanding;
  const periodSum = (usePrelims ? prelimWeight : 0) + midtermWeight + finalsWeight;
  const preset = COURSE_TYPE_PRESETS[courseType as keyof typeof COURSE_TYPE_PRESETS];

  // A section's default record-card title follows its criterion's name.
  const sectionPlaceholder = (key: RecordCardSectionKey) =>
    CLASS_STANDING_SLOTS.some((s) => s.key === key)
      ? labels[key as CriterionKey] || "Other"
      : DEFAULT_SECTION_TITLES[key];

  function applyPreset() {
    if (!preset) return;
    setWeights((prev) => ({ ...prev, ...preset }));
    setLabels((prev) => ({ ...prev, laboratory: prev.laboratory || "Activities" }));
    showToast(`Applied the DHVSU ${courseType} percentages. Review them, then Save configuration.`);
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    const payload: Partial<GradingConfig> & { class_id: string } = {
      class_id: classId,
      ...weights,
      // Only names that differ from the built-in default are stored, so a
      // later default change still reaches classes that never renamed.
      criteria_labels: Object.fromEntries(
        CLASS_STANDING_SLOTS.filter((s) => labels[s.key].trim() && labels[s.key].trim() !== s.defaultLabel).map((s) => [
          s.key,
          labels[s.key].trim(),
        ]),
      ),
      use_prelims: usePrelims,
      prelim_weight: prelimWeight,
      midterm_weight: midtermWeight,
      finals_weight: finalsWeight,
      prelim_end_date: usePrelims ? prelimEndDate || null : null,
      midterm_end_date: midtermEndDate || null,
    };
    for (const f of SECTION_FIELDS) payload[f.key] = sections[f.key];
    payload.record_card_layout = {
      order,
      titles: Object.fromEntries(
        Object.entries(titles).filter(([, v]) => v.trim() !== ""),
      ),
    };

    const [{ error }, { error: classError }] = await Promise.all([
      supabase.from("grading_configs").upsert(payload, { onConflict: "class_id" }),
      supabase
        .from("classes")
        .update({ program_type: programType || null, course_type: courseType || null })
        .eq("id", classId),
    ]);

    setSaving(false);
    if (error || classError) {
      showToast((error ?? classError)!.message);
      return;
    }
    showToast("Your grading configuration has been saved successfully.");
    // Overview, the other tabs and the top Gradebook menu were rendered with
    // the old weights/names -- re-fetch so switching tabs shows the new
    // grades without a manual page reload.
    router.refresh();
    window.dispatchEvent(new Event(GRADING_CONFIG_SAVED_EVENT));
  }

  return (
    <div className="mt-6 max-w-2xl">
      <p className="text-ink/70">
        Set up grading the same way as the DHVSU class record&apos;s Info sheet. Grades follow the official
        computation: each score is transmuted, a missing score counts as 0, and a criterion with no items yet
        counts as 0. Assignments don&apos;t count toward the grade. The exported class record uses these same
        settings.
      </p>

      <div className="mt-4 rounded-[10px] border border-line bg-card p-4">
        <p className="text-xs text-muted">Course information</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FormField label="Program type">
            <Select value={programType} onChange={(e) => setProgramType(e.target.value)}>
              <option value="">Not set (graded as Non-board program)</option>
              {PROGRAM_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Course type">
            <Select value={courseType} onChange={(e) => setCourseType(e.target.value)}>
              <option value="">Not set</option>
              {[...COURSE_TYPES, ...(courseType && !(COURSE_TYPES as readonly string[]).includes(courseType) ? [courseType] : [])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <p className="mt-2 text-xs text-muted">
          Program type picks the transmutation table (Non-board, Board, or Board Medicine).
        </p>
        {preset && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={applyPreset}>
              Use DHVSU {courseType} percentages
            </Button>
            <span className="text-xs text-muted">
              Attendance {preset.weight_attendance}% · Recitation {preset.weight_recitation}% · Quizzes{" "}
              {preset.weight_quiz}% · Activities {preset.weight_laboratory}% · Major Exam {preset.weight_major_exam}%
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-[10px] border border-line bg-card p-4">
        <p className="text-xs text-muted">Grading system</p>
        <div className="mt-3 flex flex-wrap gap-4">
          {usePrelims && (
            <FormField label="Prelims">
              <PercentSelect value={prelimWeight} options={PERCENTS} onChange={setPrelimWeight} label="Prelims weight" />
            </FormField>
          )}
          <FormField label="Midterm">
            <PercentSelect value={midtermWeight} options={PERCENTS} onChange={setMidtermWeight} label="Midterm weight" />
          </FormField>
          <FormField label="Finals">
            <PercentSelect value={finalsWeight} options={PERCENTS} onChange={setFinalsWeight} label="Finals weight" />
          </FormField>
        </div>
        <p className={`mt-2 text-sm ${periodSum === 100 ? "text-success-text" : "text-danger"}`}>
          Total: {periodSum}% {periodSum !== 100 && "(should add up to 100%)"}
        </p>
      </div>

      <div className="mt-4 rounded-[10px] border border-line bg-card p-4">
        <p className="text-xs text-muted">Criteria (each term)</p>
        <div className="mt-3 overflow-hidden rounded-sm border border-line">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-line">
                <td className="px-3 py-2 font-medium text-ink">Attendance</td>
                <td className="w-28 px-3 py-1.5 text-right">
                  <PercentSelect
                    value={weights.weight_attendance}
                    options={PERCENTS}
                    onChange={(v) => setWeight("weight_attendance", v)}
                    label="Attendance weight"
                  />
                </td>
              </tr>
              <tr className="border-b border-line">
                <td className="px-3 py-2 font-medium text-ink">Major Exam</td>
                <td className="px-3 py-1.5 text-right">
                  <PercentSelect
                    value={weights.weight_major_exam}
                    options={PERCENTS}
                    onChange={(v) => setWeight("weight_major_exam", v)}
                    label="Major exam weight"
                  />
                </td>
              </tr>
              <tr className="border-b border-line bg-paper/60">
                <td className="px-3 py-2 font-medium text-ink">Class Standing</td>
                <td className="px-3 py-2 text-right font-mono font-medium text-ink">{classStanding}%</td>
              </tr>
              {CLASS_STANDING_SLOTS.map((slot) => (
                <tr key={slot.key} className="border-b border-line">
                  <td className="py-1.5 pl-8 pr-3">
                    <Select
                      value={labels[slot.key]}
                      onChange={(e) => setLabels((prev) => ({ ...prev, [slot.key]: e.target.value }))}
                      aria-label={`Criterion ${CLASS_STANDING_SLOTS.indexOf(slot) + 1} name`}
                      className="!py-1 text-sm"
                    >
                      {slot.key === "other" && <option value="">Not used</option>}
                      {Array.from(
                        new Set([
                          ...(labels[slot.key] ? [labels[slot.key]] : []),
                          ...(slot.defaultLabel ? [slot.defaultLabel] : []),
                          ...DHVSU_CRITERIA_NAMES,
                        ]),
                      ).map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <PercentSelect
                      value={weights[slot.weightField]}
                      options={CRITERION_PERCENTS}
                      onChange={(v) => setWeight(slot.weightField, v)}
                      label={`${labels[slot.key] || "Criterion"} weight`}
                    />
                  </td>
                </tr>
              ))}
              <tr className="bg-paper/60">
                <td className="px-3 py-2 font-semibold text-ink">Total</td>
                <td
                  className={`px-3 py-2 text-right font-mono font-semibold ${total === 100 ? "text-success-text" : "text-danger"}`}
                >
                  {total}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {total !== 100 && <p className="mt-2 text-sm text-danger">Should add up to 100%.</p>}
        <p className="mt-2 text-xs text-muted">
          Each criterion&apos;s name is its tab in the Gradebook menu. Renaming one keeps all of its scores.
        </p>
      </div>

      <div className="mt-4 rounded-[10px] border border-line bg-card p-4">
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

      <div className="mt-4 rounded-[10px] border border-line bg-card p-4">
        <p className="text-xs text-muted">
          Term cutoff{usePrelims ? "s" : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {usePrelims && (
            <FormField label="Prelims ends on" className="w-56">
              <Input
                type="date"
                value={prelimEndDate}
                onChange={(e) => setPrelimEndDate(e.target.value)}
                className="font-mono"
              />
            </FormField>
          )}
          <FormField label="Midterm ends on" className="w-56">
            <Input
              type="date"
              value={midtermEndDate}
              onChange={(e) => setMidtermEndDate(e.target.value)}
              className="font-mono"
            />
          </FormField>
        </div>
        <p className="mt-2 text-sm text-ink/60">
          {usePrelims
            ? "Class dates (attendance) on or before the Prelims date count toward Prelims; after it up to the Midterm date toward Midterm; anything later toward Finals."
            : "Class dates (attendance) on or before this date count toward Midterm; later dates count toward Finals."}
        </p>
      </div>

      <div className="mt-4 rounded-[10px] border border-line bg-card p-4">
        <p className="text-xs text-muted">
          Record card layout
        </p>
        <p className="mt-1 text-sm text-ink/60">
          Choose which sections print, their order, and a custom title for
          each on this class&apos;s Student Individual Record Card.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {order.map((key, index) => (
            <div
              key={key}
              className="flex items-center gap-3 rounded-sm border border-line/60 p-2"
            >
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => setOrder((prev) => moveSection(prev, key, "up"))}
                  disabled={index === 0}
                  aria-label={`Move ${sectionPlaceholder(key)} up`}
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
                  aria-label={`Move ${sectionPlaceholder(key)} down`}
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
                aria-label={`Show ${sectionPlaceholder(key)}`}
              />

              <Input
                type="text"
                value={titles[key]}
                onChange={(e) =>
                  setTitles((prev) => ({ ...prev, [key]: e.target.value }))
                }
                placeholder={sectionPlaceholder(key)}
                className="flex-1 !py-1 text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save configuration"}
        </Button>
      </div>
    </div>
  );
}
