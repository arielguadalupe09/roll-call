import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Assessment,
  AssessmentScore,
  Assignment,
  Attendance,
  AttendanceStatus,
  GradingConfig,
  MajorExam,
  MajorExamScore,
  ParticipationLog,
  Period,
  Student,
  Submission,
} from "@/lib/types";

export type GridEntry = {
  date: string;
  period: Period;
  score: number | null;
  maxScore: number;
};

export type MajorExamData = {
  midtermScore: number | null;
  midtermMax: number | null;
  finalsScore: number | null;
  finalsMax: number | null;
  average: number | null;
};

export type AttendanceEntry = {
  date: string;
  period: Period;
  status: AttendanceStatus;
};

export type RecordCardStudentData = {
  student: Student;
  assignmentEntries: GridEntry[];
  recitationEntries: GridEntry[];
  quizEntries: GridEntry[];
  writtenEntries: GridEntry[];
  labEntries: GridEntry[];
  majorExam: MajorExamData;
  attendanceEntries: AttendanceEntry[];
};

export function periodForDate(date: string, midtermEndDate: string | null): Period {
  if (!midtermEndDate) return "midterm";
  return date <= midtermEndDate ? "midterm" : "finals";
}

// Fetches everything needed to build a Record Card for every student in a
// class, in one round of class-scoped queries (no per-student re-querying —
// important for classes with 50+ students).
export async function fetchClassGradingData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  classId: string,
) {
  const [
    { data: config },
    { data: assignments },
    { data: assessments },
    { data: majorExams },
    { data: recitationLogs },
    { data: attendance },
  ] = await Promise.all([
    supabase.from("grading_configs").select("*").eq("class_id", classId).single(),
    supabase
      .from("assignments")
      .select("*")
      .eq("class_id", classId)
      .order("due_date", { ascending: true }),
    supabase
      .from("assessments")
      .select("*")
      .eq("class_id", classId)
      .order("date", { ascending: true }),
    supabase.from("major_exams").select("*").eq("class_id", classId),
    supabase
      .from("participation_logs")
      .select("*")
      .eq("class_id", classId)
      .eq("type", "recitation")
      .order("date", { ascending: true }),
    supabase.from("attendance").select("*").eq("class_id", classId),
  ]);

  const assignmentList = (assignments as Assignment[] | null) ?? [];
  const assignmentIds = assignmentList.map((a) => a.id);
  const { data: submissions } = assignmentIds.length
    ? await supabase.from("submissions").select("*").in("assignment_id", assignmentIds)
    : { data: [] as Submission[] };

  const assessmentList = (assessments as Assessment[] | null) ?? [];
  const assessmentIds = assessmentList.map((a) => a.id);
  const { data: assessmentScores } = assessmentIds.length
    ? await supabase.from("assessment_scores").select("*").in("assessment_id", assessmentIds)
    : { data: [] as AssessmentScore[] };

  const majorExamList = (majorExams as MajorExam[] | null) ?? [];
  const majorExamIds = majorExamList.map((e) => e.id);
  const { data: majorExamScores } = majorExamIds.length
    ? await supabase.from("major_exam_scores").select("*").in("major_exam_id", majorExamIds)
    : { data: [] as MajorExamScore[] };

  return {
    config: config as GradingConfig | null,
    assignments: assignmentList,
    submissions: (submissions as Submission[] | null) ?? [],
    assessments: assessmentList,
    assessmentScores: (assessmentScores as AssessmentScore[] | null) ?? [],
    majorExams: majorExamList,
    majorExamScores: (majorExamScores as MajorExamScore[] | null) ?? [],
    recitationLogs: (recitationLogs as ParticipationLog[] | null) ?? [],
    attendance: (attendance as Attendance[] | null) ?? [],
  };
}

export type ClassGradingData = Awaited<ReturnType<typeof fetchClassGradingData>>;

// Pure — builds one student's Record Card data from already-fetched,
// class-wide grading data. No DB access, so it's cheap to call in a loop
// for every student in a class.
export function buildRecordCardData(
  student: Student,
  classData: ClassGradingData,
): RecordCardStudentData {
  const midtermEndDate = classData.config?.midterm_end_date ?? null;

  const submissionByAssignment = new Map(
    classData.submissions
      .filter((s) => s.student_id === student.id)
      .map((s) => [s.assignment_id, s]),
  );
  const assignmentEntries: GridEntry[] = classData.assignments.map((a) => ({
    date: a.due_date ?? a.created_at.slice(0, 10),
    period: a.period,
    score: submissionByAssignment.get(a.id)?.score ?? null,
    maxScore: a.max_score,
  }));

  const recitationEntries: GridEntry[] = classData.recitationLogs
    .filter((log) => log.student_id === student.id)
    .map((log) => ({
      date: log.date,
      period: periodForDate(log.date, midtermEndDate),
      score: log.score,
      maxScore: 5,
    }));

  const scoreByAssessment = new Map(
    classData.assessmentScores
      .filter((s) => s.student_id === student.id)
      .map((s) => [s.assessment_id, s]),
  );
  function entriesForCategory(category: Assessment["category"]): GridEntry[] {
    return classData.assessments
      .filter((a) => a.category === category)
      .map((a) => ({
        date: a.date ?? a.created_at.slice(0, 10),
        period: a.period,
        score: scoreByAssessment.get(a.id)?.score ?? null,
        maxScore: a.max_score,
      }));
  }

  const scoreByMajorExam = new Map(
    classData.majorExamScores
      .filter((s) => s.student_id === student.id)
      .map((s) => [s.major_exam_id, s]),
  );
  const midtermExam = classData.majorExams.find((e) => e.period === "midterm") ?? null;
  const finalsExam = classData.majorExams.find((e) => e.period === "finals") ?? null;
  const midtermExamScore = midtermExam
    ? (scoreByMajorExam.get(midtermExam.id)?.score ?? null)
    : null;
  const finalsExamScore = finalsExam
    ? (scoreByMajorExam.get(finalsExam.id)?.score ?? null)
    : null;
  const majorExamAverage =
    midtermExamScore != null && finalsExamScore != null
      ? (midtermExamScore + finalsExamScore) / 2
      : null;

  const statusByDateForStudent = new Map(
    classData.attendance
      .filter((a) => a.student_id === student.id)
      .map((a) => [a.date, a.status]),
  );
  const classSessionDates = Array.from(new Set(classData.attendance.map((a) => a.date))).sort();
  const attendanceEntries: AttendanceEntry[] = classSessionDates.map((date) => ({
    date,
    period: periodForDate(date, midtermEndDate),
    status: statusByDateForStudent.get(date) ?? "absent",
  }));

  return {
    student,
    assignmentEntries,
    recitationEntries,
    quizEntries: entriesForCategory("quiz"),
    writtenEntries: entriesForCategory("written"),
    labEntries: entriesForCategory("laboratory"),
    majorExam: {
      midtermScore: midtermExamScore,
      midtermMax: midtermExam?.max_score ?? null,
      finalsScore: finalsExamScore,
      finalsMax: finalsExam?.max_score ?? null,
      average: majorExamAverage,
    },
    attendanceEntries,
  };
}
