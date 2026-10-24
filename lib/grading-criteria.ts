import type { GradingConfig } from "./types";

// The gradebook's grading structure mirrors the DHVSU class record's Info
// sheet (lib/templates/dhvsu-1st-3rd-year.xlsx): Attendance + Major Exam +
// a Class Standing made of five teacher-named, teacher-weighted criteria.
// Each criterion is a fixed internal slot (its assessments.category and
// weight column never change) with an adjustable display name, so renaming
// "Written Activity" to "Seatwork" for a subject never touches score data.

export type CriterionKey = "quiz" | "recitation" | "written" | "laboratory" | "other";

export type CriterionSlot = {
  key: CriterionKey;
  weightField: "weight_quiz" | "weight_recitation" | "weight_written" | "weight_laboratory" | "weight_other";
  defaultLabel: string;
  // Info sheet row (A = name, B = weight) and first score column on the
  // Midterm / Final Term sheets.
  infoRow: number;
  column: string;
};

// In Info-sheet order (rows 41-45).
export const CLASS_STANDING_SLOTS: readonly CriterionSlot[] = [
  { key: "quiz", weightField: "weight_quiz", defaultLabel: "Quizzes", infoRow: 41, column: "H" },
  { key: "recitation", weightField: "weight_recitation", defaultLabel: "Recitation", infoRow: 42, column: "N" },
  { key: "written", weightField: "weight_written", defaultLabel: "Written Activity", infoRow: 43, column: "T" },
  { key: "laboratory", weightField: "weight_laboratory", defaultLabel: "Laboratory Activity", infoRow: 44, column: "Z" },
  { key: "other", weightField: "weight_other", defaultLabel: "", infoRow: 45, column: "AF" },
];

export type CriteriaLabels = Partial<Record<CriterionKey, string>>;

export function criterionLabel(config: Pick<GradingConfig, "criteria_labels"> | null | undefined, key: CriterionKey): string {
  const custom = config?.criteria_labels?.[key]?.trim();
  if (custom) return custom;
  const slot = CLASS_STANDING_SLOTS.find((s) => s.key === key)!;
  return slot.defaultLabel || "Other";
}

// The 5th criterion is unused until a teacher names or weights it; the
// first four always have a gradebook tab (they predate this structure).
export function isCriterionActive(
  config: Pick<GradingConfig, "criteria_labels" | "weight_other"> | null | undefined,
  key: CriterionKey,
): boolean {
  if (key !== "other") return true;
  return Boolean(config?.criteria_labels?.other?.trim()) || (Number(config?.weight_other) || 0) > 0;
}

// Info!A41:A45's dropdown (Version!B275:B323), verbatim.
export const DHVSU_CRITERIA_NAMES: readonly string[] = [
  "Activities",
  "Assignments",
  "Board Work",
  "Business Plan Implementation",
  "Capstone Projects",
  "Case Studies",
  "Class Participation",
  "Community-Based Projects",
  "Comprehensive Exams",
  "Culminating Activities",
  "Exhibits",
  "Feasibility Studies",
  "Hands-On Activities",
  "Individual Laboratory Assessments",
  "Integrated Learning Experiences",
  "Laboratory Experiments",
  "Laboratory Outputs",
  "Laboratory Reports",
  "Machine Activity",
  "On-the-Job Training (OJT)",
  "Oral Exams",
  "Performance Tasks (e.g., Speech Choir, Role Playing)",
  "Plates",
  "Portfolios",
  "Practical Exams",
  "Practicum",
  "Product Design",
  "Product Prototypes",
  "Program Output Presentations",
  "Project and Portfolio Submission",
  "Project Proposals (e.g., Business Plan Proposals)",
  "Projects",
  "Quizzes",
  "Recitation",
  "Reflection Papers",
  "Reports",
  "Research",
  "Research Papers",
  "Return Demonstrations",
  "Seatwork",
  "Shop Activities",
  "Simulations",
  "Software/Program Output Presentation",
  "Studio Work (e.g., architectural design)",
  "Summative Exams",
  "Teaching Demonstrations",
  "Term Papers",
  "Other",
];

// The template's percentage dropdowns: criteria 0-60% (Version!B156:B168),
// everything else 0-100% (Version!B53:B73), in 5% steps.
export const CRITERION_PERCENTS: readonly number[] = Array.from({ length: 13 }, (_, i) => i * 5);
export const PERCENTS: readonly number[] = Array.from({ length: 21 }, (_, i) => i * 5);

export const PROGRAM_TYPES = ["Non-board program", "Board program", "Board program (Medicine)"] as const;

// Info!B8's dropdown (Version!B39:B46).
export const COURSE_TYPES = [
  "Lecture",
  "Laboratory",
  "Shop",
  "Research/ Thesis/ Capstone/ Feasibility",
  "On-the-Job Training/ Practicum",
  "Field Study",
  "Teaching Internship",
  "Physical Education",
] as const;

export type WeightPreset = Partial<Record<"weight_attendance" | "weight_major_exam" | CriterionSlot["weightField"], number>>;

// DHVSU's recommended percentages per course type (Version sheet). Their
// CHARACTER line is the Info sheet's Attendance row, and ACTIVITIES goes to
// the Info sheet's Activities row (row 44, this app's 4th criterion).
// Course types graded on a different basis entirely (thesis, OJT, field
// study, internship) have no preset here.
export const COURSE_TYPE_PRESETS: Partial<Record<(typeof COURSE_TYPES)[number], WeightPreset>> = {
  Lecture: { weight_attendance: 10, weight_recitation: 20, weight_quiz: 30, weight_laboratory: 10, weight_major_exam: 30, weight_written: 0, weight_other: 0 },
  Laboratory: { weight_attendance: 10, weight_recitation: 15, weight_quiz: 15, weight_laboratory: 30, weight_major_exam: 30, weight_written: 0, weight_other: 0 },
  Shop: { weight_attendance: 10, weight_recitation: 5, weight_quiz: 10, weight_laboratory: 50, weight_major_exam: 25, weight_written: 0, weight_other: 0 },
  "Physical Education": { weight_attendance: 10, weight_recitation: 10, weight_quiz: 20, weight_laboratory: 30, weight_major_exam: 30, weight_written: 0, weight_other: 0 },
};
