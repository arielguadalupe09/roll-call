"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MajorExam, MajorExamScore, Period, Student } from "@/lib/types";

type ScoreRow = { score: string; saving: boolean };

function ExamSection({
  classId,
  period,
  label,
  initialExam,
  students,
  initialScores,
}: {
  classId: string;
  period: Period;
  label: string;
  initialExam: MajorExam | null;
  students: Student[];
  initialScores: MajorExamScore[];
}) {
  const [exam, setExam] = useState(initialExam);
  const [maxScore, setMaxScore] = useState(String(initialExam?.max_score ?? 100));
  const [savingMax, setSavingMax] = useState(false);
  const [rows, setRows] = useState<Record<string, ScoreRow>>(() => {
    const byStudent: Record<string, ScoreRow> = {};
    for (const s of students) byStudent[s.id] = { score: "", saving: false };
    for (const score of initialScores) {
      byStudent[score.student_id] = {
        score: score.score != null ? String(score.score) : "",
        saving: false,
      };
    }
    return byStudent;
  });

  function updateRow(studentId: string, patch: Partial<ScoreRow>) {
    setRows((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  }

  async function handleSaveMaxScore() {
    setSavingMax(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("major_exams")
      .upsert(
        { class_id: classId, period, max_score: Number(maxScore) || 100 },
        { onConflict: "class_id,period" },
      )
      .select()
      .single();

    setSavingMax(false);
    if (error) {
      window.alert(error.message);
      return;
    }
    setExam(data as MajorExam);
  }

  async function handleSaveScore(studentId: string) {
    if (!exam) return;
    updateRow(studentId, { saving: true });
    const row = rows[studentId];
    const supabase = createClient();

    const { error } = await supabase.from("major_exam_scores").upsert(
      {
        major_exam_id: exam.id,
        student_id: studentId,
        score: row.score.trim() === "" ? null : Number(row.score),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "major_exam_id,student_id" },
    );

    updateRow(studentId, { saving: false });
    if (error) window.alert(error.message);
  }

  return (
    <div className="rounded-sm border border-rule bg-white p-4">
      <p className="font-display text-lg font-semibold text-ink">{label}</p>
      <div className="mt-3 flex items-end gap-3">
        <label className="flex w-32 flex-col gap-1">
          <span className="text-sm text-ink">Max score</span>
          <input
            type="number"
            min={1}
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            className="rounded-sm border border-rule bg-white/60 px-3 py-2 font-mono text-ink outline-none focus:border-brass"
          />
        </label>
        <button
          onClick={handleSaveMaxScore}
          disabled={savingMax}
          className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
        >
          {savingMax ? "Saving..." : "Save max score"}
        </button>
      </div>

      {exam ? (
        <div className="mt-4 overflow-x-auto rounded-sm border border-rule">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-rule bg-paper font-mono text-xs uppercase tracking-wide text-ink/60">
                <th className="py-2 px-3">Student</th>
                <th className="py-2 px-3">Score / {exam.max_score}</th>
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
                        max={exam.max_score}
                        value={row.score}
                        onChange={(e) => updateRow(s.id, { score: e.target.value })}
                        className="w-20 rounded-sm border border-rule bg-white/60 px-2 py-1 font-mono text-sm text-ink"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => handleSaveScore(s.id)}
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
      ) : (
        <p className="mt-4 text-sm text-ink/60">
          Set a max score to start entering scores for the {label.toLowerCase()}.
        </p>
      )}
    </div>
  );
}

export default function MajorExamTab({
  classId,
  students,
  initialExams,
  initialScores,
}: {
  classId: string;
  students: Student[];
  initialExams: MajorExam[];
  initialScores: MajorExamScore[];
}) {
  const midtermExam = initialExams.find((e) => e.period === "midterm") ?? null;
  const finalsExam = initialExams.find((e) => e.period === "finals") ?? null;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <ExamSection
        classId={classId}
        period="midterm"
        label="Midterm Exam"
        initialExam={midtermExam}
        students={students}
        initialScores={
          midtermExam
            ? initialScores.filter((s) => s.major_exam_id === midtermExam.id)
            : []
        }
      />
      <ExamSection
        classId={classId}
        period="finals"
        label="Final Exam"
        initialExam={finalsExam}
        students={students}
        initialScores={
          finalsExam
            ? initialScores.filter((s) => s.major_exam_id === finalsExam.id)
            : []
        }
      />
    </div>
  );
}
