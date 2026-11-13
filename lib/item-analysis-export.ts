// Builds the "Results of Item Analysis" report as .xlsx (filled into the
// school's template, lib/templates/item-analysis.xlsx), .docx and .pdf. The
// Word and PDF versions redraw the template's Multiple Choice sheet. Server
// only (reads the template and logos from disk).

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { jsPDF } from "jspdf";
import {
  REPORT_MAX_ITEMS,
  REPORT_MAX_PT_STUDENTS,
  templateDecision,
  type ItemAnalysisReport,
  type Signatory,
} from "./item-analysis-report";

const TEMPLATES = path.join(process.cwd(), "lib/templates");
const TEMPLATE_PATH = path.join(TEMPLATES, "item-analysis.xlsx");
const LOGO_LEFT = path.join(TEMPLATES, "item-analysis-logo-left.jpg");
const LOGO_RIGHT = path.join(TEMPLATES, "item-analysis-logo-right.png");
const NAVY = "112D4E";

const fmt2 = (x: number) => x.toFixed(2);

// ---------------------------------------------------------------- Excel ----

// Template layout (Multiple Choice / Performance Task share rows 2-12).
const MC_FIRST_ROW = 17; // item 1
const PT_FIRST_ROW = 15; // student 1

function setHeader(ws: ExcelJS.Worksheet, r: ItemAnalysisReport, studentCount: number) {
  ws.getCell("A2").value = r.header.schoolName;
  ws.getCell("A3").value = r.header.campus;
  ws.getCell("A4").value = r.header.address;
  ws.getCell("C8").value = r.header.academicYear;
  ws.getCell("C9").value = r.header.program;
  ws.getCell("C10").value = r.header.course;
  ws.getCell("C11").value = r.header.yearSection;
  ws.getCell("C12").value = studentCount;
}

function setSignatories(
  ws: ExcelJS.Worksheet,
  r: ItemAnalysisReport,
  cells: { left: string; right: string; rows: [number, number, number, number] },
) {
  const [nameTop, titleTop, nameBottom, titleBottom] = cells.rows;
  const put = (col: string, nameRow: number, titleRow: number, s: Signatory) => {
    ws.getCell(`${col}${nameRow}`).value = s.name.toUpperCase() || null;
    ws.getCell(`${col}${titleRow}`).value = s.title || null;
  };
  put(cells.left, nameTop, titleTop, r.signatories.prepared);
  put(cells.right, nameTop, titleTop, r.signatories.checked);
  put(cells.left, nameBottom, titleBottom, r.signatories.recommending);
  put(cells.right, nameBottom, titleBottom, r.signatories.approved);
}

// A formula cell keeps its formula (and, for a shared-formula master, its
// sharing) but drops the template's cached sample result.
function clearCachedResult(cell: ExcelJS.Cell) {
  const v = cell.value;
  if (v && typeof v === "object" && ("formula" in v || "sharedFormula" in v)) {
    cell.value = { ...v, result: undefined } as ExcelJS.CellValue;
  }
}

