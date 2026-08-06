"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  Assessment,
  AssessmentCategory,
  AssessmentScore,
  Period,
  Student,
} from "@/lib/types";

type ScoreRow = { score: string; saving: boolean };

export default function AssessmentRoster({
  classId,
  category,
  categoryLabel,
  students,
  initialAssessments,
  initialScores,
}: {
  classId: string;
  category: AssessmentCategory;
  categoryLabel: string;
  students: Student[];
  initialAssessments: Assessment[];
  initialScores: AssessmentScore[];
}) {
  const router = useRouter();
  const [assessments, setAssessments] = useState(initialAssessments);
  const [scoresByAssessment, setScoresByAssessment] = useState<
    Record<string, Record<string, ScoreRow>>
  >(() => {
    const byAssessment: Record<string, Record<string, ScoreRow>> = {};
    for (const a of initialAssessments) {
      const byStudent: Record<string, ScoreRow> = {};
      for (const s of students) byStudent[s.id] = { score: "", saving: false };
      byAssessment[a.id] = byStudent;
    }
    for (const score of initialScores) {
      const bucket = byAssessment[score.assessment_id];
      if (bucket) {
        bucket[score.student_id] = {
          score: score.score != null ? String(score.score) : "",
          saving: false,
        };
      }
    }
    return byAssessment;
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
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
      .from("assessments")
      .insert({
        class_id: classId,
        category,
        title: title.trim(),
        date: date || null,
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

    const created = data as Assessment;
    setAssessments((prev) => [created, ...prev]);
    setScoresByAssessment((prev) => ({
      ...prev,
      [created.id]: Object.fromEntries(
        students.map((s) => [s.id, { score: "", saving: false }]),
      ),
    }));
    setTitle("");
    setDate("");
    setMaxScore("100");
    setPeriod("midterm");
    router.refresh();
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("assessments")
      .delete()
      .eq("id", id);

    if (!deleteError) {
      setAssessments((prev) => prev.filter((a) => a.id !== id));
      if (expandedId === id) setExpandedId(null);
      router.refresh();
    }
  }

  function updateScore(assessmentId: string, studentId: string, patch: Partial<ScoreRow>) {
    setScoresByAssessment((prev) => ({
      ...prev,
      [assessmentId]: {
        ...prev[assessmentId],
        [studentId]: { ...prev[assessmentId][studentId], ...patch },
      },
    }));
  }

  async function handleSaveScore(assessmentId: string, studentId: string) {
    updateScore(assessmentId, studentId, { saving: true });
    const row = scoresByAssessment[assessmentId][studentId];
    const supabase = createClient();

    const { error: upsertError } = await supabase
      .from("assessment_scores")
      .upsert(
        {
          assessment_id: assessmentId,
          student_id: studentId,
          score: row.score.trim() === "" ? null : Number(row.score),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "assessment_id,student_id" },
      );

    updateScore(assessmentId, studentId, { saving: false });
    if (upsertError) window.alert(upsertError.message);
  }

  return (
    <div className="mt-6">
      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-3 rounded-sm border border-rule bg-white p-4"
      >
        <input
          type="text"
          placeholder={`${categoryLabel} title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
        />
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-ink">Date (optional)</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
            {loading ? "Adding..." : `Add ${categoryLabel.toLowerCase()}`}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </form>

      <ul className="mt-6 flex flex-col gap-3">
        {assessments.map((a) => {
          const isOpen = expandedId === a.id;
          const rows = scoresByAssessment[a.id] ?? {};
          return (
            <li key={a.id} className="rounded-sm border border-rule bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-display text-lg font-semibold text-ink">
                    {a.title}
                  </p>
                  <p className="mt-1 font-mono text-xs uppercase tracking-wide text-ink/50">
                    {a.date ? `${a.date} · ` : ""}Max score {a.max_score} ·{" "}
                    {a.period}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    onClick={() => setExpandedId(isOpen ? null : a.id)}
                    className="text-sm text-teal underline underline-offset-2"
                  >
                    {isOpen ? "Hide scores" : "Enter scores"}
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="text-sm text-danger underline underline-offset-2"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="mt-4 overflow-x-auto rounded-sm border border-rule">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-rule bg-paper font-mono text-xs uppercase tracking-wide text-ink/60">
                        <th className="py-2 px-3">Student</th>
                        <th className="py-2 px-3">Score / {a.max_score}</th>
                        <th className="py-2 px-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => {
                        const row = rows[s.id] ?? { score: "", saving: false };
                        return (
                          <tr key={s.id} className="border-b border-rule/50 bg-white">
                            <td className="py-2 px-3 text-ink">{s.name}</td>
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                min={0}
                                max={a.max_score}
                                value={row.score}
                                onChange={(e) =>
                                  updateScore(a.id, s.id, { score: e.target.value })
                                }
                                className="w-20 rounded-sm border border-rule bg-white/60 px-2 py-1 font-mono text-sm text-ink"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <button
                                onClick={() => handleSaveScore(a.id, s.id)}
                                disabled={row.saving}
                                className="rounded-sm bg-brass px-3 py-1 text-sm font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
                              >
                                {row.saving ? "Saving..." : "Save"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {students.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-4 px-3 text-ink/60">
                            No students in this class yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          );
        })}
        {assessments.length === 0 && (
          <p className="text-ink/60">No {categoryLabel.toLowerCase()} yet.</p>
        )}
      </ul>
    </div>
  );
}
