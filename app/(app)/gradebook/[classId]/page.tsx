import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  Assessment,
  AssessmentScore,
  Assignment,
  ClassRow,
  GradingConfig,
  MajorExam,
  MajorExamScore,
  ParticipationLog,
  Student,
  Submission,
} from "@/lib/types";
import GradingHubClient from "./grading-hub-client";

export default async function GradebookPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: classRow } = await supabase
    .from("classes")
    .select("*")
    .eq("id", classId)
    .single();

  if (!classRow || !user) notFound();

  const { data: links } = await supabase
    .from("assignment_classes")
    .select("assignment_id")
    .eq("class_id", classId);
  const linkedIds = (links as { assignment_id: string }[] | null)?.map((l) => l.assignment_id) ?? [];

  const [
    { data: students },
    { data: assignments },
    { data: config },
    { data: assessments },
    { data: majorExams },
    { data: recitationLogs },
    { data: teacherClasses },
  ] = await Promise.all([
    supabase
      .from("students")
      .select("*")
      .eq("class_id", classId)
      .order("name", { ascending: true }),
    linkedIds.length
      ? supabase.from("assignments").select("*").in("id", linkedIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Assignment[] }),
    supabase.from("grading_configs").select("*").eq("class_id", classId).single(),
    supabase
      .from("assessments")
      .select("*")
      .eq("class_id", classId)
      .order("created_at", { ascending: false }),
    supabase.from("major_exams").select("*").eq("class_id", classId),
    supabase
      .from("participation_logs")
      .select("*")
      .eq("class_id", classId)
      .eq("type", "recitation"),
    supabase
      .from("classes")
      .select("*")
      .eq("teacher_id", user.id)
      .eq("archived", false)
      .order("name", { ascending: true }),
  ]);

  const teacherClassIds = (teacherClasses as ClassRow[] | null)?.map((c) => c.id) ?? [];
  const { data: allStudents } = teacherClassIds.length
    ? await supabase
        .from("students")
        .select("*")
        .in("class_id", teacherClassIds)
        .order("name", { ascending: true })
    : { data: [] as Student[] };

  const assignmentIds = (assignments as Assignment[] | null)?.map((a) => a.id) ?? [];
  const { data: submissions } = assignmentIds.length
    ? await supabase.from("submissions").select("*").in("assignment_id", assignmentIds)
    : { data: [] as Submission[] };

  const assessmentIds = (assessments as Assessment[] | null)?.map((a) => a.id) ?? [];
  const { data: assessmentScores } = assessmentIds.length
    ? await supabase.from("assessment_scores").select("*").in("assessment_id", assessmentIds)
    : { data: [] as AssessmentScore[] };

  const majorExamIds = (majorExams as MajorExam[] | null)?.map((e) => e.id) ?? [];
  const { data: majorExamScores } = majorExamIds.length
    ? await supabase.from("major_exam_scores").select("*").in("major_exam_id", majorExamIds)
    : { data: [] as MajorExamScore[] };

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          {classRow.name} — grading
        </h1>

        <div className="mt-6">
          <GradingHubClient
            classId={classId}
            teacherId={user.id}
            teacherClasses={(teacherClasses as ClassRow[] | null) ?? []}
            allStudents={(allStudents as Student[] | null) ?? []}
            students={(students as Student[] | null) ?? []}
            config={config as GradingConfig}
            assignments={(assignments as Assignment[] | null) ?? []}
            submissions={(submissions as Submission[] | null) ?? []}
            assessments={(assessments as Assessment[] | null) ?? []}
            assessmentScores={(assessmentScores as AssessmentScore[] | null) ?? []}
            majorExams={(majorExams as MajorExam[] | null) ?? []}
            majorExamScores={(majorExamScores as MajorExamScore[] | null) ?? []}
            recitationLogs={(recitationLogs as ParticipationLog[] | null) ?? []}
          />
        </div>
      </div>
    </div>
  );
}