export async function buildItemAnalysisXlsx(r: ItemAnalysisReport): Promise<Buffer> {
  if (r.itemCount > REPORT_MAX_ITEMS) {
    throw new Error(`The item analysis template has room for ${REPORT_MAX_ITEMS} items; this exam has ${r.itemCount}.`);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);
  // Excel recomputes every formula on open, so nothing depends on cached results.
  wb.calcProperties.fullCalcOnLoad = true;

  // --- Multiple Choice: correct counts + key; Difficulty/Decision stay
  // template formulas, written per row (with results, for viewers that don't
  // recalculate) instead of the template's shared formulas.
  const mc = wb.getWorksheet("Multiple Choice")!;
  setHeader(mc, r, r.examinees);
  mc.getCell("A7").value = r.header.examLabel;
  for (let item = 1; item <= REPORT_MAX_ITEMS; item++) {
    const row = MC_FIRST_ROW + item - 1;
    const data = r.rows[item - 1];
    mc.getCell(`B${row}`).value = data ? data.correct : null;
    mc.getCell(`C${row}`).value = {
      formula: `IF(B${row}="","",IFERROR(B${row}/$C$12,""))`,
      result: data && r.examinees ? data.difficulty : "",
    };
    mc.getCell(`D${row}`).value = {
      formula: `IF(C${row}="","",IF(C${row}<0.3,"Review: Difficult",IF(C${row}<=0.7,"Retain /Review","Review: Easy")))`,
      result: data && r.examinees ? templateDecision(data.difficulty) : "",
    };
    mc.getCell(`E${row}`).value = data?.key || null;
  }
  setSignatories(mc, r, { left: "A", right: "E", rows: [120, 121, 125, 126] });

  // --- Performance Task: the class roster, ratings left blank for the teacher.
  const pt = wb.getWorksheet("Performance Task")!;
  const roster = r.rosterNames.slice(0, REPORT_MAX_PT_STUDENTS);
  setHeader(pt, r, roster.length);
  for (let i = 0; i < REPORT_MAX_PT_STUDENTS; i++) {
    const row = PT_FIRST_ROW + i;
    pt.getCell(`B${row}`).value = roster[i] ?? null;
    for (const col of ["C", "D", "E", "F", "G"]) pt.getCell(`${col}${row}`).value = null;
    for (const col of ["H", "I", "J"]) clearCachedResult(pt.getCell(`${col}${row}`));
  }
  setSignatories(pt, r, { left: "B", right: "F", rows: [93, 94, 98, 99] });

  // --- PT-Analysis Summary: the template's formulas stop at row 54 (40
  // students) although the Performance Task sheet has 75 rows -- widen them.
  const summary = wb.getWorksheet("PT-Analysis Summary")!;
  summary.eachRow((row) =>
    row.eachCell((cell) => {
      const v = cell.value;
      if (v && typeof v === "object" && "formula" in v && typeof v.formula === "string") {
        cell.value = {
          formula: v.formula.replace(/([A-J]\$?)54\b/g, (_: string, col: string) => `${col}89`),
        } as ExcelJS.CellValue;
      }
    }),
  );

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ----------------------------------------------------------------- Word ----

const FONT = "Cambria";
// Letter page (12240 twips) minus 0.75in margins each side. Fixed twip widths
// (not percentages) so Word, Pages and previews all lay tables out the same.
const CONTENT_DXA = 12240 - 2 * 1080;
const dxa = (percent: number) => Math.round((CONTENT_DXA * percent) / 100);
function fixedTable(percents: number[], rows: TableRow[], borders?: object) {
  return new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    columnWidths: percents.map(dxa),
    layout: TableLayoutType.FIXED,
    ...(borders ? { borders } : {}),
    rows,
  });
}
const NO_TABLE_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
const LINE = { style: BorderStyle.SINGLE, size: 6, color: "000000" };
const LINES = { top: LINE, bottom: LINE, left: LINE, right: LINE };

function text(t: string, opts: { bold?: boolean; size?: number; italics?: boolean; color?: string } = {}) {
  return new TextRun({
    text: t,
    font: FONT,
    size: (opts.size ?? 12) * 2,
    bold: opts.bold,
    italics: opts.italics,
    color: opts.color,
  });
}

function para(
  t: string,
  opts: {
    bold?: boolean;
    size?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    after?: number;
  } = {},
) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: { after: opts.after ?? 0 },
    children: [text(t, opts)],
  });
}

function cell(
  children: Paragraph[],
  opts: { width?: number; borders?: typeof LINES | typeof NO_BORDERS; fill?: string; columnSpan?: number } = {},
) {
  return new TableCell({
    children,
    width: opts.width ? { size: dxa(opts.width), type: WidthType.DXA } : undefined,
    borders: opts.borders ?? NO_BORDERS,
    shading: opts.fill ? { type: ShadingType.CLEAR, color: "auto", fill: opts.fill } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: opts.columnSpan,
  });
}

