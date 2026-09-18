"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Assignment, ClassRow, Period, Student } from "@/lib/types";
import { useToast } from "@/app/_components/toast";
import { useConfirm } from "@/app/_components/confirm-provider";
import { useActiveClasses } from "@/app/_components/active-classes-context";
import Button from "@/app/_components/button";
import { Input, Select, Textarea } from "@/app/_components/input";
import { FormField } from "@/app/_components/form-field";

function submissionBadge(counts: { submitted: number; total: number } | undefined) {
  if (!counts || counts.total === 0) return null;
  const { submitted, total } = counts;
  const color =
    submitted === total ? "bg-success/20 text-success-text" : submitted === 0 ? "bg-ink/10 text-ink/60" : "bg-gold/20 text-gold";
  return (
    <span className={`rounded-sm px-2 py-0.5 font-mono text-xs font-semibold ${color}`}>
      {submitted}/{total} submitted
    </span>
  );
}

export default function AssignmentsClient({
  classId,
  classSlug,
  teacherId,
  teacherClasses,
  allStudents,
  initialAssignments,
  usePrelims = false,
  showHeading = true,
  submissionCounts = {},
}: {
  classId: string;
  // Only used to build links into /assignments/[classSlug]/[assignmentId] --
  // classId above (the real uuid) is what every data query/mutation uses.
  classSlug: string;
  teacherId: string;
  teacherClasses: ClassRow[];
  allStudents: Student[];
  initialAssignments: Assignment[];
  usePrelims?: boolean;
  // The Gradebook hub's "Assignments" tab already sits under its own
  // page-level "— grading" heading, so it opts out of this one to avoid
  // stacking two headings — only the standalone /assignments/[classSlug]
  // page (which has no heading of its own) needs it.
  showHeading?: boolean;
  submissionCounts?: Record<string, { submitted: number; total: number }>;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { setExtraActiveClassIds } = useActiveClasses();
  const [assignments, setAssignments] = useState(initialAssignments);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [period, setPeriod] = useState<Period>("midterm");
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set([classId]));
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Mirror the "Assign to classes" checkboxes onto the sidebar so it's
  // obvious which sections this assignment will apply to — cleared on
  // unmount so it doesn't linger once you navigate away from this form.
  useEffect(() => {
    setExtraActiveClassIds(selectedClassIds);
    return () => setExtraActiveClassIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassIds]);

  function toggleClass(id: string) {
    setSelectedClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setSelectedStudentIds((students) => {
          const pruned = new Set(students);
          for (const s of allStudents) {
            if (s.class_id === id) pruned.delete(s.id);
          }
          return pruned;
        });
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleStudent(id: string) {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedClassNames = teacherClasses
    .filter((c) => selectedClassIds.has(c.id))
    .map((c) => c.name);
  const headingLabel =
    selectedClassNames.length > 0
      ? selectedClassNames.join(", ")
      : teacherClasses.find((c) => c.id === classId)?.name ?? "Assignments";

  const visibleStudents = allStudents.filter((s) => selectedClassIds.has(s.class_id));
  const studentsByClass = new Map<string, Student[]>();
  for (const s of visibleStudents) {
    const list = studentsByClass.get(s.class_id) ?? [];
    list.push(s);
    studentsByClass.set(s.class_id, list);
  }

  function toggleSelectAllVisible() {
    setSelectedStudentIds((prev) => {
      if (prev.size === visibleStudents.length && visibleStudents.length > 0) return new Set();
      return new Set(visibleStudents.map((s) => s.id));
    });
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || selectedClassIds.size === 0 || selectedStudentIds.size === 0) {
      setError("Pick at least one class and one student.");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("create_assignment_with_links", {
      p_teacher_id: teacherId,
      p_title: title.trim(),
      p_description: description.trim() || null,
      p_due_date: dueDate || null,
      p_max_score: Number(maxScore) || 100,
      p_period: period,
      p_class_ids: Array.from(selectedClassIds),
      p_student_ids: Array.from(selectedStudentIds),
    });

    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    if (selectedClassIds.has(classId)) {
      setAssignments((prev) => [data as Assignment, ...prev]);
    }
    setTitle("");
    setDescription("");
    setDueDate("");
    setMaxScore("100");
    setPeriod("midterm");
    setSelectedClassIds(new Set([classId]));
    setSelectedStudentIds(new Set());
    router.refresh();
  }

  async function handleDelete(id: string) {
    const confirmed = await confirm(
      "Remove this assignment from this class? If it's not assigned to any other class, it'll be deleted entirely.",
      { confirmLabel: "Remove", danger: true },
    );
    if (!confirmed) return;

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("unlink_assignment_class", {
      p_assignment_id: id,
      p_class_id: classId,
    });

    if (rpcError) {
      showToast(rpcError.message);
      return;
    }
    setAssignments((prev) => prev.filter((a) => a.id !== id));
    router.refresh();
  }

  async function handlePeriodChange(id: string, nextPeriod: Period) {
    setAssignments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, period: nextPeriod } : a)),
    );
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("assignments")
      .update({ period: nextPeriod })
      .eq("id", id);

    if (updateError) showToast(updateError.message);
    router.refresh();
  }

  return (
    <div>
      {showHeading && (
        <h1 className="font-display text-3xl font-semibold text-ink">
          {headingLabel} — assignments
        </h1>
      )}

      <div className="mt-6">
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-3 rounded-[10px] border border-line bg-card p-4"
        >
          <Input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
          <div className="flex gap-3">
            <FormField label="Due date" className="flex-1">
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="font-mono"
              />
            </FormField>
            <FormField label="Max score" className="w-32">
              <Input
                type="number"
                min={1}
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                className="font-mono"
              />
            </FormField>
            <FormField label="Period" className="w-36">
              <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
                {usePrelims && <option value="prelim">Prelim</option>}
                <option value="midterm">Midterm</option>
                <option value="finals">Finals</option>
              </Select>
            </FormField>
          </div>

          <div>
            <p className="text-sm font-medium text-ink">Assign to classes</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {teacherClasses.map((c) => (
                <label
                  key={c.id}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-sm border px-2.5 py-1 text-sm transition ${
                    selectedClassIds.has(c.id)
                      ? "border-gold bg-gold/10 text-ink"
                      : "border-line text-ink/70 hover:border-gold"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedClassIds.has(c.id)}
                    onChange={() => toggleClass(c.id)}
                    className="accent-gold"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>

          {visibleStudents.length > 0 && (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">Assign to students</p>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate">
                  <input
                    type="checkbox"
                    checked={selectedStudentIds.size === visibleStudents.length}
                    onChange={toggleSelectAllVisible}
                    className="accent-gold"
                  />
                  Select all
                </label>
              </div>
              <div className="mt-1 max-h-64 overflow-y-auto rounded-sm border border-line p-3">
                {teacherClasses
                  .filter((c) => studentsByClass.has(c.id))
                  .map((c) => (
                    <div key={c.id} className="mb-3 last:mb-0">
                      <p className="text-xs text-muted">{c.name}</p>
                      <div className="mt-1 flex flex-col gap-1">
                        {studentsByClass.get(c.id)!.map((s) => (
                          <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              checked={selectedStudentIds.has(s.id)}
                              onChange={() => toggleStudent(s.id)}
                              className="accent-gold"
                            />
                            {s.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add assignment"}
            </Button>
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        </form>

        <ul className="mt-6 flex flex-col gap-3">
          {assignments.map((a) => (
            <li key={a.id} className="rounded-[10px] border border-line bg-card p-4 transition hover:border-gold/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/assignments/${classSlug}/${a.id}`}
                      className="font-display text-lg font-semibold text-ink underline decoration-ink/20 underline-offset-2 hover:text-slate hover:decoration-slate"
                    >
                      {a.title}
                    </Link>
                    {submissionBadge(submissionCounts[a.id])}
                  </div>
                  {a.description && (
                    <p className="mt-1 text-ink/80">{a.description}</p>
                  )}
                  <p className="mt-2 font-mono text-xs text-ink/50">
                    {a.due_date ? `Due ${a.due_date}` : "No due date"} · Max
                    score {a.max_score}
                  </p>
                  <Button
                    href={`/assignments/${classSlug}/${a.id}`}
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                  >
                    View submissions →
                  </Button>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Select
                    value={a.period}
                    onChange={(e) =>
                      handlePeriodChange(a.id, e.target.value as Period)
                    }
                    className="!w-auto !py-1 text-xs"
                  >
                    {usePrelims && <option value="prelim">Prelim</option>}
                    <option value="midterm">Midterm</option>
                    <option value="finals">Finals</option>
                  </Select>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(a.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
          {assignments.length === 0 && (
            <p className="text-ink/60">No assignments yet.</p>
          )}
        </ul>
      </div>
    </div>
  );
}
