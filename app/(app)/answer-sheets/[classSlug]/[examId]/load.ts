import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClassRow, MajorExam, MajorExamItemResponse, Student } from "@/lib/types";

// Shared by the print and scan pages: the class, the exam (which must belong
// to it), its students and the papers already checked. RLS keeps both pages
// to the signed-in teacher's own classes.
export async function loadAnswerSheetData(classSlug: string, examId: string) {
  const supabase = await createClient();
  const { data: classRow } = await supabase.from("classes").select("*").eq("slug", classSlug).single();
  if (!classRow) notFound();
  const classId = (classRow as ClassRow).id;

  const [{ data: exam }, { data: students }, { data: responses }] = await Promise.all([
    supabase.from("major_exams").select("*").eq("id", examId).eq("class_id", classId).maybeSingle(),
    supabase.from("students").select("*").eq("class_id", classId).order("name", { ascending: true }),
    supabase.from("major_exam_item_responses").select("*").eq("major_exam_id", examId),
  ]);
  if (!exam) notFound();

  return {
    classRow: classRow as ClassRow,
    exam: exam as MajorExam,
    students: (students as Student[] | null) ?? [],
    responses: (responses as MajorExamItemResponse[] | null) ?? [],
  };
}
