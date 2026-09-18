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
import ScoreEntryTable, { type ScoreRow } from "./score-entry-table";
import CollapsibleSection from "@/app/_components/collapsible-section";
import { useToast } from "@/app/_components/toast";
import Button from "@/app/_components/button";
import { Input, Select } from "@/app/_components/input";
import { FormField } from "@/app/_components/form-field";

export default function AssessmentRoster({
  classId,
  category,
  categoryLabel,
  students,
  initialAssessments,
  initialScores,
  usePrelims = false,
}: {
  classId: string;
  category: AssessmentCategory;
  categoryLabel: string;
  students: Student[];
  initialAssessments: Assessment[];
  initialScores: AssessmentScore[];
  usePrelims?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
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
    if (upsertError) showToast(upsertError.message);
  }

  return (
    <div className="mt-6">
      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-3 rounded-[10px] border border-line bg-card p-4"
      >
        <Input
          type="text"
          placeholder={`${categoryLabel} title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="flex flex-wrap gap-3">
          <FormField label="Date (optional)" className="flex-1">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Adding..." : `Add ${categoryLabel.toLowerCase()}`}
          </Button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </form>

      <ul className="mt-6 flex flex-col gap-3">
        {assessments.map((a) => {
          const isOpen = expandedId === a.id;
          const rows = scoresByAssessment[a.id] ?? {};
          return (
            <li key={a.id}>
              <CollapsibleSection
                title={a.title}
                subtitle={`${a.date ? `${a.date} · ` : ""}Max score ${a.max_score} · ${a.period} · ${students.length} students`}
                open={isOpen}
                onToggle={() => setExpandedId(isOpen ? null : a.id)}
                actions={
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(a.id);
                    }}
                  >
                    Delete
                  </Button>
                }
              >
                <ScoreEntryTable
                  students={students}
                  rows={rows}
                  maxScore={a.max_score}
                  onScoreChange={(studentId, value) =>
                    updateScore(a.id, studentId, { score: value })
                  }
                  onSave={(studentId) => handleSaveScore(a.id, studentId)}
                />
              </CollapsibleSection>
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
