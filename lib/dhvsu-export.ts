import ExcelJS from "exceljs";
import path from "path";
import { buildRecordCardData, periodForDate, type ClassGradingData, type GridEntry } from "@/lib/record-card-data";
import type { Attendance, AttendanceStatus, ClassRow, Student, Teacher } from "@/lib/types";

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

// This template's visual category label sits one slot-block AHEAD of its
// actual data-entry column -- verified against MidCom/FinCom's own
// AVERAGEIF formulas (e.g. the "QUIZZES" header merge is at column M, but
// MidCom!M6 averages H6:L6, not N6:R6). We always write into the first
// column of each block, pairing a max-score of 100 (row 5) with an
// already-normalized percentage (row 6+), so the per-slot validation
// formula in that same column always finds a matching, non-blank max.
const CATEGORY_COLUMN = {
  quiz: "H",
  recitation: "N",
  other: "T",
  activities: "Z",
  majorExam: "AM",
} as const;

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

function average(entries: GridEntry[], period: DhvsuPeriod): number | null {
  const withScores = entries.filter((e) => e.period === period && e.score != null && e.maxScore > 0);
  if (withScores.length === 0) return null;
  const pct = withScores.map((e) => (e.score! / e.maxScore) * 100);
  const avg = pct.reduce((a, b) => a + b, 0) / pct.length;
  return Math.round(avg * 100) / 100;
}

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

export type DhvsuExportInput = {
  classRow: ClassRow;
  teacher: Teacher;
  students: Student[];
  classData: ClassGradingData;
};

export async function buildDhvsuClassRecord(input: DhvsuExportInput): Promise<Buffer> {
  const { classRow, teacher, students, classData } = input;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  fillInfoSheet(wb, classRow, teacher);
  fillStudentList(wb, students);
  fillTermSheet(wb, "midterm", students, classData);
  fillTermSheet(wb, "finals", students, classData);
  fillAttendanceSheet(wb, "midterm", students, classData);
  fillAttendanceSheet(wb, "finals", students, classData);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function sheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`Template is missing expected sheet "${name}"`);
  return ws;
}

function fillInfoSheet(wb: ExcelJS.Workbook, classRow: ClassRow, teacher: Teacher) {
  const ws = sheet(wb, "Info");
  const fields: [string, string][] = [
    ["B3", classRow.name],
    ["B4", classRow.program_type ?? ""],
    ["B5", classRow.year_level ?? ""],
    ["B6", classRow.course_code ?? ""],
    ["B7", classRow.total_units ?? ""],
    ["B8", classRow.course_type ?? ""],
    ["B9", classRow.subject ?? ""],
    ["B11", classRow.academic_year ?? ""],
    ["B12", classRow.semester ?? ""],
    ["B13", classRow.session_schedule ?? ""],
    ["B16", classRow.campus ?? ""],
    ["B17", classRow.college ?? ""],
    ["B18", classRow.department ?? ""],
    ["B19", classRow.program ?? ""],
    ["B23", teacher.full_name || teacher.email],
    ["B24", teacher.faculty_rank ?? ""],
  ];
  for (const [addr, value] of fields) setCell(ws, addr, value);
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

function fillTermSheet(
  wb: ExcelJS.Workbook,
  period: DhvsuPeriod,
  students: Student[],
  classData: ClassGradingData,
) {
  const ws = sheet(wb, TERM_SHEETS[period].score);

  students.forEach((student, i) => {
    const row = STUDENT_ROW_START + i;
    setCell(ws, `A${row}`, i + 1);

    const data = buildRecordCardData(student, classData);
    const otherEntries = [...data.writtenEntries, ...data.labEntries];
    const majorExamScore = period === "midterm" ? data.majorExam.midtermScore : data.majorExam.finalsScore;
    const majorExamMax = period === "midterm" ? data.majorExam.midtermMax : data.majorExam.finalsMax;
    const majorExamPct =
      majorExamScore != null && majorExamMax
        ? Math.round((majorExamScore / majorExamMax) * 10000) / 100
        : null;

    const categoryValues: [string, number | null][] = [
      [CATEGORY_COLUMN.quiz, average(data.quizEntries, period)],
      [CATEGORY_COLUMN.recitation, average(data.recitationEntries, period)],
      [CATEGORY_COLUMN.other, average(otherEntries, period)],
      [CATEGORY_COLUMN.activities, average(data.assignmentEntries, period)],
      [CATEGORY_COLUMN.majorExam, majorExamPct],
    ];

    for (const [col, value] of categoryValues) {
      if (value == null) continue;
      setCell(ws, colToAddr(col, 5), 100);
      setCell(ws, colToAddr(col, row), value);
    }
  });
}

function fillAttendanceSheet(
  wb: ExcelJS.Workbook,
  period: DhvsuPeriod,
  students: Student[],
  classData: ClassGradingData,
) {
  const ws = sheet(wb, TERM_SHEETS[period].attendance);
  const cutoffs = classData.config ?? {
    use_prelims: false,
    prelim_end_date: null,
    midterm_end_date: null,
  };

  const periodAttendance = classData.attendance.filter(
    (a) => periodForDate(a.date, cutoffs) === period,
  );
  const sessionDates = Array.from(new Set(periodAttendance.map((a) => a.date))).sort();

  sessionDates.forEach((date, dateIndex) => {
    const col = offsetCol(ATTENDANCE_DATE_COL_START, dateIndex);
    setCell(ws, colToAddr(col, 2), date);
  });

  const byStudentDate = new Map<string, Attendance>();
  for (const a of periodAttendance) byStudentDate.set(`${a.student_id}_${a.date}`, a);

  students.forEach((student, i) => {
    const row = ATTENDANCE_ROW_START + i;
    setCell(ws, `A${row}`, i + 1);

    sessionDates.forEach((date, dateIndex) => {
      const record = byStudentDate.get(`${student.id}_${date}`);
      if (!record) return;
      const col = offsetCol(ATTENDANCE_DATE_COL_START, dateIndex);
      setCell(ws, colToAddr(col, row), STATUS_CODE[record.status]);
    });
  });
}
