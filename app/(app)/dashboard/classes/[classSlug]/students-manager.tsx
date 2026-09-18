"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateStudentCode } from "@/lib/codes";
import { namesFromImportMatrix, toLastNameFirst } from "@/lib/name-format";
import type { ClassRow, Student } from "@/lib/types";
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

  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === displayedStudents.length
        ? new Set()
        : new Set(displayedStudents.map((s) => s.id)),
    );
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

    const names = namesFromImportMatrix(matrix);

    if (names.length === 0) {
      setError("No student names found in that file.");
      setImporting(false);
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
          `${data.length} student${data.length === 1 ? "" : "s"} imported`,
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
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    setEditSaving(true);

    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("students")
      .update({ name: toLastNameFirst(editName) })
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

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImport(file);
          }}
          disabled={importing}
          className="text-sm text-ink/70 file:mr-3 file:rounded-sm file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:bg-ink/5"
        />
        {importing && (
          <span className="text-sm text-ink/60">Importing...</span>
        )}
        <Button href={`/record-card/${classSlug}`} variant="highlight" className="ml-auto">
          Record Cards (all students)
        </Button>
        <Button href={`/qr/${classSlug}`} variant="highlight">
          Print QR codes
        </Button>
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-6">
        <CollapsibleSection title="Students" subtitle={`${displayedStudents.length} students`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => setSortMode((prev) => NEXT_SORT[prev])}
              className="rounded-sm border border-line px-3 py-1.5 text-sm text-ink transition hover:bg-slate-light"
            >
              {SORT_LABEL[sortMode]}
            </button>

            {selected.size > 0 && (
              <div className="flex items-center gap-3 rounded-sm border border-gold bg-gold/10 px-3 py-1.5">
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

          <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-navy text-card font-display text-[13px] font-medium">
                <th className="w-8 py-2">
                  <input
                    type="checkbox"
                    checked={
                      displayedStudents.length > 0 &&
                      selected.size === displayedStudents.length
                    }
                    onChange={toggleSelectAll}
                    aria-label="Select all students"
                  />
                </th>
                <th className="w-10 py-2">#</th>
                <th className="py-2">Name</th>
                <th className="py-2">Code</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {displayedStudents.map((s, i) => {
                const isEditing = editingId === s.id;
                return (
                  <tr key={s.id} className="border-b border-line">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleSelected(s.id)}
                        aria-label={`Select ${s.name}`}
                      />
                    </td>
                    <td className="py-2 font-mono text-xs text-muted">{i + 1}.</td>
                    <td className="py-2 text-ink">
                      {isEditing ? (
                        <Input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                          className="w-full !border-gold !py-1"
                        />
                      ) : (
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
                    </td>
                    <td className="py-2 font-mono text-slate">{s.code}</td>
                    <td className="py-2 text-right">
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
                        <div className="flex justify-end gap-2">
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
              {displayedStudents.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-ink/60">
                    No students yet.
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
