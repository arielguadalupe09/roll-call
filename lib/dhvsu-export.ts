import ExcelJS from "exceljs";
import path from "path";
import type { ClassGradingData } from "@/lib/record-card-data";
import {
  buildTermPlan,
  DHVSU_CATEGORIES,
  MAX_ATTENDANCE_SESSIONS,
  normalizeProgramType,
  SLOT_CAPACITY,
  WEIGHT_FIELD,
  type DhvsuCategory,
  type Slot,
  type TermPlan,
} from "@/lib/dhvsu-grade";
import type { AttendanceStatus, ClassRow, Student, Teacher } from "@/lib/types";
import {
  CLASS_STANDING_SLOTS,
  criterionLabel,
  isCriterionActive,
  type CriterionKey,
} from "@/lib/grading-criteria";

const TEMPLATE_PATH = path.join(process.cwd(), "lib/templates/dhvsu-1st-3rd-year.xlsx");

// This template only has Midterm/Final Term sheets -- deliberately narrower
// than the app-wide `Period` type (which also has "prelim"). The gradebook
// UI disables this export entirely for classes with a third period enabled,
// so this file never needs to handle "prelim".
type DhvsuPeriod = "midterm" | "finals";

const TERM_SHEETS: Record<DhvsuPeriod, { score: string; attendance: string }> = {
  midterm: { score: "Midterm", attendance: "MT Attendance" },
  finals: { score: "Final Term", attendance: "FT Attendance" },
};

// First score slot of each category on the Midterm / Final Term sheets.
// The visual category header sits one block AHEAD of its data-entry
// columns -- verified against MidCom/FinCom's own AVERAGEIF formulas (the
// "QUIZZES" header is at M, but MidCom!M6 averages H6:L6). The five Class
// Standing blocks are the class's five criteria, in Info-sheet order
// (lib/grading-criteria.ts).
const CATEGORY_COLUMN: Record<DhvsuCategory, string> = {
  ...(Object.fromEntries(CLASS_STANDING_SLOTS.map((s) => [s.key, s.column])) as Record<CriterionKey, string>),
  major_exam: "AM",
};

// Info sheet: criteria names (A) and weights (B, as fractions).
const INFO_WEIGHT_ROW: Record<DhvsuCategory | "attendance", number> = {
  attendance: 38,
  major_exam: 39,
  ...(Object.fromEntries(CLASS_STANDING_SLOTS.map((s) => [s.key, s.infoRow])) as Record<CriterionKey, number>),
};

const MAX_STUDENTS = 85; // term sheets rows 6-90, attendance rows 4-88
const SUMMARY_ROW_START = 12;

const STUDENT_ROW_START = 6; // Midterm / Final Term sheets
const ATTENDANCE_ROW_START = 4; // MT Attendance / FT Attendance sheets
const ATTENDANCE_DATE_COL_START = "C";
const STUDENT_LIST_ROW_START = 9; // 0-indexed row 10

const STATUS_CODE: Record<AttendanceStatus, string> = {
  present: "P",
  late: "L",
  excused: "E",
  absent: "A",
};

// Writes a value into a cell, refusing to ever touch a formula cell -- the
// real safety boundary for this feature, since a wrong cell here would
// silently corrupt an official grade computation. ExcelJS's cell.value
// setter only replaces the value, leaving style/formatting on that cell
// untouched, and (unlike a plain read-modify-write of the raw XML) preserves
// everything else in the workbook -- images, shared strings, defined names,
// per-sheet relationships -- byte-faithfully.
function setCell(ws: ExcelJS.Worksheet, addr: string, value: string | number) {
  const cell = ws.getCell(addr);
  if (cell.formula) {
    throw new Error(`Refusing to overwrite formula cell ${ws.name}!${addr} (formula: ${cell.formula})`);
  }
  cell.value = value;
}

