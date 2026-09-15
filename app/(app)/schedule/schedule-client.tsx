"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { colorForSubject, borderColorForSubject } from "@/lib/schedule-colors";
import { useToast } from "@/app/_components/toast";
import { useConfirm } from "@/app/_components/confirm-provider";
import type { DayOfWeek, ScheduleEntry, TeacherOption } from "@/lib/types";
import Button from "@/app/_components/button";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/app/_components/table";
import { Input, Select } from "@/app/_components/input";
import { FormField } from "@/app/_components/form-field";

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
const PDF_WIDTH_IN = 8.5;
const PDF_HEIGHT_IN = 13;

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

const TERM_KEY_SEP = "|||";

export default function ScheduleClient({
  teacherId,
  initialEntries,
  allTeachers,
  initialSharedWithIds,
  sharedTeachers,
  schoolName,
  campusLine,
  logoUrl,
}: {
  teacherId: string;
  initialEntries: ScheduleEntry[];
  allTeachers: TeacherOption[];
  initialSharedWithIds: string[];
  sharedTeachers: TeacherOption[];
  schoolName: string | null;
  campusLine: string | null;
  logoUrl: string | null;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
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

  const [sharedWithIds, setSharedWithIds] = useState<Set<string>>(
    () => new Set(initialSharedWithIds),
  );
  const [addTeacherId, setAddTeacherId] = useState("");
  const [savingShare, setSavingShare] = useState(false);

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

  const shareableTeachers = useMemo(
    () => allTeachers.filter((t) => !sharedWithIds.has(t.id)),
    [allTeachers, sharedWithIds],
  );
  const sharedWithTeachers = useMemo(
    () => allTeachers.filter((t) => sharedWithIds.has(t.id)),
    [allTeachers, sharedWithIds],
  );

  async function handleAddShare() {
    if (!addTeacherId) return;
    setSavingShare(true);
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("schedule_shares")
      .insert({ owner_id: teacherId, viewer_id: addTeacherId });
    setSavingShare(false);

    if (insertError) {
      showToast(insertError.message);
      return;
    }
    const teacher = allTeachers.find((t) => t.id === addTeacherId);
    setSharedWithIds((prev) => new Set(prev).add(addTeacherId));
    setAddTeacherId("");
    showToast(`Schedule shared with ${teacher?.full_name || teacher?.email}.`);
  }

  async function handleRemoveShare(viewerId: string) {
    setSavingShare(true);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("schedule_shares")
      .delete()
      .eq("owner_id", teacherId)
      .eq("viewer_id", viewerId);
    setSavingShare(false);

    if (deleteError) {
      showToast(deleteError.message);
      return;
    }
    setSharedWithIds((prev) => {
      const next = new Set(prev);
      next.delete(viewerId);
      return next;
    });
  }

  async function handleSavePdf() {
    if (!printRef.current) return;
    const label =
      mode === "mine"
        ? "your schedule"
        : `${selectedTeacher?.full_name || selectedTeacher?.email || "this teacher"}'s schedule`;
    const confirmed = await confirm(`Save ${label} as a PDF?`, { confirmLabel: "Save" });
    if (!confirmed) return;

    setExportingPdf(true);

    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas-pro"),
      ]);

      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        // The school logo is fetched from a signed Supabase Storage URL —
        // a different origin — so without this html2canvas silently skips
        // it (tainted canvas) and leaves the empty placeholder box.
        useCORS: true,
        // .no-print only takes effect under @media print, which
        // html2canvas doesn't apply — filter those elements (Edit/Remove
        // links) out explicitly so the exported PDF matches what prints.
        ignoreElements: (el) => el.classList.contains("no-print"),
        // Same reason: the app shell's dark bg-navy lives on <html>/<body>
        // and is only overridden white under @media print (which
        // html2canvas ignores), so it bleeds in behind the captured node
        // unless we clear it on the clone html2canvas actually renders.
        onclone: (clonedDoc) => {
          clonedDoc.documentElement.style.backgroundColor = "#ffffff";
          clonedDoc.body.style.backgroundColor = "#ffffff";
        },
      });
      const imgAspect = canvas.width / canvas.height;
      const pageAspect = PDF_WIDTH_IN / PDF_HEIGHT_IN;
      const renderWidth = imgAspect > pageAspect ? PDF_WIDTH_IN : PDF_HEIGHT_IN * imgAspect;
      const renderHeight = imgAspect > pageAspect ? PDF_WIDTH_IN / imgAspect : PDF_HEIGHT_IN;
      const offsetX = (PDF_WIDTH_IN - renderWidth) / 2;
      const offsetY = (PDF_HEIGHT_IN - renderHeight) / 2;

      const pdf = new jsPDF({
        orientation: "portrait",
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

      const filenameLabel =
        mode === "mine"
          ? "my-schedule"
          : `${selectedTeacher?.full_name || selectedTeacher?.email || "teacher"}-schedule`;
      pdf.save(`${filenameLabel.replace(/\s+/g, "-").toLowerCase()}.pdf`);
    } catch (err) {
      console.error("Save PDF failed:", err);
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
    <div className="mx-auto max-w-5xl rounded-sm border border-line bg-paper p-8">
      <style>{`
        /* Explicit width > height already implies landscape — mixing in
           the "landscape" keyword too is invalid CSS and gets the whole
           rule dropped, silently falling back to portrait Letter. */
        @page { size: ${PDF_WIDTH_IN}in ${PDF_HEIGHT_IN}in; margin: 0.4in; }
      `}</style>

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Instructor&apos;s Schedule
        </h1>
        <div className="flex gap-1 rounded-sm border border-line p-1">
          <button
            onClick={() => setMode("mine")}
            className={`rounded-sm px-3 py-1.5 text-sm transition ${
              mode === "mine"
                ? "bg-gold text-navy font-semibold"
                : "text-muted hover:bg-slate-light"
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
            className={`rounded-sm px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
              mode === "shared"
                ? "bg-gold text-navy font-semibold"
                : "text-muted hover:bg-slate-light"
            }`}
          >
            Shared schedules
          </button>
        </div>
      </div>

      {mode === "mine" && (
        <>
          <div className="no-print mt-4 rounded-[10px] border border-line bg-card p-4">
            <p className="text-sm font-semibold text-ink">
              Share my schedule (view-only)
            </p>
            <p className="mt-1 text-sm text-muted">
              Pick specific teachers who can view your schedule — they can
              never edit or delete your entries.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <FormField label="Add teacher">
                <Select
                  value={addTeacherId}
                  onChange={(e) => setAddTeacherId(e.target.value)}
                  disabled={shareableTeachers.length === 0}
                  className="min-w-[14rem]"
                >
                  <option value="">
                    {shareableTeachers.length === 0
                      ? "No other teacher accounts yet"
                      : "Select a teacher…"}
                  </option>
                  {shareableTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name || t.email}
                    </option>
                  ))}
                </Select>
              </FormField>
              <Button type="button" variant="highlight" onClick={handleAddShare} disabled={!addTeacherId || savingShare}>
                Share
              </Button>
            </div>
            {sharedWithTeachers.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {sharedWithTeachers.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-sm border border-line bg-paper px-3 py-1.5 text-sm text-ink"
                  >
                    {t.full_name || t.email}
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRemoveShare(t.id)}
                      disabled={savingShare}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="no-print mt-4 flex flex-wrap gap-4">
            <FormField label="School year">
              <Input
                type="text"
                value={schoolYear}
                onChange={(e) => setSchoolYear(e.target.value)}
              />
            </FormField>
            <FormField label="Semester">
              <Input
                type="text"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
              />
            </FormField>
          </div>

          <form
            onSubmit={handleSubmit}
            className={`no-print mt-6 flex flex-wrap items-end gap-3 rounded-sm border p-4 ${
              editingId ? "border-gold bg-gold-soft" : "border-line bg-card"
            }`}
          >
            {editingId && (
              <p className="w-full text-sm font-semibold text-gold">
                Editing class — save changes or cancel
              </p>
            )}
            <FormField label="Subject code">
              <Input
                type="text"
                value={subjectCode}
                onChange={(e) => setSubjectCode(e.target.value)}
                placeholder="e.g. CSS 113"
              />
            </FormField>
            <FormField label="Section">
              <Input
                type="text"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="e.g. INFO1A"
                className="!w-28"
              />
            </FormField>
            <FormField label="Room">
              <Input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="e.g. A201(LAB1)"
                className="!w-32"
              />
            </FormField>
            <FormField label="Day">
              <Select value={day} onChange={(e) => setDay(e.target.value as DayOfWeek)}>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Start">
              <Input
                type="time"
                step={1800}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="font-mono"
              />
            </FormField>
            <FormField label="End">
              <Input
                type="time"
                step={1800}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="font-mono"
              />
            </FormField>
            <Button type="submit" disabled={loading}>
              {loading
                ? editingId
                  ? "Saving..."
                  : "Adding..."
                : editingId
                  ? "Save changes"
                  : "Add class"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
          </form>
        </>
      )}

      {mode === "shared" && (
        <div className="no-print mt-4 flex flex-wrap items-end gap-4">
          <FormField label="Teacher">
            <Select
              value={selectedTeacherId}
              onChange={(e) => {
                setSelectedTeacherId(e.target.value);
                setSharedTermRaw(null);
              }}
              className="min-w-[14rem]"
            >
              {sharedTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name || t.email}
                </option>
              ))}
            </Select>
          </FormField>
          {sharedTermOptions.length > 0 && (
            <FormField label="Term">
              <Select value={sharedTerm} onChange={(e) => setSharedTermRaw(e.target.value)}>
                {sharedTermOptions.map((key) => {
                  const [sy, sem] = key.split(TERM_KEY_SEP);
                  return (
                    <option key={key} value={key}>
                      {sy} — {sem}
                    </option>
                  );
                })}
              </Select>
            </FormField>
          )}
          {loadingShared && <p className="text-sm text-muted">Loading…</p>}
          {!loadingShared && sharedTermOptions.length === 0 && (
            <p className="text-sm text-muted">
              This teacher hasn&apos;t added any schedule entries yet.
            </p>
          )}
        </div>
      )}

      <div className="no-print mt-4 flex justify-end gap-3">
        <Button variant="highlight" onClick={handleSavePdf} disabled={exportingPdf}>
          {exportingPdf ? "Saving PDF..." : "Save PDF"}
        </Button>
        <Button variant="highlight" onClick={() => window.print()}>Print</Button>
      </div>

      <div id="schedule-print" ref={printRef} className="mt-6 rounded-[10px] border border-line bg-card p-4">
        <div className="mb-3 flex items-center gap-3 border-b border-line pb-3">
          {logoUrl && (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="School logo" className="h-full w-full object-contain" />
            </div>
          )}
          <div>
            <p className="font-display text-base font-semibold leading-tight text-ink">
              {schoolName || "School name not set"}
            </p>
            <p className="text-xs text-muted">{campusLine || ""}</p>
          </div>
        </div>
        <p className="mb-3 font-display text-lg font-semibold text-ink">
          {mode === "mine"
            ? "Instructor's schedule"
            : `${selectedTeacher?.full_name || selectedTeacher?.email || "Teacher"}'s schedule`}
          {activeSchoolYear && (
            <span className="ml-2 font-mono text-sm font-normal text-muted">
              {activeSchoolYear} · {activeSemester}
            </span>
          )}
        </p>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="w-24">Time</TableHeaderCell>
              {DAYS.map((d) => (
                <TableHeaderCell key={d} align="center">
                  {d}
                </TableHeaderCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {SLOTS.map((slotMinutes, rowIdx) => (
              <TableRow key={slotMinutes}>
                <TableCell tabular className="whitespace-nowrap bg-card text-xs text-muted">
                  {toTimeRangeLabel(slotMinutes)}
                </TableCell>
                {DAYS.map((d) => {
                  const cell = coverageByDay.get(d)?.[rowIdx];
                  if (!cell || cell.kind === "covered") return null;
                  if (cell.kind === "empty") {
                    return <TableCell key={d} className="bg-card" />;
                  }
                  const { entry, span } = cell;
                  return (
                    <td
                      key={d}
                      rowSpan={span}
                      className="relative p-1"
                      style={{
                        backgroundColor: colorForSubject(entry.subject_code),
                        borderLeft: `3px solid ${borderColorForSubject(entry.subject_code)}`,
                      }}
                    >
                      <div
                        className={`flex h-full flex-col items-center justify-center rounded-sm p-2 text-center ${
                          editingId === entry.id
                            ? "ring-2 ring-inset ring-gold"
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
                              className="text-xs text-slate underline underline-offset-2"
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#6E8C7B" }} />
              Subject color-coded by category
            </span>
          </div>
          <span>Generated {new Date().toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}
