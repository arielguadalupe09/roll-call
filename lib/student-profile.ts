import type { AttendanceStatus, Period, SubmissionStatus } from "./types";

// Shared with the login page's Student tab, so both places that resolve a
// student by code agree on the response shape and where it's remembered.
export const STUDENT_CODE_KEY = "gains_student_code";

export type AttendanceEntry = { date: string; period: Period; status: AttendanceStatus };
export type FinalGrade = {
  prelim: number | null;
  midterm: number | null;
  finals: number | null;
  final: number | null;
};
export type VideoLecture = {
  id: string;
  title: string;
  description: string | null;
  videoUrl: string | null;
  signedUrl: string | null;
};
export type AssignmentEntry = {
  assignmentId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  maxScore: number;
  period: Period;
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
  fileName: string | null;
  fileSignedUrl: string | null;
};
export type AssessmentEntry = {
  title: string;
  date: string | null;
  period: Period;
  score: number | null;
  maxScore: number;
};
export type StudentProfile = {
  studentName: string;
  className: string;
  usePrelims: boolean;
  attendancePercent: number | null;
  attendanceEntries: AttendanceEntry[];
  finalGrade: FinalGrade;
  videoLectures: VideoLecture[];
  assignments: AssignmentEntry[];
  quizzes: AssessmentEntry[];
  written: AssessmentEntry[];
  laboratory: AssessmentEntry[];
};