// Minimal A1-style column letter <-> 0-indexed number helpers -- ExcelJS
// doesn't expose these itself (unlike SheetJS's XLSX.utils).
function decodeCol(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function encodeCol(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function offsetCol(col: string, offset: number): string {
  return encodeCol(decodeCol(col) + offset);
}

function colToAddr(col: string, row: number): string {
  return `${col}${row}`;
}

// Info!B16's dropdown (Version!B75:B82).
const TEMPLATE_CAMPUSES = [
  "DHVSU Apalit",
  "DHVSU Bacolor",
  "DHVSU Candaba",
  "DHVSU Lubao",
  "DHVSU Mexico",
  "DHVSU Porac",
  "DHVSU San Fernando",
  "DHVSU Sto. Tomas",
];

// The template expects Info!B16 in its dropdown's "DHVSU <Name>" form: the
// Summary header drops the first word and appends " Campus" (-> "Mexico
// Campus") and the term-sheet headers append " Campus" too. A class saved as
// "Mexico Campus" therefore printed "Campus Campus" / "Mexico Campus Campus".
// Reduce whatever was typed to the bare name and rebuild that form.
export function normalizeCampus(campus: string | null | undefined): string {
  const name = (campus ?? "")
    .trim()
    .replace(/^(dhvsu|psu|pampanga state university)\s+/i, "")
    .replace(/\s+campus$/i, "")
    .trim();
  if (!name) return "";
  return TEMPLATE_CAMPUSES.find((c) => c.slice("DHVSU ".length).toLowerCase() === name.toLowerCase()) ?? `DHVSU ${name}`;
}

export type DhvsuExportInput = {
  classRow: ClassRow;
  teacher: Teacher;
  students: Student[];
  classData: ClassGradingData;
};

export async function buildDhvsuClassRecord(input: DhvsuExportInput): Promise<Buffer> {
  const { classRow, teacher, students, classData } = input;
  if (students.length > MAX_STUDENTS) {
    throw new Error(`The DHVSU class record template holds at most ${MAX_STUDENTS} students; this class has ${students.length}.`);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  // Cached formula results in the template are stale the moment any input
  // changes -- make Excel recompute everything when the file is opened.
  wb.calcProperties.fullCalcOnLoad = true;

  clearTemplateSampleData(wb);
  fillInfoSheet(wb, classRow, teacher, classData);
  patchClassStandingFormulas(wb);
  fillStudentList(wb, students);
  for (const period of ["midterm", "finals"] as const) {
    const plan = buildTermPlan(classData, period);
    fillTermSheet(wb, period, students, plan);
    fillAttendanceSheet(wb, period, students, plan);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function sheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`Template is missing expected sheet "${name}"`);
  return ws;
}

function clearInputs(ws: ExcelJS.Worksheet, fromCol: string, toCol: string, fromRow: number, toRow: number) {
  for (let r = fromRow; r <= toRow; r++) {
    for (let c = decodeCol(fromCol); c <= decodeCol(toCol); c++) {
      const cell = ws.getCell(colToAddr(encodeCol(c), r));
      if (!cell.formula && cell.value != null && !cell.isMerged) cell.value = null;
    }
  }
}

// The shipped template still carries someone's sample entries (max scores
// in O5/T5/Z5/AP5, scores in row 6, a +2 bonus in Midterm!AR6 and
// Summary!M12, a stray "11" date on MT Attendance). Any max score left in a
// slot makes that slot count as a 0 for every student, so wipe every input
// cell (never formulas) before writing.
function clearTemplateSampleData(wb: ExcelJS.Workbook) {
  for (const period of ["midterm", "finals"] as const) {
    const term = sheet(wb, TERM_SHEETS[period].score);
    for (const c of DHVSU_CATEGORIES) {
      const first = CATEGORY_COLUMN[c];
      const last = offsetCol(first, SLOT_CAPACITY[c] - 1);
      clearInputs(term, first, last, 2, 3);
      clearInputs(term, first, last, 5, STUDENT_ROW_START + MAX_STUDENTS - 1);
    }
    clearInputs(term, "AR", "AR", STUDENT_ROW_START, STUDENT_ROW_START + MAX_STUDENTS - 1);

    const attendance = sheet(wb, TERM_SHEETS[period].attendance);
    const lastDateCol = offsetCol(ATTENDANCE_DATE_COL_START, MAX_ATTENDANCE_SESSIONS - 1);
    clearInputs(attendance, ATTENDANCE_DATE_COL_START, lastDateCol, 2, 2);
    clearInputs(attendance, ATTENDANCE_DATE_COL_START, lastDateCol, ATTENDANCE_ROW_START, ATTENDANCE_ROW_START + MAX_STUDENTS - 1);
  }
  clearInputs(sheet(wb, "Summary"), "M", "M", SUMMARY_ROW_START, SUMMARY_ROW_START + MAX_STUDENTS - 1);
}

function fillInfoSheet(wb: ExcelJS.Workbook, classRow: ClassRow, teacher: Teacher, classData: ClassGradingData) {
  const ws = sheet(wb, "Info");
  const fields: [string, string][] = [
    ["B3", classRow.name],
    // The template's formulas compare against these exact spellings; a
    // blank or differently-cased value made every score compute as blank.
    ["B4", normalizeProgramType(classRow.program_type)],
    ["B5", classRow.year_level ?? ""],
    ["B6", classRow.course_code ?? ""],
    ["B7", classRow.total_units ?? ""],
    ["B8", classRow.course_type ?? ""],
    ["B9", classRow.subject ?? ""],
    ["B11", classRow.academic_year ?? ""],
    ["B12", classRow.semester ?? ""],
    ["B13", classRow.session_schedule ?? ""],
    ["B16", normalizeCampus(classRow.campus)],
    ["B17", classRow.college ?? ""],
    ["B18", classRow.department ?? ""],
    ["B19", classRow.program ?? ""],
    ["B23", teacher.full_name || teacher.email],
    ["B24", teacher.faculty_rank ?? ""],
  ];
  for (const [addr, value] of fields) setCell(ws, addr, value);

  // The class's own gradebook weights, not the template's built-in
  // 10/30/30/10/10/10 -- this is what keeps the file's grades equal to the
  // app's (lib/dhvsu-grade.ts).
  const config = classData.config;
  for (const [key, row] of Object.entries(INFO_WEIGHT_ROW) as [DhvsuCategory | "attendance", number][]) {
    setCell(ws, `B${row}`, (Number(config?.[WEIGHT_FIELD[key]]) || 0) / 100);
  }
  // The criteria names the teacher picked in Setup (an unused 5th
  // criterion stays blank, like the template's own empty row 45).
  for (const slot of CLASS_STANDING_SLOTS) {
    setCell(ws, `A${slot.infoRow}`, isCriterionActive(config, slot.key) ? criterionLabel(config, slot.key) : "");
  }
  // Midterm/Finals split: the template derives 50/50 (or 40/60 for 2nd+
  // year Engineering) from a formula; the class's Setup tab is the source
  // of truth instead, so these two formulas are deliberately replaced.
  replaceFormulaWithValue(ws, "B34", (Number(config?.midterm_weight) || 0) / 100);
  replaceFormulaWithValue(ws, "B35", (Number(config?.finals_weight) || 0) / 100);
}

// The only formula cells this export ever replaces, each named on purpose.
function replaceFormulaWithValue(ws: ExcelJS.Worksheet, addr: string, value: number) {
  ws.getCell(addr).value = value;
}

// The Class Standing display column (AL) divides by a hardcoded 60, i.e.
// assumes class standing is always 60% of the grade. Point it at the real
// class-standing total (Info!B40) so it stays right under any weights. AL
// is display-only -- the term grade (AS) sums the categories directly.
function patchClassStandingFormulas(wb: ExcelJS.Workbook) {
  for (const name of ["MidCom", "FinCom"]) {
    const ws = sheet(wb, name);
    for (let r = STUDENT_ROW_START; r < STUDENT_ROW_START + MAX_STUDENTS; r++) {
      const cell = ws.getCell(`AL${r}`);
      if (cell.formula?.includes("(100 / 60)")) {
        cell.value = { formula: cell.formula.replaceAll("(100 / 60)", "(1 / Info!$B$40)") };
      }
    }
  }
}

function fillStudentList(wb: ExcelJS.Workbook, students: Student[]) {
  const ws = sheet(wb, "Student List");
  students.forEach((student, i) => {
    const row = STUDENT_LIST_ROW_START + 1 + i;
    setCell(ws, `A${row}`, i + 1);
    setCell(ws, `B${row}`, student.code);
    setCell(ws, `C${row}`, student.name);
  });
}

// With a max of exactly 100 the template looks the raw score up in the
// transmutation table by exact match, so a score like 78.5 would be #N/A
// and zero out the whole category. Scaling such a slot by 10 (max 1000)
// sends it down the template's FLOOR(score/max*100) path instead, which is
// the same math lib/dhvsu-grade.ts uses.
function slotScale(slot: Slot): number {
  if (slot.max !== 100) return 1;
  for (const v of slot.scores.values()) {
    if (v != null && !Number.isInteger(v)) return 10;
  }
  return 1;
}

function fillTermSheet(wb: ExcelJS.Workbook, period: DhvsuPeriod, students: Student[], plan: TermPlan) {
  const ws = sheet(wb, TERM_SHEETS[period].score);

  students.forEach((student, i) => {
    setCell(ws, `A${STUDENT_ROW_START + i}`, i + 1);
    // The "+" Adjustments column, which MidCom/FinCom!AS adds onto the
    // term grade -- entered in the gradebook Overview.
    const adjustment = plan.adjustments.get(student.id);
    if (adjustment) setCell(ws, `AR${STUDENT_ROW_START + i}`, adjustment);
  });

  for (const c of DHVSU_CATEGORIES) {
    plan.slots[c].forEach((slot, slotIndex) => {
      const col = offsetCol(CATEGORY_COLUMN[c], slotIndex);
      const scale = slotScale(slot);
      setCell(ws, colToAddr(col, 2), slot.label);
      if (slot.date) setCell(ws, colToAddr(col, 3), slot.date);
      setCell(ws, colToAddr(col, 5), slot.max * scale);
      students.forEach((student, i) => {
        const score = slot.scores.get(student.id);
        if (score != null) setCell(ws, colToAddr(col, STUDENT_ROW_START + i), score * scale);
      });
    });
  }
}

function fillAttendanceSheet(wb: ExcelJS.Workbook, period: DhvsuPeriod, students: Student[], plan: TermPlan) {
  const ws = sheet(wb, TERM_SHEETS[period].attendance);
  if (plan.sessionDates.length > MAX_ATTENDANCE_SESSIONS) {
    throw new Error(
      `The DHVSU template has room for ${MAX_ATTENDANCE_SESSIONS} class dates per term; this class has ${plan.sessionDates.length} in the ${period === "midterm" ? "midterm" : "final term"}.`,
    );
  }

  plan.sessionDates.forEach((date, dateIndex) => {
    setCell(ws, colToAddr(offsetCol(ATTENDANCE_DATE_COL_START, dateIndex), 2), date);
  });

  students.forEach((student, i) => {
    const row = ATTENDANCE_ROW_START + i;
    setCell(ws, `A${row}`, i + 1);
    const byDate = plan.attendance.get(student.id);
    plan.sessionDates.forEach((date, dateIndex) => {
      const status = byDate?.get(date);
      if (!status) return;
      setCell(ws, colToAddr(offsetCol(ATTENDANCE_DATE_COL_START, dateIndex), row), STATUS_CODE[status]);
    });
  });
}
