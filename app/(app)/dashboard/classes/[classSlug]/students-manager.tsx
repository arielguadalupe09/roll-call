"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateStudentCode } from "@/lib/codes";
import {
  namesFromImportMatrix,
  splitDuplicateNames,
  toLastNameFirst,
} from "@/lib/name-format";
import type { ClassRow, Student } from "@/lib/types";
import { normalizeEmail } from "@/lib/email";
import { matchEmailRows, rowsFromHtml } from "@/lib/email-import";
import { useToast } from "@/app/_components/toast";
import { useConfirm } from "@/app/_components/confirm-provider";
import IconButton from "@/app/_components/icon-button";
import CollapsibleSection from "@/app/_components/collapsible-section";
import Button from "@/app/_components/button";
import { Input, Select } from "@/app/_components/input";

const MAX_ATTEMPTS = 5;

type SortMode = "original" | "az" | "za";
const NEXT_SORT: Record<SortMode, SortMode> = {
  original: "az",
  az: "za",
  za: "original",
};
const SORT_LABEL: Record<SortMode, string> = {
  original: "Sort: Order added",
  az: "Sort: A → Z",
  za: "Sort: Z → A",
};

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="mr-0.5">
      <path d="M8 10.5V2.5M8 2.5 5 5.5M8 2.5l3 3M2.5 10v2.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function StudentsManager({
  classId,
  classSlug,
  initialStudents,
}: {
  classId: string;
  // Only used to build links into /record-card/[classSlug] and
  // /qr/[classSlug] -- classId (the real uuid) is what every data
  // query/mutation uses.
  classSlug: string;
  initialStudents: Student[];
}) {
  const router = useRouter();
  const [students, setStudents] = useState(initialStudents);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("az");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [transferIds, setTransferIds] = useState<string[] | null>(null);
  const [transferClasses, setTransferClasses] = useState<
    Pick<ClassRow, "id" | "name">[]
  >([]);
  const [transferClassesLoading, setTransferClassesLoading] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const displayedStudents = useMemo(() => {
    const list = [...students];
    if (sortMode === "az") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === "za") {
      list.sort((a, b) => b.name.localeCompare(a.name));
    } else {
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    return list;
  }, [students, sortMode]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Row numbers stay the student's position in the sorted list, so a
  // filtered row still reads "17." rather than renumbering from 1.
  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = displayedStudents.map((student, i) => ({ student, n: i + 1 }));
    if (!q) return rows;
    return rows.filter(
      ({ student }) => student.name.toLowerCase().includes(q) || student.code.toLowerCase().includes(q),
    );
  }, [displayedStudents, query]);
  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every(({ student }) => selected.has(student.id));

  // "/" jumps to the search box from anywhere on the page (unless already typing).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const { student } of visibleRows) {
        if (allVisibleSelected) next.delete(student.id);
        else next.add(student.id);
      }
      return next;
    });
  }

  function resetSelected() {
    setSelected(new Set());
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);

    const formattedName = toLastNameFirst(name);
    const { duplicates } = splitDuplicateNames(
      [formattedName],
      students.map((s) => s.name),
    );
    if (duplicates.length > 0) {
      const proceed = await confirm(
        `"${formattedName}" is already in this class. Add another entry anyway?`,
      );
      if (!proceed) {
        setLoading(false);
        return;
      }
    }
    const supabase = createClient();
    let lastError: string | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const code = generateStudentCode();
      const { data, error: insertError } = await supabase
        .from("students")
        .insert({ class_id: classId, name: formattedName, code })
        .select()
        .single();

      if (!insertError && data) {
        setStudents((prev) => [...prev, data as Student]);
        showToast(`"${formattedName}" added`);
        setName("");
        setLoading(false);
        router.refresh();
        return;
      }

      // 23505 = unique_violation - the code collided, try again with a new one.
      if (insertError?.code === "23505") {
        lastError = insertError.message;
        continue;
      }

      lastError = insertError?.message ?? "Could not add student.";
      break;
    }

    setError(lastError);
    setLoading(false);
  }

  async function handleImport(file: File) {
    setImporting(true);
    setError(null);

    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // Read as a raw matrix rather than sheet_to_json's row-1-is-the-header
    // default -- school class-list exports often have a title/letterhead
    // block above the real column headers, and namesFromImportMatrix scans
    // for the actual header row instead of assuming it's row 1.
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
    });

    if (matrix.length === 0) {
      setError("That file has no rows.");
      setImporting(false);
      return;
    }

    const allNames = namesFromImportMatrix(matrix);

    if (allNames.length === 0) {
      setError("No student names found in that file.");
      setImporting(false);
      return;
    }

    // Skip names already in the class (or repeated within the file) so a
    // re-import doesn't create a second copy of every student.
    const { fresh: names, duplicates } = splitDuplicateNames(
      allNames,
      students.map((s) => s.name),
    );

    if (names.length === 0) {
      setError(
        `All ${allNames.length} names in that file are already in this class.`,
      );
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const supabase = createClient();
    let lastError: string | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const payload = names.map((studentName) => ({
        class_id: classId,
        name: studentName,
        code: generateStudentCode(),
      }));

      const { data, error: insertError } = await supabase
        .from("students")
        .insert(payload)
        .select();

      if (!insertError && data) {
        setStudents((prev) => [...prev, ...(data as Student[])]);
        showToast(
          `${data.length} student${data.length === 1 ? "" : "s"} imported` +
            (duplicates.length > 0
              ? `, ${duplicates.length} duplicate${duplicates.length === 1 ? "" : "s"} skipped`
              : ""),
        );
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
        return;
      }

      // 23505 = unique_violation - a generated code collided, retry the batch.
      if (insertError?.code === "23505") {
        lastError = insertError.message;
        continue;
      }

      lastError = insertError?.message ?? "Import failed.";
      break;
    }

    setError(lastError);
    setImporting(false);
  }

  async function handleRemove(studentId: string, studentName: string) {
    const confirmed = await confirm(`Delete "${studentName}"? This can't be undone.`, {
      danger: true,
      confirmLabel: "Delete",
    });
    if (!confirmed) return;

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("students")
      .delete()
      .eq("id", studentId);

    if (!deleteError) {
      setStudents((prev) => prev.filter((s) => s.id !== studentId));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(studentId);
        return next;
      });
      if (editingId === studentId) cancelEdit();
      router.refresh();
    }
  }

  async function resetDevice(studentId: string, studentName: string) {
    const confirmed = await confirm(
      `Reset the check-in device for "${studentName}"? They'll be able to self check-in from a different phone next time.`,
      { confirmLabel: "Reset" },
    );
    if (!confirmed) return;

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("students")
      .update({ device_id: null })
      .eq("id", studentId);

    if (!updateError) {
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, device_id: null } : s)),
      );
      showToast(`Reset check-in device for "${studentName}"`);
    }
  }

  async function handleRemoveSelected() {
    if (selected.size === 0) return;
    const confirmed = await confirm(
      `Delete ${selected.size} student${selected.size === 1 ? "" : "s"}? This can't be undone.`,
      { danger: true, confirmLabel: "Delete" },
    );
    if (!confirmed) return;

    const ids = Array.from(selected);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("students")
      .delete()
      .in("id", ids);

    if (!deleteError) {
      setStudents((prev) => prev.filter((s) => !selected.has(s.id)));
      showToast(`${ids.length} student${ids.length === 1 ? "" : "s"} removed`);
      setSelected(new Set());
      if (editingId && selected.has(editingId)) cancelEdit();
      router.refresh();
    }
  }

  function startEdit(student: Student) {
    setEditingId(student.id);
    setEditName(student.name);
    setEditEmail(student.email ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditEmail("");
  }

  function editKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") cancelEdit();
  }

  // Rendered in the Email column, or under the name on narrow screens.
  const emailField = (
    <Input
      type="email"
      inputMode="email"
      value={editEmail}
      onChange={(e) => setEditEmail(e.target.value)}
      onKeyDown={editKeyDown}
      placeholder="name@example.com"
      aria-label="Email (optional, for grade notices)"
      title="Optional. Gets an email when grades are released."
      autoComplete="off"
      data-1p-ignore
      data-lpignore="true"
      className="w-full !py-1"
    />
  );

  // Bulk "add emails" from an Excel/CSV sheet or a Word document. Rows are
  // matched to students by code or name (lib/email-import.ts); nothing is
  // saved until the teacher confirms the summary.
  const emailFileRef = useRef<HTMLInputElement>(null);
  const [importingEmails, setImportingEmails] = useState(false);

  async function handleEmailImport(file: File) {
    setImportingEmails(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      let rows: unknown[][];
      if (/\.docx$/i.test(file.name)) {
        const mammoth = await import("mammoth");
        const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buffer });
        rows = rowsFromHtml(html, (h) => new DOMParser().parseFromString(h, "text/html"));
      } else if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buffer, { type: "array" });
        rows = workbook.SheetNames.flatMap((name) =>
          XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: "" }),
        );
      } else {
        setError("Use an Excel (.xlsx, .xls, .csv) or Word (.docx) file. For an old .doc file, save it as .docx first.");
        return;
      }

      const { matches, unmatched, invalid } = matchEmailRows(rows, students);
      const changes = matches.filter((m) => students.find((s) => s.id === m.studentId)?.email !== m.email);
      if (matches.length === 0) {
        setError(
          unmatched.length
            ? `Found ${unmatched.length} email${unmatched.length === 1 ? "" : "s"}, but none matched a student in this class by name or code.`
            : "No email addresses found in that file.",
        );
        return;
      }
      if (changes.length === 0) {
        showToast(`All ${matches.length} matched students already have those emails.`);
        return;
      }

      const replacing = changes.filter((m) => students.find((s) => s.id === m.studentId)?.email).length;
      const skipped = [...unmatched, ...invalid];
      const ok = await confirm(
        [
          `Save emails for ${changes.length} student${changes.length === 1 ? "" : "s"}` +
            (replacing ? ` (${replacing} replacing an existing email)` : "") +
            ".",
          skipped.length
            ? `${skipped.length} row${skipped.length === 1 ? "" : "s"} skipped (no matching student, a student listed twice, or a bad address): ` +
              skipped
                .slice(0, 5)
                .map((r) => `"${r.length > 60 ? `${r.slice(0, 57)}...` : r}"`)
                .join(", ") +
              (skipped.length > 5 ? `, and ${skipped.length - 5} more.` : ".")
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        { title: "Import student emails?", confirmLabel: "Save emails" },
      );
      if (!ok) return;

      const supabase = createClient();
      const failed: string[] = [];
      for (let i = 0; i < changes.length; i += 10) {
        await Promise.all(
          changes.slice(i, i + 10).map(async (m) => {
            const { error: updateError } = await supabase
              .from("students")
              .update({ email: m.email })
              .eq("id", m.studentId);
            if (updateError) failed.push(m.studentName);
          }),
        );
      }
      const savedIds = new Map(changes.filter((m) => !failed.includes(m.studentName)).map((m) => [m.studentId, m.email]));
      setStudents((prev) => prev.map((s) => (savedIds.has(s.id) ? { ...s, email: savedIds.get(s.id) } : s)));
      if (failed.length) setError(`Couldn't save emails for: ${failed.join("; ")}`);
      showToast(`Saved ${savedIds.size} email${savedIds.size === 1 ? "" : "s"}.`);
      router.refresh();
    } catch {
      setError("Couldn't read that file. Make sure it's a valid Excel or Word file.");
    } finally {
      setImportingEmails(false);
      if (emailFileRef.current) emailFileRef.current.value = "";
    }
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    // Optional; used for "your grade is posted" emails (lib/notify.ts).
    const email = normalizeEmail(editEmail);
    if (email === undefined) {
      showToast("That email address doesn't look right.");
      return;
    }
    setEditSaving(true);

    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("students")
      .update({ name: toLastNameFirst(editName), email })
      .eq("id", editingId)
      .select()
      .single();

    setEditSaving(false);

    if (updateError) {
      showToast(updateError.message);
      return;
    }

    setStudents((prev) =>
      prev.map((s) => (s.id === editingId ? (data as Student) : s)),
    );
    showToast("Student updated");
    cancelEdit();
    router.refresh();
  }

  async function openTransfer(ids: string[]) {
    if (ids.length === 0) return;
    setTransferIds(ids);
    setTransferTarget("");
    setTransferError(null);
    setTransferClassesLoading(true);

    const supabase = createClient();
    const { data, error: classesError } = await supabase
      .from("classes")
      .select("id, name")
      .eq("archived", false)
      .neq("id", classId)
      .order("name", { ascending: true });

    if (classesError) {
      setTransferError(classesError.message);
    } else {
      setTransferClasses((data as Pick<ClassRow, "id" | "name">[] | null) ?? []);
    }
    setTransferClassesLoading(false);
  }

  function closeTransfer() {
    setTransferIds(null);
    setTransferTarget("");
    setTransferError(null);
  }

  async function confirmTransfer() {
    if (!transferIds || !transferTarget) return;
    setTransferSaving(true);
    setTransferError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("students")
      .update({ class_id: transferTarget })
      .in("id", transferIds);

    setTransferSaving(false);

    if (updateError) {
      setTransferError(updateError.message);
      return;
    }

    const targetName =
      transferClasses.find((c) => c.id === transferTarget)?.name ?? "the class";
    const count = transferIds.length;
    setStudents((prev) => prev.filter((s) => !transferIds.includes(s.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of transferIds) next.delete(id);
      return next;
    });
    if (editingId && transferIds.includes(editingId)) cancelEdit();
    showToast(`${count} student${count === 1 ? "" : "s"} transferred to "${targetName}"`);
    closeTransfer();
    router.refresh();
  }

  return (
    <div className="mt-6">
      <form onSubmit={handleAdd} className="flex flex-wrap gap-3">
        <Input
          type="text"
          placeholder="Lastname, Firstname M.I."
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={loading} className="whitespace-nowrap">
          {loading ? "Adding..." : "Add student"}
        </Button>
      </form>

      {/* Native file pickers stay hidden; solid buttons open them, matching
          "Add student". Gold stays reserved for the print/export links. */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImport(file);
        }}
      />
      <input
        ref={emailFileRef}
        type="file"
        accept=".xlsx,.xls,.csv,.docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleEmailImport(file);
        }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex w-full gap-3 sm:w-auto">
          <Button
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 whitespace-nowrap sm:flex-none"
          >
            <UploadIcon />
            {importing ? "Importing..." : "Import students"}
          </Button>
          <Button
            disabled={importingEmails || students.length === 0}
            onClick={() => emailFileRef.current?.click()}
            className="flex-1 whitespace-nowrap sm:flex-none"
          >
            <UploadIcon />
            {importingEmails ? "Reading emails..." : "Import emails"}
          </Button>
        </div>
        <div className="flex w-full gap-3 sm:ml-auto sm:w-auto">
          <Button href={`/record-card/${classSlug}`} variant="highlight" className="flex-1 text-center sm:flex-none">
            Record Cards (all students)
          </Button>
          <Button href={`/qr/${classSlug}`} variant="highlight" className="flex-1 text-center sm:flex-none">
            Print QR codes
          </Button>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted">
        Import students from Excel (.xlsx, .xls, .csv). Import emails from Excel or Word (.docx) with each
        student&apos;s name or code and email.
      </p>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-6">
        <CollapsibleSection
          title="Students"
          subtitle={
            query.trim()
              ? `${visibleRows.length} of ${displayedStudents.length} students`
              : `${displayedStudents.length} students`
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Input
                ref={searchRef}
                type="search"
                placeholder="Search name or code"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setQuery("");
                    e.currentTarget.blur();
                  }
                }}
                aria-label="Search students by name or code"
                className="w-full !py-1.5 pr-8 text-sm"
              />
              {!query && (
                <kbd className="pointer-events-none absolute right-2 hidden sm:block top-1/2 -translate-y-1/2 rounded border border-line px-1.5 font-mono text-[10px] text-muted">
                  /
                </kbd>
              )}
            </div>
            <button
              onClick={() => setSortMode((prev) => NEXT_SORT[prev])}
              className="rounded-sm border border-line px-3 py-1.5 text-sm text-ink transition hover:bg-slate-light"
            >
              {SORT_LABEL[sortMode]}
            </button>

            {selected.size > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-3 rounded-sm border border-gold bg-gold/10 px-3 py-1.5">
                <span className="text-sm font-medium text-ink">
                  {selected.size} selected
                </span>
                <Button href={`/qr/${classSlug}?ids=${Array.from(selected).join(",")}`} variant="highlight" size="sm">
                  Print QR for selected
                </Button>
                <Button variant="secondary" size="sm" onClick={() => openTransfer(Array.from(selected))}>
                  Transfer selected
                </Button>
                <Button variant="danger" size="sm" onClick={handleRemoveSelected}>
                  Remove selected
                </Button>
                <Button variant="secondary" size="sm" onClick={resetSelected}>
                  Reset selected
                </Button>
              </div>
            )}
          </div>

          <div className="mt-3 max-h-[min(70vh,48rem)] overflow-auto rounded-md border border-line">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-[1]">
              <tr className="bg-navy text-card font-display text-[13px] font-medium">
                <th className="w-10 py-2 pl-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all students"
                  />
                </th>
                <th className="hidden w-10 py-2 sm:table-cell">#</th>
                <th className="py-2">Name</th>
                <th className="hidden w-[30%] py-2 md:table-cell">Email</th>
                <th className="hidden w-40 py-2 sm:table-cell">Code</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ student: s, n }) => {
                const isEditing = editingId === s.id;
                return (
                  <tr key={s.id} className="border-b border-line last:border-b-0 hover:bg-slate-light/40">
                    <td className="py-1.5 pl-3">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleSelected(s.id)}
                        aria-label={`Select ${s.name}`}
                      />
                    </td>
                    <td className="hidden py-1.5 font-mono text-xs text-muted sm:table-cell">{n}.</td>
                    <td className="py-1.5 pr-2 text-ink">
                      {isEditing && (
                        <Input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={editKeyDown}
                          aria-label="Name"
                          autoComplete="off"
                          autoFocus
                          className="w-full !border-gold !py-1"
                        />
                      )}
                      {/* Below md the Email column is hidden, so its field sits under the name. */}
                      {isEditing && <div className="mt-1.5 md:hidden">{emailField}</div>}
                      {!isEditing && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-semibold">
                            {s.name}
                          </span>
                          {s.device_id && (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 16 16"
                              fill="none"
                              aria-hidden="true"
                              className="shrink-0 text-ink/40"
                            >
                              <title>Checked in from a locked device</title>
                              <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
                              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                            </svg>
                          )}
                        </span>
                      )}
                      {!isEditing && s.email && (
                        <span className="block truncate text-xs text-muted md:hidden">{s.email}</span>
                      )}
                      {!isEditing && (
                        <span className="mt-0.5 block font-mono text-xs text-slate sm:hidden">
                          <span className="text-muted">{n}.</span> {s.code}
                        </span>
                      )}
                    </td>
                    <td className="hidden max-w-0 py-1.5 pr-2 md:table-cell">
                      {isEditing ? (
                        emailField
                      ) : s.email ? (
                        <span className="block truncate text-sm text-slate" title={s.email}>
                          {s.email}
                        </span>
                      ) : (
                        <span className="text-sm text-ink/25">—</span>
                      )}
                    </td>
                    <td className="hidden py-1.5 font-mono text-slate sm:table-cell">{s.code}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={saveEdit} disabled={editSaving}>
                            {editSaving ? "Saving..." : "Save"}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="ml-auto grid w-fit grid-cols-3 gap-1.5 sm:flex sm:justify-end sm:gap-2">
                          <IconButton
                            icon="record"
                            color="gold"
                            label="Record Card"
                            href={`/record-card/${classSlug}/${s.id}`}
                          />
                          <IconButton
                            icon="edit"
                            color="success"
                            label="Edit"
                            onClick={() => startEdit(s)}
                          />
                          <IconButton
                            icon="transfer"
                            color="ink"
                            label="Transfer to another class"
                            onClick={() => openTransfer([s.id])}
                          />
                          {s.device_id && (
                            <IconButton
                              icon="reset"
                              color="success"
                              label="Reset check-in device"
                              onClick={() => resetDevice(s.id, s.name)}
                            />
                          )}
                          <IconButton
                            icon="delete"
                            color="danger"
                            label="Remove"
                            onClick={() => handleRemove(s.id, s.name)}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-ink/60">
                    {displayedStudents.length === 0 ? "No students yet." : `No students match "${query.trim()}".`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </CollapsibleSection>
      </div>

      {transferIds && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-[10px] border border-line bg-card p-5 shadow-lg">
            <p className="font-display text-lg font-semibold text-ink">
              Transfer {transferIds.length} student{transferIds.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-sm text-ink/70">
              Choose the class or section to move {transferIds.length === 1 ? "this student" : "these students"} to.
            </p>

            {transferClassesLoading ? (
              <p className="mt-4 text-sm text-ink/60">Loading classes...</p>
            ) : transferClasses.length === 0 ? (
              <p className="mt-4 text-sm text-ink/60">
                No other classes to transfer into. Create another class first.
              </p>
            ) : (
              <Select
                value={transferTarget}
                onChange={(e) => setTransferTarget(e.target.value)}
                autoFocus
                className="mt-4 w-full"
              >
                <option value="" disabled>
                  Select a class or section...
                </option>
                {transferClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}

            {transferError && (
              <p className="mt-2 text-sm text-danger">{transferError}</p>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <Button variant="secondary" onClick={closeTransfer}>
                Cancel
              </Button>
              <Button onClick={confirmTransfer} disabled={!transferTarget || transferSaving}>
                {transferSaving ? "Transferring..." : "Transfer"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
