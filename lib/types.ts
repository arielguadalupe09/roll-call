import type { RecordCardLayout } from "./record-card-layout";

export type Teacher = {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  card_school_name: string | null;
  card_campus_line: string | null;
  card_logo_path: string | null;
  created_at: string;
};

export type ClassRow = {
  id: string;
  teacher_id: string;
  name: string;
  subject: string | null;
  archived: boolean;
  created_at: string;
};

export type Student = {
  id: string;
  class_id: string;
  name: string;
  code: string;
  created_at: string;
};

export type Session = {
  id: string;
  class_id: string;
  date: string;
  token: string;
  opened_at: string;
  closed_at: string | null;
};

export type AttendanceMethod = "scan" | "self" | "manual";
export type AttendanceStatus = "present" | "absent" | "excused" | "late";

export type Attendance = {
  id: string;
  class_id: string;
  student_id: string;
  date: string;
  method: AttendanceMethod;
  status: AttendanceStatus;
  recorded_at: string;
};

export type Announcement = {
  id: string;
  class_id: string;
  title: string;
  body: string;
  created_at: string;
};

export type Material = {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  url: string;
  created_at: string;
};

export type Period = "midterm" | "finals";

export type Assignment = {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  max_score: number;
  period: Period;
  created_at: string;
};

export type SubmissionStatus = "missing" | "submitted" | "graded";

export type Submission = {
  id: string;
  assignment_id: string;
  student_id: string;
  status: SubmissionStatus;
  file_path: string | null;
  file_name: string | null;
  score: number | null;
  feedback: string | null;
  updated_at: string;
};

export type ParticipationType = "recitation" | "activity";

export type ParticipationLog = {
  id: string;
  class_id: string;
  student_id: string;
  type: ParticipationType;
  label: string | null;
  score: number | null;
  date: string;
  recorded_at: string;
};

export type GradingConfig = {
  class_id: string;
  weight_assignment: number;
  weight_recitation: number;
  weight_quiz: number;
  weight_written: number;
  weight_laboratory: number;
  weight_major_exam: number;
  midterm_weight: number;
  finals_weight: number;
  midterm_end_date: string | null;
  show_assignment: boolean;
  show_recitation: boolean;
  show_quiz: boolean;
  show_written: boolean;
  show_laboratory: boolean;
  show_major_exam: boolean;
  show_attendance: boolean;
  record_card_layout: RecordCardLayout;
  updated_at: string;
};

export type AssessmentCategory = "quiz" | "written" | "laboratory";

export type Assessment = {
  id: string;
  class_id: string;
  category: AssessmentCategory;
  title: string;
  date: string | null;
  max_score: number;
  period: Period;
  created_at: string;
};

export type AssessmentScore = {
  id: string;
  assessment_id: string;
  student_id: string;
  score: number | null;
  updated_at: string;
};

export type MajorExam = {
  id: string;
  class_id: string;
  period: Period;
  max_score: number;
  created_at: string;
};

export type MajorExamScore = {
  id: string;
  major_exam_id: string;
  student_id: string;
  score: number | null;
  updated_at: string;
};

export type DayOfWeek =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday";

export type ScheduleEntry = {
  id: string;
  teacher_id: string;
  school_year: string;
  semester: string;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  subject_code: string;
  section: string | null;
  room: string | null;
  created_at: string;
};
