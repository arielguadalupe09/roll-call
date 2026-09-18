import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bindDeviceIfUnset, checkDeviceLock, rebindDevice } from "@/lib/student-device-lock";
import { buildRecordCardData, fetchClassGradingData } from "@/lib/record-card-data";
import { computeFinalGrade } from "@/lib/final-grade";
import type {
  Assessment,
  AssessmentCategory,
  Assignment,
  ClassRow,
  Exam,
  ExamAttempt,
  GradingConfig,
  Student,
  Submission,
  VideoLecture,
} from "@/lib/types";

const SUBMISSIONS_BUCKET = "submissions";
const LECTURES_BUCKET = "lecture-videos";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const code = body?.code;
  const deviceId = typeof body?.deviceId === "string" && body.deviceId ? body.deviceId : null;
  const confirmDeviceSwitch = body?.confirmDeviceSwitch === true;

  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Missing code." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();

  if (!student) {
    return NextResponse.json(
      { error: "That code doesn't match any student." },
      { status: 404 },
    );
  }

  const lock = await checkDeviceLock(supabase, student, deviceId, confirmDeviceSwitch);
  if (!lock.ok) {
    return NextResponse.json(
      { error: lock.error, needsConfirmation: !!lock.needsConfirmation },
      { status: 403 },
    );
  }
  if (confirmDeviceSwitch) {
    await rebindDevice(supabase, student, deviceId);
  } else {
    await bindDeviceIfUnset(supabase, student, deviceId);
  }

  const { data: classRow } = await supabase
    .from("classes")
    .select("id, name")
    .eq("id", student.class_id)
    .maybeSingle();

  if (!classRow) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }

  // Folds the old standalone /checkin flow into this one visit: if the
  // teacher has a session open for this class right now, viewing this
  // profile also marks the student present for it -- no separate check-in
  // page needed. "No server-computed date" on purpose -- this route runs in
  // UTC while the school is UTC+8, so matching against a server-computed
  // "today" would misidentify the date for hours around midnight. Gate on
  // session existence instead, and use the session's own teacher-set date.
  // A duplicate insert (already checked in, or double-submitted) hits the
  // attendance table's unique constraint and is treated as success, not an
  // error.
  const { data: openSession } = await supabase
    .from("sessions")
    .select("id, class_id, date")
    .eq("class_id", student.class_id)
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let justCheckedIn = false;
  if (openSession) {
    const { error: attendanceError } = await supabase.from("attendance").insert({
      class_id: openSession.class_id,
      student_id: student.id,
      date: openSession.date,
      method: "self",
      status: "present",
    });
    justCheckedIn = !attendanceError || attendanceError.code === "23505";
  }

  // Carried over from the old standalone /checkin confirmation screen, now
  // that this route covers both jobs.
  const { data: announcementRows } = await supabase
    .from("announcements")
    .select("id, title, body, created_at")
    .eq("class_id", student.class_id)
    .order("created_at", { ascending: false })
    .limit(5);

  const classData = await fetchClassGradingData(supabase, student.class_id);
  const recordData = buildRecordCardData(student as Student, classData);
  const finalGrade = computeFinalGrade(recordData, classData.config as GradingConfig);

  const attended = recordData.attendanceEntries.filter(
    (e) => e.status === "present" || e.status === "late",
  ).length;
  const attendancePercent =
    recordData.attendanceEntries.length > 0
      ? (attended / recordData.attendanceEntries.length) * 100
      : null;

  const scoreByAssessment = new Map(
    classData.assessmentScores
      .filter((s) => s.student_id === student.id)
      .map((s) => [s.assessment_id, s]),
  );
  function assessmentEntries(category: AssessmentCategory) {
    return classData.assessments
      .filter((a: Assessment) => a.category === category)
      .map((a: Assessment) => ({
        title: a.title,
        date: a.date,
        period: a.period,
        score: scoreByAssessment.get(a.id)?.score ?? null,
        maxScore: a.max_score,
      }))
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  }
  const quizzes = assessmentEntries("quiz");
  const written = assessmentEntries("written");
  const laboratory = assessmentEntries("laboratory");

  const { data: lectures } = await supabase
    .from("video_lectures")
    .select("*")
    .eq("class_id", student.class_id)
    .eq("published", true)
    .order("created_at", { ascending: false });

  const videoLectures = await Promise.all(
    ((lectures as VideoLecture[] | null) ?? []).map(async (lecture) => {
      let signedUrl: string | null = null;
      if (lecture.storage_path) {
        const { data: signed } = await supabase.storage
          .from(LECTURES_BUCKET)
          .createSignedUrl(lecture.storage_path, 3600);
        signedUrl = signed?.signedUrl ?? null;
      }
      return {
        id: lecture.id,
        title: lecture.title,
        description: lecture.description,
        videoUrl: lecture.video_url,
        signedUrl,
      };
    }),
  );

  const { data: submissions } = await supabase
    .from("submissions")
    .select("*")
    .eq("student_id", student.id);

  const submissionList = (submissions as Submission[] | null) ?? [];
  const assignmentIds = submissionList.map((s) => s.assignment_id);
  const { data: assignmentRows } = assignmentIds.length
    ? await supabase.from("assignments").select("*").in("id", assignmentIds)
    : { data: [] as Assignment[] };
  const assignmentById = new Map(
    ((assignmentRows as Assignment[] | null) ?? []).map((a) => [a.id, a]),
  );

  const assignments = (
    await Promise.all(
      submissionList.map(async (submission) => {
        const assignment = assignmentById.get(submission.assignment_id);
        if (!assignment) return null;

        let fileSignedUrl: string | null = null;
        if (submission.file_path) {
          const { data: signed } = await supabase.storage
            .from(SUBMISSIONS_BUCKET)
            .createSignedUrl(submission.file_path, 3600);
          fileSignedUrl = signed?.signedUrl ?? null;
        }

        return {
          assignmentId: assignment.id,
          title: assignment.title,
          description: assignment.description,
          dueDate: assignment.due_date,
          maxScore: assignment.max_score,
          period: assignment.period,
          status: submission.status,
          score: submission.score,
          feedback: submission.feedback,
          fileName: submission.file_name,
          fileSignedUrl,
        };
      }),
    )
  )
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .sort((a, b) => (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99"));

  const { data: examRows } = await supabase
    .from("exams")
    .select("*")
    .eq("class_id", student.class_id)
    .eq("published", true)
    .order("created_at", { ascending: false });

  const examList = (examRows as Exam[] | null) ?? [];
  const examIds = examList.map((e) => e.id);
  const { data: examAttemptRows } = examIds.length
    ? await supabase
        .from("exam_attempts")
        .select("*")
        .eq("student_id", student.id)
        .in("exam_id", examIds)
    : { data: [] as ExamAttempt[] };

  const attemptByExam = new Map(
    ((examAttemptRows as ExamAttempt[] | null) ?? []).map((a) => [a.exam_id, a]),
  );

  const exams = examList.map((exam) => {
    const attempt = attemptByExam.get(exam.id);
    const status = !attempt ? "not_started" : attempt.submitted_at ? "submitted" : "in_progress";
    const isNew = !!attempt && !attempt.needs_grading && attempt.score !== null && !attempt.score_seen_at;
    return {
      id: exam.id,
      title: exam.title,
      kind: exam.kind,
      period: exam.period,
      durationMinutes: exam.duration_minutes,
      availableFrom: exam.available_from,
      availableUntil: exam.available_until,
      status,
      score: attempt?.score ?? null,
      totalPoints: attempt?.total_points ?? null,
      isNew,
    };
  });

  const newlySeenAttemptIds = exams
    .filter((e) => e.isNew)
    .map((e) => attemptByExam.get(e.id)?.id)
    .filter((id): id is string => !!id);
  if (newlySeenAttemptIds.length) {
    await supabase
      .from("exam_attempts")
      .update({ score_seen_at: new Date().toISOString() })
      .in("id", newlySeenAttemptIds);
  }

  return NextResponse.json({
    studentName: student.name,
    className: (classRow as ClassRow).name,
    justCheckedIn,
    announcements: announcementRows ?? [],
    usePrelims: (classData.config as GradingConfig | null)?.use_prelims ?? false,
    attendancePercent,
    attendanceEntries: recordData.attendanceEntries,
    finalGrade,
    videoLectures,
    assignments,
    quizzes,
    written,
    laboratory,
    exams,
  });
}