function signatureBlock(r: ItemAnalysisReport): Table {
  const s = r.signatories;
  const block = (label: string, sig: Signatory) => [
    para(label),
    para(""),
    para(sig.name.toUpperCase() || " ", { bold: true }),
    para(sig.title || " "),
    para(""),
  ];
  return fixedTable(
    [50, 50],
    [
      new TableRow({
        children: [
          cell(block("Prepared:", s.prepared), { width: 50 }),
          cell(block("Checked and Reviewed:", s.checked), { width: 50 }),
        ],
      }),
      new TableRow({
        children: [
          cell(block("Recommending Approval:", s.recommending), { width: 50 }),
          cell(block("Approved:", s.approved), { width: 50 }),
        ],
      }),
    ],
    NO_TABLE_BORDERS,
  );
}

export async function buildItemAnalysisDocx(r: ItemAnalysisReport): Promise<Buffer> {
  const logo = (file: string, type: "jpg" | "png") =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ type, data: fs.readFileSync(file), transformation: { width: 72, height: 72 } })],
    });

  const letterhead = fixedTable(
    [18, 64, 18],
    [
      new TableRow({
        children: [
          cell([logo(LOGO_LEFT, "jpg")], { width: 18 }),
          cell(
            [
              para(r.header.schoolName, { bold: true, size: 14, align: AlignmentType.CENTER }),
              para(r.header.campus, { bold: true, align: AlignmentType.CENTER }),
              para(r.header.address, { align: AlignmentType.CENTER }),
            ],
            { width: 64 },
          ),
          cell([logo(LOGO_RIGHT, "png")], { width: 18 }),
        ],
      }),
    ],
    NO_TABLE_BORDERS,
  );

  const info = fixedTable(
    [30, 70],
    (
      [
        ["Academic Year", r.header.academicYear],
        ["Program", r.header.program],
        ["Course", r.header.course],
        ["Year and Section", r.header.yearSection],
        ["Number of Students", String(r.examinees)],
      ] as const
    ).map(
      ([label, value]) =>
        new TableRow({
          children: [
            cell([para(label)], { width: 30, borders: LINES }),
            cell([para(value || " ", { align: AlignmentType.CENTER })], { width: 70, borders: LINES }),
          ],
        }),
    ),
  );

  const widths = [10, 16, 16, 28, 30];
  const header = new TableRow({
    tableHeader: true,
    children: ["Item", "Correct", "Difficulty", "Decision", "Answer Key"].map((h, i) =>
      cell(
        [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [text(h, { bold: true, color: "FFFFFF" })],
          }),
        ],
        { width: widths[i], borders: LINES, fill: NAVY },
      ),
    ),
  });
  const results = fixedTable(widths, [
    header,
    ...r.rows.map(
      (row) =>
        new TableRow({
          cantSplit: true,
          children: [
            String(row.item),
            String(row.correct),
            r.examinees ? fmt2(row.difficulty) : "",
            r.examinees ? row.decision : "",
            row.key,
          ].map((v, i) =>
            cell([para(v || " ", { align: AlignmentType.CENTER })], { width: widths[i], borders: LINES }),
          ),
        }),
    ),
  ]);

  const doc = new Document({
    creator: "GAINS",
    title: `Results of Item Analysis — ${r.header.examLabel}`,
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 }, // Letter, twips
            margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
          },
        },
        children: [
          letterhead,
          para("", { after: 120 }),
          para("RESULTS OF ITEM ANALYSIS", { bold: true, align: AlignmentType.CENTER }),
          para(r.header.examLabel, { align: AlignmentType.CENTER, after: 200 }),
          info,
          para("", { after: 200 }),
          results,
          para("", { after: 360 }),
          signatureBlock(r),
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

// ------------------------------------------------------------------ PDF ----

export function buildItemAnalysisPdf(r: ItemAnalysisReport): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 54; // 0.75in margins
  const contentW = W - M * 2;
  doc.setFont("times", "normal");

  const center = (t: string, y: number, size: number, bold = false) => {
    doc.setFont("times", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(t, W / 2, y, { align: "center" });
  };

  // Letterhead
  const logoSize = 58;
  doc.addImage(fs.readFileSync(LOGO_LEFT).toString("base64"), "JPEG", M + 20, M - 6, logoSize, logoSize);
  doc.addImage(fs.readFileSync(LOGO_RIGHT).toString("base64"), "PNG", W - M - 20 - logoSize, M - 6, logoSize, logoSize);
  center(r.header.schoolName, M + 12, 14, true);
  center(r.header.campus, M + 28, 12, true);
  center(r.header.address, M + 43, 12);
  center("RESULTS OF ITEM ANALYSIS", M + 80, 12, true);
  center(r.header.examLabel, M + 96, 11);

  // Class info
  let y = M + 112;
  const rowH = 18;
  const labelW = contentW * 0.3;
  doc.setLineWidth(0.6);
  const info: [string, string][] = [
    ["Academic Year", r.header.academicYear],
    ["Program", r.header.program],
    ["Course", r.header.course],
    ["Year and Section", r.header.yearSection],
    ["Number of Students", String(r.examinees)],
  ];
  doc.setFontSize(11);
  for (const [label, value] of info) {
    doc.rect(M, y, labelW, rowH);
    doc.rect(M + labelW, y, contentW - labelW, rowH);
    doc.setFont("times", "normal");
    doc.text(label, M + 5, y + 12.5);
    const fitted = doc.splitTextToSize(value, contentW - labelW - 10)[0] ?? "";
    doc.text(fitted, M + labelW + (contentW - labelW) / 2, y + 12.5, { align: "center" });
    y += rowH;
  }
  y += 18;

  // Results table, repeating its header on each page.
  const cols = [0.1, 0.16, 0.16, 0.28, 0.3].map((f) => f * contentW);
  const xs = cols.map((_, i) => M + cols.slice(0, i).reduce((a, b) => a + b, 0));
  const drawHeader = () => {
    doc.setFillColor(`#${NAVY}`);
    doc.rect(M, y, contentW, rowH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("times", "bold");
    ["Item", "Correct", "Difficulty", "Decision", "Answer Key"].forEach((h, i) =>
      doc.text(h, xs[i] + cols[i] / 2, y + 12.5, { align: "center" }),
    );
    doc.setTextColor(0, 0, 0);
    doc.setFont("times", "normal");
    y += rowH;
  };
  drawHeader();
  const tableRowH = 16;
  for (const row of r.rows) {
    if (y + tableRowH > H - M) {
      doc.addPage();
      y = M;
      drawHeader();
    }
    const values = [
      String(row.item),
      String(row.correct),
      r.examinees ? fmt2(row.difficulty) : "",
      r.examinees ? row.decision : "",
      row.key,
    ];
    values.forEach((v, i) => {
      doc.rect(xs[i], y, cols[i], tableRowH);
      if (v) doc.text(v, xs[i] + cols[i] / 2, y + 11.5, { align: "center" });
    });
    y += tableRowH;
  }

  // Signatories (kept together on one page).
  const sigH = 150;
  y += 30;
  if (y + sigH > H - M) {
    doc.addPage();
    y = M;
  }
  const half = contentW / 2;
  const sig = (x: number, top: number, label: string, s: Signatory) => {
    doc.setFont("times", "normal");
    doc.text(label, x, top);
    doc.setFont("times", "bold");
    doc.text(s.name.toUpperCase(), x, top + 34);
    doc.setFont("times", "normal");
    doc.text(s.title, x, top + 48);
  };
  sig(M, y, "Prepared:", r.signatories.prepared);
  sig(M + half, y, "Checked and Reviewed:", r.signatories.checked);
  sig(M, y + 80, "Recommending Approval:", r.signatories.recommending);
  sig(M + half, y + 80, "Approved:", r.signatories.approved);

  return Buffer.from(doc.output("arraybuffer"));
}
