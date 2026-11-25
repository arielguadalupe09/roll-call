// Gradebook -> Major Exam -> "Use this key in other classes": copies one
// exam's answer key (and item count) to the same exam -- same term, same
// written/laboratory kind -- in the teacher's other classes, e.g. every
// CWTS section takes the same final exam.
//
// Runs with the teacher's browser client, so RLS limits it to their classes.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MajorExamKind, Period } from "./types";
import { wrongItemsFromAnswers } from "./item-analysis";
import { syncItemScoresToGradebook } from "./item-score-sync";

export type ClassForShare = {
  id: string;
  name: string;
  subject: string | null;
  course_code: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// "CWTS BSFIL 1A" -> "cwts"; "CSS-11 Grade 11" -> "css". Only a word with a
// letter in it counts, so "1A" alone never links two classes.
function nameSubject(name: string): string {
  const first = norm(name).split(/[\s\-–—_/|:,]+/)[0] ?? "";
  const letters = first.replace(/[^a-z]/g, "");
  return letters.length >= 2 ? letters : "";
}

// Why `other` looks like the same subject as `source`, or null. Checked in
// order of how deliberate the match is: the Subject field, the course code,
// then the first word of the class name.
export function sameSubjectReason(source: ClassForShare, other: ClassForShare): string | null {
  if (norm(source.subject) && norm(source.subject) === norm(other.subject)) return "same subject";
  if (norm(source.course_code) && norm(source.course_code) === norm(other.course_code)) return "same course code";
  const a = nameSubject(source.name);
  if (a && a === nameSubject(other.name)) return "same name";
  return null;
}

export type ApplyKeyResult = { error: string | null; created: boolean; rescored: number };

// Sets the key on that class's exam (creating the exam when it isn't set up
// yet), then re-scores every paper whose answers were recorded and writes the
// new correct counts to the gradebook -- what saving a key in the class
// itself does.
export async function applyAnswerKeyToClass(
  supabase: SupabaseClient,
  target: { classId: string; period: Period; kind: MajorExamKind },
  key: string,
  newExamMaxScore: number,
): Promise<ApplyKeyResult> {
  const itemCount = key.length;
  const { data: existing, error: findError } = await supabase
    .from("major_exams")
    .select("id, max_score")
    .eq("class_id", target.classId)
    .eq("period", target.period)
    .eq("kind", target.kind)
    .maybeSingle();
  if (findError) return { error: findError.message, created: false, rescored: 0 };

  if (!existing) {
    const { error } = await supabase.from("major_exams").insert({
      class_id: target.classId,
      period: target.period,
      kind: target.kind,
      max_score: newExamMaxScore,
      item_count: itemCount,
      answer_key: key,
    });
    return { error: error?.message ?? null, created: !error, rescored: 0 };
  }

  const exam = existing as { id: string; max_score: number };
  const { error: updateError } = await supabase
    .from("major_exams")
    .update({ item_count: itemCount, answer_key: key })
    .eq("id", exam.id);
  if (updateError) return { error: updateError.message, created: false, rescored: 0 };

  const { data: responses, error: responsesError } = await supabase
    .from("major_exam_item_responses")
    .select("student_id, wrong_items, answers")
    .eq("major_exam_id", exam.id);
  if (responsesError) return { error: responsesError.message, created: false, rescored: 0 };

  const papers = (responses ?? []) as { student_id: string; wrong_items: number[]; answers: string | null }[];
  if (!papers.length) return { error: null, created: false, rescored: 0 };

  const rescored = papers
    .filter((p) => p.answers && p.answers.length === itemCount)
    .map((p) => ({ ...p, wrong_items: wrongItemsFromAnswers(p.answers!, key) }));
  if (rescored.length) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("major_exam_item_responses").upsert(
      rescored.map((p) => ({
        major_exam_id: exam.id,
        student_id: p.student_id,
        wrong_items: p.wrong_items,
        answers: p.answers,
        updated_at: now,
      })),
      { onConflict: "major_exam_id,student_id" },
    );
    if (error) return { error: `Key saved, but papers weren't re-scored: ${error.message}`, created: false, rescored: 0 };
  }

  const byStudent = new Map(papers.map((p) => [p.student_id, p]));
  for (const p of rescored) byStudent.set(p.student_id, p);
  const sync = await syncItemScoresToGradebook(supabase, exam, itemCount, [...byStudent.values()]);
  if (sync.error) return { error: `Key saved, but scores weren't updated: ${sync.error}`, created: false, rescored: rescored.length };
  return { error: null, created: false, rescored: rescored.length };
}
