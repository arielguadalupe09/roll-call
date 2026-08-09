"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { colorForSubject } from "@/lib/schedule-colors";
import { useToast } from "@/app/_components/toast";
import type { DayOfWeek, ScheduleEntry } from "@/lib/types";

const DAYS: DayOfWeek[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];

const SLOT_MINUTES = 30;
const GRID_START = 7 * 60; // 7:00
const GRID_END = 18 * 60; // 18:00
const PDF_WIDTH_IN = 13;
const PDF_HEIGHT_IN = 8.5;

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function hourMinute12(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}`;
}

function toTimeRangeLabel(startMinutes: number): string {
  return `${hourMinute12(startMinutes)}-${hourMinute12(startMinutes + SLOT_MINUTES)}`;
}

function defaultSchoolYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return month >= 5 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

const SLOTS: number[] = [];
for (let m = GRID_START; m < GRID_END; m += SLOT_MINUTES) SLOTS.push(m);

type CoverageCell =
  | { kind: "empty" }
  | { kind: "start"; entry: ScheduleEntry; span: number }
  | { kind: "covered" };

type SharedTeacher = { id: string; full_name: string | null; email: string };

const TERM_KEY_SEP = "|||";

export default function ScheduleClient({
  teacherId,
  initialEntries,
  initialShared,
  sharedTeachers,
}: {
  teacherId: string;
  initialEntries: ScheduleEntry[];
  initialShared: boolean;
  sharedTeachers: SharedTeacher[];
}) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<"mine" | "shared">("mine");

  const [entries, setEntries] = useState(initialEntries);
  const [schoolYear, setSchoolYear] = useState(
    initialEntries[0]?.school_year ?? defaultSchoolYear(),
  );
  const [semester, setSemester] = useState(
    initialEntries[0]?.semester ?? "1st Semester",
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [subjectCode, setSubjectCode] = useState("");
  const [section, setSection] = useState("");
  const [room, setRoom] = useState("");
  const [day, setDay] = useState<DayOfWeek>("Monday");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [shared, setShared] = useState(initialShared);
  const [savingShared, setSavingShared] = useState(false);

  const [selectedTeacherId, setSelectedTeacherId] = useState(sharedTeachers[0]?.id ?? "");
  const [sharedEntries, setSharedEntries] = useState<ScheduleEntry[]>([]);
  const [loadingShared, setLoadingShared] = useState(false);
  const [sharedTermRaw, setSharedTermRaw] = useState<string | null>(null);

  const [exportingPdf, setExportingPdf] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  function resetForm() {
    setEditingId(null);
    setSubjectCode("");
    setSection("");
    setRoom("");
    setDay("Monday");
    setStartTime("08:00");
    setEndTime("09:00");
    setError(null);
  }

  function startEdit(entry: ScheduleEntry) {
    setEditingId(entry.id);
    setSubjectCode(entry.subject_code);
    setSection(entry.section ?? "");
    setRoom(entry.room ?? "");
    setDay(entry.day_of_week);
    setStartTime(entry.start_time.slice(0, 5));
    setEndTime(entry.end_time.slice(0, 5));
    setError(null);
  }

  const visibleEntries = useMemo(
    () =>
      entries.filter(
        (e) => e.school_year === schoolYear && e.semester === semester,
      ),
    [entries, schoolYear, semester],
  );

  useEffect(() => {
    if (mode !== "shared" || !selectedTeacherId) return;
    let cancelled = false;

    (async () => {
      setLoadingShared(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("schedule_entries")
        .select("*")
        .eq("teacher_id", selectedTeacherId)
        .order("start_time", { ascending: true });
      if (cancelled) return;
      setSharedEntries((data as ScheduleEntry[] | null) ?? []);
      setLoadingShared(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, selectedTeacherId]);

  const sharedTermOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of sharedEntries) set.add(`${e.school_year}${TERM_KEY_SEP}${e.semester}`);
    return Array.from(set).sort().reverse();
  }, [sharedEntries]);

  const sharedTerm =
    sharedTermRaw && sharedTermOptions.includes(sharedTermRaw)
      ? sharedTermRaw
      : (sharedTermOptions[0] ?? "");

  const activeEntries = useMemo(() => {
    if (mode === "mine") return visibleEntries;
    return sharedEntries.filter(
      (e) => `${e.school_year}${TERM_KEY_SEP}${e.semester}` === sharedTerm,
    );
  }, [mode, visibleEntries, sharedEntries, sharedTerm]);

  const coverageByDay = useMemo(() => {
    const map = new Map<DayOfWeek, CoverageCell[]>();
    for (const d of DAYS) {
      const coverage: CoverageCell[] = SLOTS.map(() => ({ kind: "empty" }));
      const dayEntries = activeEntries
        .filter((e) => e.day_of_week === d)
        .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));

      for (const entry of dayEntries) {
        const startIdx = SLOTS.findIndex(
          (slot) => slot === toMinutes(entry.start_time),
        );
        if (startIdx === -1) continue;
        const span = Math.max(
          1,
          Math.round(
            (toMinutes(entry.end_time) - toMinutes(entry.start_time)) /
              SLOT_MINUTES,
          ),
        );
        coverage[startIdx] = { kind: "start", entry, span };
        for (
          let i = startIdx + 1;
          i < Math.min(startIdx + span, coverage.length);
          i++
        ) {
          coverage[i] = { kind: "covered" };
        }
      }
      map.set(d, coverage);
    }
    return map;
  }, [activeEntries]);

  const readOnly = mode === "shared";
  const selectedTeacher = sharedTeachers.find((t) => t.id === selectedTeacherId) ?? null;
  const [activeSchoolYear, activeSemester] =
    mode === "mine" ? [schoolYear, semester] : sharedTerm.split(TERM_KEY_SEP);

  async function handleToggleShared(next: boolean) {
    setSavingShared(true);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("teachers")
      .update({ schedule_shared: next })
      .eq("id", teacherId);
    setSavingShared(false);

    if (updateError) {
      showToast(updateError.message);
      return;
    }
    setShared(next);
    showToast(
      next
        ? "Your schedule is now visible to other teachers (read-only)."
        : "Your schedule is no longer shared.",
    );
  }

  async function handleSavePdf() {
    if (!printRef.current) return;
    setExportingPdf(true);

    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        // .no-print only takes effect under @media print, which
        // html2canvas doesn't apply — filter those elements (Edit/Remove
        // links) out explicitly so the exported PDF matches what prints.
        ignoreElements: (el) => el.classList.contains("no-print"),
      });
      const imgAspect = canvas.width / canvas.height;
      const pageAspect = PDF_WIDTH_IN / PDF_HEIGHT_IN;
      const renderWidth = imgAspect > pageAspect ? PDF_WIDTH_IN : PDF_HEIGHT_IN * imgAspect;
      const renderHeight = imgAspect > pageAspect ? PDF_WIDTH_IN / imgAspect : PDF_HEIGHT_IN;
      const offsetX = (PDF_WIDTH_IN - renderWidth) / 2;
      const offsetY = (PDF_HEIGHT_IN - renderHeight) / 2;

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "in",
        format: [PDF_WIDTH_IN, PDF_HEIGHT_IN],
      });
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        offsetX,
        offsetY,
        renderWidth,
        renderHeight,
      );

      const label =
        mode === "mine"
          ? "my-schedule"
          : `${selectedTeacher?.full_name || selectedTeacher?.email || "teacher"}-schedule`;
      pdf.save(`${label.replace(/\s+/g, "-").toLowerCase()}.pdf`);
    } catch {
      showToast("Could not generate the PDF. Please try again.");
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectCode.trim() || !schoolYear.trim() || !semester.trim()) return;
    if (toMinutes(endTime) <= toMinutes(startTime)) {
      setError("End time must be after start time.");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const payload = {
      school_year: schoolYear.trim(),
      semester: semester.trim(),
      day_of_week: day,
      start_time: startTime,
      end_time: endTime,
      subject_code: subjectCode.trim(),
      section: section.trim() || null,
      room: room.trim() || null,
    };

    if (editingId) {
      const { data, error: updateError } = await supabase
        .from("schedule_entries")
        .update(payload)
        .eq("id", editingId)
        .select()
        .single();

      setLoading(false);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setEntries((prev) =>
        prev.map((en) => (en.id === editingId ? (data as ScheduleEntry) : en)),
      );
      resetForm();
      return;
    }

    const { data, error: insertError } = await supabase
      .from("schedule_entries")
      .insert({ teacher_id: teacherId, ...payload })
      .select()
      .single();

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setEntries((prev) => [...prev, data as ScheduleEntry]);
    setSubjectCode("");
    setSection("");
    setRoom("");
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("schedule_entries")
      .delete()
      .eq("id", id);

    if (!deleteError) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (editingId === id) resetForm();
    }
  }

  return (
    <div className="mx-auto max-w-5xl rounded-sm border border-rule bg-paper p-8">
      <style>{`@page { size: ${PDF_WIDTH_IN}in ${PDF_HEIGHT_IN}in landscape; margin: 0.4in; }`}</style>

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Instructor&apos;s Schedule
        </h1>
        <div className="flex gap-1 rounded-sm border border-rule p-1">
          <button
            onClick={() => setMode("mine")}
            className={`rounded-sm px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition ${
              mode === "mine"
                ? "bg-brass text-chalk font-semibold"
                : "text-ink/70 hover:bg-ink/5"
            }`}
          >
            My schedule
          </button>
          <button
            onClick={() => setMode("shared")}
            disabled={sharedTeachers.length === 0}
            title={
              sharedTeachers.length === 0
                ? "No other teachers have shared their schedule yet."
                : undefined
            }
            className={`rounded-sm px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 ${
              mode === "shared"
                ? "bg-brass text-chalk font-semibold"
                : "text-ink/70 hover:bg-ink/5"
            }`}
          >
            Shared schedules
          </button>
        </div>
      </div>

      {mode === "mine" && (
        <>
          <label className="no-print mt-4 flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => handleToggleShared(e.target.checked)}
              disabled={savingShared}
            />
            Share my schedule with other teachers (view-only — they can never
            edit or delete your entries)
          </label>

          <div className="no-print mt-4 flex flex-wrap gap-4">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-wide text-ink/60">
                School Year
              </span>
              <input
                type="text"
                value={schoolYear}
                onChange={(e) => setSchoolYear(e.target.value)}
                className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-wide text-ink/60">
                Semester
              </span>
              <input
                type="text"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
              />
            </label>
          </div>

          <form
            onSubmit={handleSubmit}
            className={`no-print mt-6 flex flex-wrap items-end gap-3 rounded-sm border p-4 ${
              editingId ? "border-brass bg-brass/5" : "border-rule bg-white"
            }`}
          >
            {editingId && (
              <p className="w-full font-mono text-xs uppercase tracking-wide text-brass">
                Editing class — Save changes or Cancel
              </p>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ink">Subject code</span>
              <input
                type="text"
                value={subjectCode}
                onChange={(e) => setSubjectCode(e.target.value)}
                placeholder="e.g. CSS 113"
                className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ink">Section</span>
              <input
                type="text"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="e.g. INFO1A"
                className="w-28 rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ink">Room</span>
              <input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="e.g. A201(LAB1)"
                className="w-32 rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ink">Day</span>
              <select
                value={day}
                onChange={(e) => setDay(e.target.value as DayOfWeek)}
                className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink"
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ink">Start</span>
              <input
                type="time"
                step={1800}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="rounded-sm border border-rule bg-white/60 px-3 py-2 font-mono text-ink"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ink">End</span>
              <input
                type="time"
                step={1800}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="rounded-sm border border-rule bg-white/60 px-3 py-2 font-mono text-ink"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
            >
              {loading
                ? editingId
                  ? "Saving..."
                  : "Adding..."
                : editingId
                  ? "Save changes"
                  : "Add class"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-sm border border-rule px-4 py-2 font-medium text-ink transition hover:bg-ink/5"
              >
                Cancel
              </button>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
          </form>
        </>
      )}

      {mode === "shared" && (
        <div className="no-print mt-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wide text-ink/60">
              Teacher
            </span>
            <select
              value={selectedTeacherId}
              onChange={(e) => {
                setSelectedTeacherId(e.target.value);
                setSharedTermRaw(null);
              }}
              className="min-w-[14rem] rounded-sm border border-rule bg-white px-3 py-2 text-ink outline-none focus:border-brass"
            >
              {sharedTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name || t.email}
                </option>
              ))}
            </select>
          </label>
          {sharedTermOptions.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-wide text-ink/60">
                Term
              </span>
              <select
                value={sharedTerm}
                onChange={(e) => setSharedTermRaw(e.target.value)}
                className="rounded-sm border border-rule bg-white px-3 py-2 text-ink outline-none focus:border-brass"
              >
                {sharedTermOptions.map((key) => {
                  const [sy, sem] = key.split(TERM_KEY_SEP);
                  return (
                    <option key={key} value={key}>
                      {sy} — {sem}
                    </option>
                  );
                })}
              </select>
            </label>
          )}
          {loadingShared && <p className="text-sm text-ink/60">Loading…</p>}
          {!loadingShared && sharedTermOptions.length === 0 && (
            <p className="text-sm text-ink/60">
              This teacher hasn&apos;t added any schedule entries yet.
            </p>
          )}
        </div>
      )}

      <div className="no-print mt-4 flex justify-end gap-3">
        <button
          onClick={handleSavePdf}
          disabled={exportingPdf}
          className="rounded-sm border border-teal px-4 py-2 font-medium text-teal transition hover:bg-teal/10 disabled:opacity-60"
        >
          {exportingPdf ? "Saving PDF..." : "Save PDF"}
        </button>
        <button
          onClick={() => window.print()}
          className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110"
        >
          Print
        </button>
      </div>

      <div id="schedule-print" ref={printRef} className="mt-6 bg-white p-4">
        <p className="mb-3 font-display text-lg font-semibold text-ink">
          {mode === "mine"
            ? "Instructor's Schedule"
            : `${selectedTeacher?.full_name || selectedTeacher?.email || "Teacher"}'s Schedule`}
          {activeSchoolYear && (
            <span className="ml-2 font-mono text-sm font-normal text-ink/60">
              {activeSchoolYear} · {activeSemester}
            </span>
          )}
        </p>
        <div className="overflow-x-auto rounded-sm border border-rule">
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-rule bg-white font-mono text-xs uppercase tracking-wide text-ink/60">
                <th className="w-24 py-2 px-3">Time</th>
                {DAYS.map((d) => (
                  <th key={d} className="py-2 px-3 text-center">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLOTS.map((slotMinutes, rowIdx) => (
                <tr key={slotMinutes} className="border-b border-rule/30">
                  <td className="whitespace-nowrap bg-white py-1.5 px-3 font-mono text-xs text-ink/60">
                    {toTimeRangeLabel(slotMinutes)}
                  </td>
                  {DAYS.map((d) => {
                    const cell = coverageByDay.get(d)?.[rowIdx];
                    if (!cell || cell.kind === "covered") return null;
                    if (cell.kind === "empty") {
                      return <td key={d} className="bg-white py-1.5 px-3" />;
                    }
                    const { entry, span } = cell;
                    return (
                      <td
                        key={d}
                        rowSpan={span}
                        className="relative p-1"
                        style={{ backgroundColor: colorForSubject(entry.subject_code) }}
                      >
                        <div
                          className={`flex h-full flex-col items-center justify-center rounded-sm p-2 text-center ${
                            editingId === entry.id
                              ? "ring-2 ring-inset ring-brass"
                              : ""
                          }`}
                        >
                          <p className="font-display text-sm font-bold text-ink">
                            {entry.subject_code}
                          </p>
                          {entry.section && (
                            <p className="text-xs text-ink/70">{entry.section}</p>
                          )}
                          {entry.room && (
                            <p className="font-mono text-xs text-ink/70">
                              {entry.room}
                            </p>
                          )}
                          {!readOnly && (
                            <div className="no-print mt-1 flex justify-center gap-2">
                              <button
                                onClick={() => startEdit(entry)}
                                className="text-xs text-teal underline underline-offset-2"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(entry.id)}
                                className="text-xs text-danger underline underline-offset-2"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
