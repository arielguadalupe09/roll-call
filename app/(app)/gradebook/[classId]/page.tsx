import { notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import type {
  Assessment,
  AssessmentScore,
  Assignment,
  ClassRow,
  Exam,
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
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { classId } = await params;
  const { tab: requestedTab } = await searchParams;
  const supabase = await createClient();

  // None of these three depend on each other -- only on classId, which is
  // already known from params -- so they don't need to be sequential.
  const [
    {
      data: { user },
    },
    { data: classRow },
    { data: links },
  ] = await Promise.all([
    getUser(),
    supabase.from("classes").select("*").eq("id", classId).single(),
    supabase.from("assignment_classes").select("assignment_id").eq("class_id", classId),
  ]);

  if (!classRow || !user) notFound();

  const linkedIds = (links as { assignment_id: string }[] | null)?.map((l) => l.assignment_id) ?? [];

  const [
    { data: students },
    { data: assignments },
    { data: config },
    { data: assessments },
    { data: majorExams },
    { data: recitationLogs },
    { data: teacherClasses },
    { data: exams },
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
    supabase
      .from("exams")
      .select("*")
      .eq("class_id", classId)
      .order("created_at", { ascending: false }),
  ]);

  const teacherClassIds = (teacherClasses as ClassRow[] | null)?.map((c) => c.id) ?? [];
  const assignmentIds = (assignments as Assignment[] | null)?.map((a) => a.id) ?? [];
  const assessmentIds = (assessments as Assessment[] | null)?.map((a) => a.id) ?? [];
  const majorExamIds = (majorExams as MajorExam[] | null)?.map((e) => e.id) ?? [];

  // None of these four depend on each other's results, just on IDs already
  // resolved above -- run them together instead of paying for four
  // sequential round trips.
  const [
    { data: allStudents },
    { data: submissions },
    { data: assessmentScores },
    { data: majorExamScores },
  ] = await Promise.all([
    teacherClassIds.length
      ? supabase
          .from("students")
          .select("*")
          .in("class_id", teacherClassIds)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [] as Student[] }),
    assignmentIds.length
      ? supabase.from("submissions").select("*").in("assignment_id", assignmentIds)
      : Promise.resolve({ data: [] as Submission[] }),
    assessmentIds.length
      ? supabase.from("assessment_scores").select("*").in("assessment_id", assessmentIds)
      : Promise.resolve({ data: [] as AssessmentScore[] }),
    majorExamIds.length
      ? supabase.from("major_exam_scores").select("*").in("major_exam_id", majorExamIds)
      : Promise.resolve({ data: [] as MajorExamScore[] }),
  ]);

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          {classRow.name} — grading
        </h1>

        <div className="mt-6">
          <GradingHubClient
            initialTab={requestedTab}
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
            exams={(exams as Exam[] | null) ?? []}
          />
        </div>
      </div>
    </div>
  );
}
