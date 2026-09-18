"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MajorExam, MajorExamScore, Period, Student } from "@/lib/types";
import ScoreEntryTable, { type ScoreRow } from "./score-entry-table";
import CollapsibleSection from "@/app/_components/collapsible-section";
import { useToast } from "@/app/_components/toast";
import Button from "@/app/_components/button";
import { Card } from "@/app/_components/card";
import { Input } from "@/app/_components/input";

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
  const { showToast } = useToast();
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
      showToast(error.message);
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
    if (error) showToast(error.message);
  }

  return (
    <Card>
      <p className="font-display text-lg font-semibold text-ink">{label}</p>
      <div className="mt-3 flex items-end gap-3">
        <label className="flex w-32 flex-col gap-1">
          <span className="text-xs font-semibold text-ink">Max score</span>
          <Input
            type="number"
            min={1}
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            className="font-mono"
          />
        </label>
        <Button onClick={handleSaveMaxScore} disabled={savingMax}>
          {savingMax ? "Saving..." : "Save max score"}
        </Button>
      </div>

      {exam ? (
        <div className="mt-4">
          <CollapsibleSection title="Scores" subtitle={`${students.length} students`}>
            <ScoreEntryTable
              students={students}
              rows={rows}
              maxScore={exam.max_score}
              onScoreChange={(studentId, value) => updateRow(studentId, { score: value })}
              onSave={handleSaveScore}
            />
          </CollapsibleSection>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">
          Set a max score to start entering scores for the {label.toLowerCase()}.
        </p>
      )}
    </Card>
  );
}

export default function MajorExamTab({
  classId,
  students,
  initialExams,
  initialScores,
  usePrelims,
}: {
  classId: string;
  students: Student[];
  initialExams: MajorExam[];
  initialScores: MajorExamScore[];
  usePrelims: boolean;
}) {
  const prelimExam = initialExams.find((e) => e.period === "prelim") ?? null;
  const midtermExam = initialExams.find((e) => e.period === "midterm") ?? null;
  const finalsExam = initialExams.find((e) => e.period === "finals") ?? null;

  return (
    <div className="mt-6 flex flex-col gap-4">
      {usePrelims && (
        <ExamSection
          classId={classId}
          period="prelim"
          label="Prelim exam"
          initialExam={prelimExam}
          students={students}
          initialScores={
            prelimExam
              ? initialScores.filter((s) => s.major_exam_id === prelimExam.id)
              : []
          }
        />
      )}
      <ExamSection
        classId={classId}
        period="midterm"
        label="Midterm exam"
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
        label="Final exam"
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
