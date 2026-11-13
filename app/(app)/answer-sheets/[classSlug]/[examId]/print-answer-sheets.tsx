"use client";

import Link from "next/link";
import { useState } from "react";
import type { MajorExam, Student } from "@/lib/types";
import { MAX_SHEET_ITEMS, answerKeyQrValue, majorExamLabel, sheetOptionCount, sheetQrValue } from "@/lib/omr-sheet";
import { PAPER_SIZES, type PaperSize } from "@/lib/paper-sizes";
import AnswerSheetSvg from "@/app/_components/answer-sheet-svg";
import Button from "@/app/_components/button";
import { Input, Select } from "@/app/_components/input";

type Who = "students" | "blank" | "key";

type SheetSpec = {
  key: string;
  studentName?: string;
  studentCode?: string;
  qrValue?: string;
  answerKeySheet?: boolean;
};

export default function PrintAnswerSheets({
  classSlug,
  classTitle,
  exam,
  students,
}: {
  classSlug: string;
  classTitle: string;
  exam: MajorExam;
  students: Student[];
}) {
  const [paperSize, setPaperSize] = useState<PaperSize>("short");
  const [who, setWho] = useState<Who>("students");
  const [blankCount, setBlankCount] = useState("5");
  const [optionCount, setOptionCount] = useState<4 | 5>(sheetOptionCount(exam.answer_key));
  const itemCount = exam.item_count ?? 0;
  const examLabel = majorExamLabel(exam.period, exam.kind);
  const backHref = `/gradebook/${classSlug}?tab=major-exam`;

  if (!itemCount || itemCount > MAX_SHEET_ITEMS) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Answer sheets</h1>
        <p className="mt-2 text-sm text-ink/70">
          {itemCount
            ? `Bubble sheets fit up to ${MAX_SHEET_ITEMS} items; this exam has ${itemCount}.`
            : "Set the number of items (and the answer key) first, in Gradebook → Major Exam → Item analysis."}
        </p>
        <Link href={backHref} className="mt-4 inline-block text-sm font-medium text-navy underline">
          Back to Major Exam
        </Link>
      </div>
    );
  }

  const blanks = Math.max(1, Math.min(200, Number(blankCount) || 1));
  const sheets: SheetSpec[] =
    who === "key"
      ? [{ key: "answer-key", qrValue: answerKeyQrValue(exam.id), answerKeySheet: true }]
      : who === "students"
        ? students.map((s) => ({
            key: s.id,
            studentName: s.name,
            studentCode: s.code,
            qrValue: sheetQrValue(exam.id, s.code),
          }))
        : Array.from({ length: blanks }, (_, i) => ({ key: `blank-${i}` }));

  return (
    <div>
      <style>{`@page { size: ${PAPER_SIZES[paperSize].css}; margin: 0.3in; }`}</style>

      <div className="no-print mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6">
        <div>
          <Link href={backHref} className="text-sm text-muted hover:text-ink">
            ← Major Exam
          </Link>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink">Answer sheets — {examLabel}</h1>
          <p className="text-sm text-ink/60">
            {classTitle} · {itemCount} items · one sheet per page. Print at 100% scale (no &ldquo;fit to page&rdquo;),
            then scan the shaded sheets with your phone.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
            Sheets for
            <Select value={who} onChange={(e) => setWho(e.target.value as Who)} className="!w-auto !py-1.5">
              <option value="students">Each student ({students.length}, name + QR)</option>
              <option value="blank">Blank sheets (no names)</option>
              <option value="key">Answer key (teacher)</option>
            </Select>
          </label>
          {who === "key" && (
            <p className="text-xs text-muted">
              Shade the correct answer for every item on this sheet, then scan it first — the scanner saves it as the
              answer key and checks every student&apos;s sheet against it.
            </p>
          )}
          {who === "blank" && (
            <label className="flex w-24 flex-col gap-1 text-xs font-semibold text-ink">
              How many
              <Input
                type="number"
                min={1}
                max={200}
                value={blankCount}
                onChange={(e) => setBlankCount(e.target.value)}
                className="!py-1.5 font-mono"
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
            Choices
            <Select
              value={optionCount}
              onChange={(e) => setOptionCount(Number(e.target.value) as 4 | 5)}
              className="!w-auto !py-1.5"
            >
              <option value={4}>A–D</option>
              <option value={5}>A–E</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
            Paper size
            <Select
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as PaperSize)}
              className="!w-auto !py-1.5"
            >
              {Object.entries(PAPER_SIZES).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <Button variant="highlight" onClick={() => window.print()} disabled={sheets.length === 0}>
            Print {sheets.length} sheet{sheets.length === 1 ? "" : "s"}
          </Button>
          <Button variant="primary" href={`/answer-sheets/${classSlug}/${exam.id}/scan`}>
            Scan sheets
          </Button>
        </div>
        {optionCount === 4 && exam.answer_key?.includes("E") && (
          <p className="text-sm text-danger">The answer key uses E — print A–E sheets.</p>
        )}
        {who === "key" && (
          <p className="text-xs text-muted">
            Shade the correct answer for every item on this sheet, then scan it first — the scanner saves it as the
            answer key and checks every student&apos;s sheet against it.
          </p>
        )}
        {who === "blank" && (
          <p className="text-xs text-muted">
            Blank sheets have no QR code; you pick the student on your phone after each scan.
          </p>
        )}
      </div>

      <div id="omr-print" className="mx-auto flex max-w-4xl flex-col gap-6 px-4 pb-10 sm:px-6">
        {sheets.map((s) => (
          <div key={s.key} className="omr-sheet border border-line bg-white p-2 shadow-sm">
            <AnswerSheetSvg
              itemCount={itemCount}
              optionCount={optionCount}
              title={classTitle}
              examLabel={examLabel}
              studentName={s.studentName}
              studentCode={s.studentCode}
              qrValue={s.qrValue}
              answerKeySheet={s.answerKeySheet}
            />
          </div>
        ))}
        {sheets.length === 0 && <p className="text-sm text-muted">No students in this class yet.</p>}
      </div>
    </div>
  );
}
