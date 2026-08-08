"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Assignment, Period } from "@/lib/types";
import { useToast } from "@/app/_components/toast";

export default function AssignmentsClient({
  classId,
  initialAssignments,
}: {
  classId: string;
  initialAssignments: Assignment[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [assignments, setAssignments] = useState(initialAssignments);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [period, setPeriod] = useState<Period>("midterm");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("assignments")
      .insert({
        class_id: classId,
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate || null,
        max_score: Number(maxScore) || 100,
        period,
      })
      .select()
      .single();

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setAssignments((prev) => [data as Assignment, ...prev]);
    setTitle("");
    setDescription("");
    setDueDate("");
    setMaxScore("100");
    setPeriod("midterm");
    router.refresh();
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("assignments")
      .delete()
      .eq("id", id);

    if (!deleteError) {
      setAssignments((prev) => prev.filter((a) => a.id !== id));
      router.refresh();
    }
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
    <div className="mt-6">
      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-3 rounded-sm border border-rule bg-white p-4"
      >
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
        />
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
        />
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-ink">Due date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-sm border border-rule bg-white/60 px-3 py-2 font-mono text-ink outline-none focus:border-brass"
            />
          </label>
          <label className="flex w-32 flex-col gap-1">
            <span className="text-sm font-medium text-ink">Max score</span>
            <input
              type="number"
              min={1}
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
              className="rounded-sm border border-rule bg-white/60 px-3 py-2 font-mono text-ink outline-none focus:border-brass"
            />
          </label>
          <label className="flex w-36 flex-col gap-1">
            <span className="text-sm font-medium text-ink">Period</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
            >
              <option value="midterm">Midterm</option>
              <option value="finals">Finals</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Adding..." : "Add assignment"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </form>

      <ul className="mt-6 flex flex-col gap-3">
        {assignments.map((a) => (
          <li key={a.id} className="rounded-sm border border-rule bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Link
                  href={`/assignments/${classId}/${a.id}`}
                  className="font-display text-lg font-semibold text-ink hover:text-teal"
                >
                  {a.title}
                </Link>
                {a.description && (
                  <p className="mt-1 text-ink/80">{a.description}</p>
                )}
                <p className="mt-2 font-mono text-xs text-ink/50">
                  {a.due_date ? `Due ${a.due_date}` : "No due date"} · Max
                  score {a.max_score}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <select
                  value={a.period}
                  onChange={(e) =>
                    handlePeriodChange(a.id, e.target.value as Period)
                  }
                  className="rounded-sm border border-rule bg-white/60 px-2 py-1 font-mono text-xs uppercase text-ink outline-none focus:border-brass"
                >
                  <option value="midterm">Midterm</option>
                  <option value="finals">Finals</option>
                </select>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="text-sm text-danger underline underline-offset-2"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
        {assignments.length === 0 && (
          <p className="text-ink/60">No assignments yet.</p>
        )}
      </ul>
    </div>
  );
}
