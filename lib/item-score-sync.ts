// Item analysis -> gradebook: every checked paper (scanned bubble sheet or
// typed wrong items) becomes the student's score for that major exam, so the
// teacher never re-types correct counts into Scores. The score is the number
// of correct items, out of the exam's item count -- the exam's max score is
// set to the item count when they differ, or a 45/50 paper would be graded
// as 45/100.
//
// Used by Gradebook -> Major Exam (item-analysis-section.tsx) and the phone
// scanner (answer-sheets/.../scan), with the teacher's browser client.

import type { SupabaseClient } from "@supabase/supabase-js";

export type CheckedPaper = { student_id: string; wrong_items: number[] };

export function correctCount(itemCount: number, wrongItems: number[]): number {
  return Math.max(0, itemCount - new Set(wrongItems.filter((i) => i >= 1 && i <= itemCount)).size);
}

// studentId -> correct count.
export function scoresFromPapers(itemCount: number, papers: CheckedPaper[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of papers) out[p.student_id] = correctCount(itemCount, p.wrong_items);
  return out;
}

// Papers whose correct count differs from the score on record (or that have none).
export function papersOutOfSync(
  itemCount: number,
  papers: CheckedPaper[],
  recorded: Record<string, number | null | undefined>,
): CheckedPaper[] {
  return papers.filter((p) => recorded[p.student_id] !== correctCount(itemCount, p.wrong_items));
}

export type SyncResult = {
  error: string | null;
  // The exam's max score after syncing (the item count once any paper is synced).
  maxScore: number;
  scores: Record<string, number>;
};

// Writes the papers' correct counts as major_exam_scores. clearedStudentIds:
// papers the teacher removed from item analysis, whose scores are cleared too.
export async function syncItemScoresToGradebook(
  supabase: SupabaseClient,
  exam: { id: string; max_score: number },
  itemCount: number,
  papers: CheckedPaper[],
  clearedStudentIds: string[] = [],
): Promise<SyncResult> {
  const scores = scoresFromPapers(itemCount, papers);
  let maxScore = Number(exam.max_score);
  if (papers.length && maxScore !== itemCount) {
    const { error } = await supabase.from("major_exams").update({ max_score: itemCount }).eq("id", exam.id);
    if (error) return { error: error.message, maxScore, scores: {} };
    maxScore = itemCount;
  }
  const now = new Date().toISOString();
  const rows = [
    ...papers.map((p) => ({
      major_exam_id: exam.id,
      student_id: p.student_id,
      score: scores[p.student_id],
      updated_at: now,
    })),
    ...clearedStudentIds.map((id) => ({ major_exam_id: exam.id, student_id: id, score: null, updated_at: now })),
  ];
  if (!rows.length) return { error: null, maxScore, scores };
  const { error } = await supabase
    .from("major_exam_scores")
    .upsert(rows, { onConflict: "major_exam_id,student_id" });
  return { error: error?.message ?? null, maxScore, scores: error ? {} : scores };
}
