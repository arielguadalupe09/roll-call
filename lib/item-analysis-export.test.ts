import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildItemAnalysisDocx, buildItemAnalysisPdf, buildItemAnalysisXlsx } from "./item-analysis-export";
import {
  academicYearLine,
  buildItemAnalysisReport,
  signatoriesFromParams,
  signatoriesToParams,
  templateDecision,
  type ReportSignatories,
} from "./item-analysis-report";

const signatories: ReportSignatories = {
  prepared: { name: "Juan C. Dela Cruz", title: "Instructor" },
  checked: { name: "Ana B. Reyes", title: "BSEd Program Coordinator" },
  recommending: { name: "Mark Jameson E. Perez, Ed.D.", title: "Chairperson, Mexico Campus" },
  approved: { name: "Vicky P. Vital, Ed.D.", title: "Director, Mexico Campus" },
};

// 4 papers on a 5-item exam, key ABCDA.
const report = buildItemAnalysisReport({
  header: {
    schoolName: "PAMPANGA STATE UNIVERSITY",
    campus: "MEXICO CAMPUS",
    address: "San Juan, Mexico, Pampanga",
    academicYear: "First Semester, Academic Year 2026-2027",
    program: "Bachelor of Secondary Education major in English",
    course: "Introduction to Linguistics",
    yearSection: "BSEd English 1A",
    examLabel: "Midterm written exam",
  },
  itemCount: 5,
  answerKey: "ABCDA",
  responses: [
    { studentId: "1", wrongItems: [], answers: "ABCDA" },
    { studentId: "2", wrongItems: [], answers: "ABCAB" },
    { studentId: "3", wrongItems: [], answers: "ABC-C" },
    { studentId: "4", wrongItems: [], answers: "BACDD" },
  ],
  programType: "Non-board program",
  rosterNames: ["Dela Cruz, Juan P.", "Reyes, Ana B.", "Santos, Maria L.", "Tan, Jose R.", "Uy, Lito S."],
  signatories,
});

describe("item analysis report", () => {
  it("matches the template's difficulty and decision", () => {
    expect(report.examinees).toBe(4);
    expect(report.rows.map((r) => r.correct)).toEqual([3, 3, 4, 2, 1]);
    expect(report.rows.map((r) => r.decision)).toEqual([
      "Review: Easy",
      "Review: Easy",
      "Review: Easy",
      "Retain /Review",
      "Review: Difficult",
    ]);
    expect(templateDecision(0.3)).toBe("Retain /Review");
    expect(templateDecision(0.7)).toBe("Retain /Review");
  });

  it("builds the academic year line", () => {
    expect(academicYearLine("First Semester", "2026-2027")).toBe("First Semester, Academic Year 2026-2027");
    expect(academicYearLine(null, "Academic Year 26-27")).toBe("Academic Year 26-27");
    expect(academicYearLine(null, null)).toBe("");
  });

  it("round-trips signatories through query params", () => {
    expect(signatoriesFromParams(signatoriesToParams(signatories, new URLSearchParams()))).toEqual(signatories);
  });
});

describe("item analysis exports", () => {
  it("fills the Excel template", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildItemAnalysisXlsx(report)) as unknown as ArrayBuffer);

    const mc = wb.getWorksheet("Multiple Choice")!;
    expect(mc.getCell("C11").value).toBe("BSEd English 1A");
    expect(mc.getCell("C12").value).toBe(4);
    expect(mc.getCell("A7").value).toBe("Midterm written exam");
    expect(mc.getCell("B17").value).toBe(3);
    expect(mc.getCell("E17").value).toBe("A");
    expect(mc.getCell("C17").value).toMatchObject({ formula: 'IF(B17="","",IFERROR(B17/$C$12,""))', result: 0.75 });
    expect(mc.getCell("D21").value).toMatchObject({ result: "Review: Difficult" });
    // The template's sample row and unused rows are cleared.
    expect(mc.getCell("B22").value).toBeNull();
    expect(mc.getCell("A120").value).toBe("JUAN C. DELA CRUZ");
    expect(mc.getCell("E121").value).toBe("BSEd Program Coordinator");
    expect(mc.getImages()).toHaveLength(2);

    const pt = wb.getWorksheet("Performance Task")!;
    expect(pt.getCell("B15").value).toBe("Dela Cruz, Juan P.");
    expect(pt.getCell("C15").value).toBeNull();
    expect(pt.getCell("C12").value).toBe(5);
    expect(pt.getCell("F98").value).toBe("VICKY P. VITAL, ED.D.");

    const summary = wb.getWorksheet("PT-Analysis Summary")!;
    expect(summary.getCell("B3").value).toMatchObject({ formula: "COUNTA('Performance Task'!B15:B89)" });
  });

  it("builds Word and PDF files", async () => {
    const docx = await buildItemAnalysisDocx(report);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
    const pdf = buildItemAnalysisPdf(report);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
