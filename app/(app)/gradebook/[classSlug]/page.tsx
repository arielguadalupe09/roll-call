import { notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import type {
  Assessment,
  AssessmentScore,
  Assignment,
  Attendance,
  ClassRow,
  GradeAdjustment,
  GradeRelease,
  Exam,
  GradingConfig,
  MajorExam,
  MajorExamItemResponse,
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
  params: Promise<{ classSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { classSlug } = await params;
  const { tab: requestedTab } = await searchParams;
  const supabase = await createClient();

  // getUser() and the classRow-by-slug lookup don't depend on each other --
  // run them together. The assignment_classes link query needs the real
  // classId the slug resolves to, so it can't join this Promise.all.
  const [
    {
      data: { user },
    },
    { data: classRow },
  ] = await Promise.all([
    getUser(),
    supabase.from("classes").select("*").eq("slug", classSlug).single(),
  ]);

  if (!classRow || !user) notFound();
  const classId = (classRow as ClassRow).id;

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
    { data: exams },
    { data: attendance },
    { data: adjustments },
    { data: releaseRows },
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
    // Attendance is a weighted category in the DHVSU grade (Overview).
    supabase.from("attendance").select("*").eq("class_id", classId),
    supabase.from("grade_adjustments").select("*").eq("class_id", classId),
    supabase
      .from("grade_releases")
      .select("*, grade_release_views(student_id), grade_notifications(student_id, status)")
      .eq("class_id", classId),
  ]);
  // How many students have opened each released term's notice, and how
  // many were really emailed about it (only "sent"; logged or failed ones are retried).
  // Counted per student across every release of the term, so a student who
  // got their own release before the class-wide one still counts once.
  const releaseData =
    (releaseRows as
      | (GradeRelease & {
          grade_release_views: { student_id: string }[] | null;
          grade_notifications: { student_id: string; status: string }[] | null;
        })[]
      | null) ?? [];
  const seenBy = (r: (typeof releaseData)[number]) => (r.grade_release_views ?? []).map((v) => v.student_id);
  const emailedTo = (r: (typeof releaseData)[number]) =>
    (r.grade_notifications ?? []).filter((n) => n.status === "sent").map((n) => n.student_id);
  const releases = releaseData.map((release) => {
    // A class-wide release counts every release of its term.
    const counted = release.student_id ? [release] : releaseData.filter((x) => x.period === release.period);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped from the props
    const { grade_release_views: _views, grade_notifications: _notifications, ...r } = release;
    return {
      ...r,
      seenCount: new Set(counted.flatMap(seenBy)).size,
      emailedCount: new Set(counted.flatMap(emailedTo)).size,
    };
  });

  const teacherClassIds = (teacherClasses as ClassRow[] | null)?.map((c) => c.id) ?? [];
  const assignmentIds = (assignments as Assignment[] | null)?.map((a) => a.id) ?? [];
  const assessmentIds = (assessments as Assessment[] | null)?.map((a) => a.id) ?? [];
  const majorExamIds = (majorExams as MajorExam[] | null)?.map((e) => e.id) ?? [];

  // None of these depend on each other's results, just on IDs already
  // resolved above -- run them together instead of paying for
  // sequential round trips.
  const [
    { data: allStudents },
    { data: submissions },
    { data: assessmentScores },
    { data: majorExamScores },
    { data: majorExamItemResponses },
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
    // Item analysis (migration 0043). An error (e.g. table not migrated
    // yet) just leaves data null -> no checked papers.
    majorExamIds.length
      ? supabase.from("major_exam_item_responses").select("*").in("major_exam_id", majorExamIds)
      : Promise.resolve({ data: [] as MajorExamItemResponse[] }),
  ]);

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          {classRow.name} — grading
        </h1>

        <div className="mt-6">
          <GradingHubClient
            initialTab={requestedTab}
            classId={classId}
            classSlug={classSlug}
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
            majorExamItemResponses={(majorExamItemResponses as MajorExamItemResponse[] | null) ?? []}
            recitationLogs={(recitationLogs as ParticipationLog[] | null) ?? []}
            attendance={(attendance as Attendance[] | null) ?? []}
            adjustments={(adjustments as GradeAdjustment[] | null) ?? []}
            releases={releases}
            programType={(classRow as ClassRow).program_type}
            courseType={(classRow as ClassRow).course_type}
            exams={(exams as Exam[] | null) ?? []}
          />
        </div>
      </div>
    </div>
  );
}
