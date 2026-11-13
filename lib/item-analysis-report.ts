// The "Results of Item Analysis" report (lib/templates/item-analysis.xlsx,
// the school's own template) as plain data, shared by the Excel, Word and
// PDF builders in lib/item-analysis-export.ts. Pure -- unit tested.

import { analyzeItems, type ItemResponse } from "./item-analysis";
import type { ProgramType } from "./dhvsu-grade";

// The template's Multiple Choice sheet has rows for items 1-100 (A17:A116).
export const REPORT_MAX_ITEMS = 100;
// The template's Performance Task sheet has rows for 75 students (B15:B89).
export const REPORT_MAX_PT_STUDENTS = 75;

export type ReportDecision = "Review: Difficult" | "Retain /Review" | "Review: Easy";

// Mirrors the template's Decision formula (Multiple Choice!D17), spelling included:
// IF(C17<0.3,"Review: Difficult",IF(C17<=0.7,"Retain /Review","Review: Easy")).
export function templateDecision(difficulty: number): ReportDecision {
  if (difficulty < 0.3) return "Review: Difficult";
  if (difficulty <= 0.7) return "Retain /Review";
  return "Review: Easy";
}

export type Signatory = { name: string; title: string };

export type ReportSignatories = {
  prepared: Signatory;
  checked: Signatory;
  recommending: Signatory;
  approved: Signatory;
};

export type ReportHeader = {
  schoolName: string;
  campus: string;
  address: string;
  academicYear: string;
  program: string;
  course: string;
  yearSection: string;
  examLabel: string;
};

export type ReportRow = {
  item: number;
  correct: number;
  // Unrounded, like the template's =B17/$C$12; formatters round to 2 places.
  difficulty: number;
  decision: ReportDecision;
  key: string;
};

export type ItemAnalysisReport = {
  header: ReportHeader;
  // Papers checked -- the template's "Number of Students" (C12), which every
  // difficulty is divided by.
  examinees: number;
  itemCount: number;
  rows: ReportRow[];
  // Class roster for the Performance Task sheet (ratings are left for the teacher).
  rosterNames: string[];
  signatories: ReportSignatories;
};

export function buildItemAnalysisReport({
  header,
  itemCount,
  answerKey,
  responses,
  programType,
  rosterNames,
  signatories,
}: {
  header: ReportHeader;
  itemCount: number;
  answerKey: string | null;
  responses: ItemResponse[];
  programType: ProgramType;
  rosterNames: string[];
  signatories: ReportSignatories;
}): ItemAnalysisReport {
  const analysis = analyzeItems(itemCount, responses, programType, answerKey);
  const n = analysis.studentCount;
  return {
    header,
    examinees: n,
    itemCount,
    rows: analysis.items.map((i) => {
      const difficulty = n ? i.correct / n : 0;
      return {
        item: i.item,
        correct: i.correct,
        difficulty,
        decision: templateDecision(difficulty),
        key: i.key ?? "",
      };
    }),
    rosterNames,
    signatories,
  };
}

// "First Semester, Academic Year 2026-2027" from the class's record metadata.
export function academicYearLine(semester: string | null, academicYear: string | null): string {
  const year = academicYear?.trim();
  return [semester?.trim(), year ? (/academic year/i.test(year) ? year : `Academic Year ${year}`) : ""]
    .filter(Boolean)
    .join(", ");
}

// Template defaults for the letterhead, used when the teacher hasn't set their own.
export const TEMPLATE_LETTERHEAD = {
  schoolName: "PAMPANGA STATE UNIVERSITY",
  campus: "MEXICO CAMPUS",
  address: "San Juan, Mexico, Pampanga",
} as const;

export const REPORT_FORMATS = ["xlsx", "docx", "pdf"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

// Signatories travel as query params (?pName=&pTitle=&cName=...) so the export
// is a plain GET download link.
const SIGNATORY_PARAMS = { prepared: "p", checked: "c", recommending: "r", approved: "a" } as const;

export function signatoriesToParams(s: ReportSignatories, params: URLSearchParams): URLSearchParams {
  for (const [role, prefix] of Object.entries(SIGNATORY_PARAMS)) {
    const sig = s[role as keyof ReportSignatories];
    if (sig.name.trim()) params.set(`${prefix}Name`, sig.name.trim());
    if (sig.title.trim()) params.set(`${prefix}Title`, sig.title.trim());
  }
  return params;
}

export function signatoriesFromParams(params: URLSearchParams): ReportSignatories {
  const get = (k: string) => (params.get(k) ?? "").slice(0, 120);
  const out = {} as ReportSignatories;
  for (const [role, prefix] of Object.entries(SIGNATORY_PARAMS)) {
    out[role as keyof ReportSignatories] = { name: get(`${prefix}Name`), title: get(`${prefix}Title`) };
  }
  return out;
}
