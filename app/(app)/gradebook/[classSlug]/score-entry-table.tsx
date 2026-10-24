"use client";

import { useState } from "react";
import type { Student } from "@/lib/types";
import Button from "@/app/_components/button";
import { Input } from "@/app/_components/input";
import { useToast } from "@/app/_components/toast";
import { isValidScore, parseScoreColumn } from "@/lib/score-paste";
import ScoreFileImport from "./score-file-import";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/app/_components/table";

// `dirty` = edited (typed or pasted) since it was last saved.
export type ScoreRow = { score: string; saving: boolean; dirty?: boolean };

export default function ScoreEntryTable({
  students,
  rows,
  maxScore,
  onScoreChange,
  onSave,
  onSaveAll,
}: {
  students: Student[];
  rows: Record<string, ScoreRow>;
  maxScore: number;
  onScoreChange: (studentId: string, value: string) => void;
  onSave: (studentId: string) => void;
  onSaveAll: () => void;
}) {
  const { showToast } = useToast();

  const rowFor = (id: string): ScoreRow => rows[id] ?? { score: "", saving: false };
  const dirtyCount = students.filter((s) => rowFor(s.id).dirty).length;
  const invalidCount = students.filter((s) => !isValidScore(rowFor(s.id).score, maxScore)).length;
  const anySaving = students.some((s) => rowFor(s.id).saving);

  // Pasting a column copied from a spreadsheet fills downward from the box
  // it was pasted into, in the order shown. Nothing is saved until "Save all"
  // (or a row's own Save), so the filled-in table is the preview.
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>, startIndex: number) {
    const text = e.clipboardData.getData("text");
    const values = parseScoreColumn(text);
    if (values.length <= 1) return; // a single value pastes normally

    e.preventDefault();
    let filled = 0;
    let replaced = 0;
    values.forEach((value, i) => {
      if (value === "") return; // blank cell: leave that student alone
      const student = students[startIndex + i];
      if (!student) return;
      const existing = rowFor(student.id).score;
      if (existing.trim() !== "" && existing.trim() !== value) replaced += 1;
      onScoreChange(student.id, value);
      filled += 1;
    });

    const overflow = values.length - (students.length - startIndex);
    let message = `Pasted ${filled} score${filled === 1 ? "" : "s"} — review, then Save all.`;
    if (replaced > 0) message += ` ${replaced} existing score${replaced === 1 ? " was" : "s were"} replaced (not saved yet).`;
    if (overflow > 0) message += ` ${overflow} extra value${overflow === 1 ? " was" : "s were"} ignored.`;
    showToast(message);
  }

  // Same score for the whole class (e.g. everyone got 100 on a lab). Like
  // pasting, it only fills the boxes -- Save all writes it.
  const [sameScore, setSameScore] = useState("");
  const sameScoreValid = sameScore.trim() !== "" && isValidScore(sameScore, maxScore);

  function applyToAll(onlyBlanks: boolean) {
    if (!sameScoreValid) return;
    const value = sameScore.trim();
    let filled = 0;
    for (const s of students) {
      const current = rowFor(s.id).score.trim();
      if (onlyBlanks && current !== "") continue;
      if (current === value) continue;
      onScoreChange(s.id, value);
      filled += 1;
    }
    showToast(
      filled === 0
        ? "Nothing to change — every student already has that score."
        : `Set ${filled} student${filled === 1 ? "" : "s"} to ${value}/${maxScore} — review, then Save all.`,
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-[10px] border border-line/60 bg-paper/60 p-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink">Same score for everyone</span>
          <Input
            type="text"
            inputMode="decimal"
            value={sameScore}
            onChange={(e) => setSameScore(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyToAll(false);
            }}
            placeholder={`0–${maxScore}`}
            aria-invalid={sameScore.trim() !== "" && !sameScoreValid}
            className={`!w-24 font-mono ${sameScore.trim() !== "" && !sameScoreValid ? "border-danger" : ""}`}
          />
        </label>
        <Button variant="secondary" onClick={() => applyToAll(false)} disabled={!sameScoreValid}>
          Apply to all
        </Button>
        <Button variant="secondary" onClick={() => applyToAll(true)} disabled={!sameScoreValid}>
          Fill blanks only
        </Button>
        {sameScore.trim() !== "" && !sameScoreValid && (
          <p className="pb-2 text-xs text-danger">Enter a number from 0 to {maxScore}.</p>
        )}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button onClick={onSaveAll} disabled={dirtyCount === 0 || invalidCount > 0 || anySaving}>
          {anySaving ? "Saving..." : dirtyCount > 0 ? `Save all (${dirtyCount})` : "Save all"}
        </Button>
        {invalidCount > 0 && (
          <p className="text-sm text-danger">
            {invalidCount} score{invalidCount === 1 ? " is" : "s are"} not a number from 0 to {maxScore}.
          </p>
        )}
        <p className="text-xs text-muted">
          Tip: copy a column of scores from Excel or Google Sheets and paste it into the first score box.
        </p>
      </div>
      <div className="mb-3">
        <ScoreFileImport
          students={students}
          currentScores={Object.fromEntries(students.map((s) => [s.id, rowFor(s.id).score]))}
          onScoreChange={onScoreChange}
        />
      </div>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Student</TableHeaderCell>
            <TableHeaderCell>Score / {maxScore}</TableHeaderCell>
            <TableHeaderCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {students.map((s, index) => {
            const row = rowFor(s.id);
            const invalid = !isValidScore(row.score, maxScore);
            return (
              <TableRow key={s.id} striped>
                <TableCell>{s.name}</TableCell>
                <TableCell>
                  <Input
                    // Text (not type="number") so a bad pasted value like "8/10"
                    // stays visible and flagged instead of rendering blank.
                    type="text"
                    inputMode="decimal"
                    value={row.score}
                    onChange={(e) => onScoreChange(s.id, e.target.value)}
                    onPaste={(e) => handlePaste(e, index)}
                    aria-invalid={invalid}
                    className={`!w-20 font-mono ${invalid ? "!border-danger" : ""}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => onSave(s.id)} disabled={row.saving || invalid}>
                      {row.saving ? "Saving..." : "Save"}
                    </Button>
                    {row.dirty && !row.saving && <span className="text-xs text-muted">Unsaved</span>}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {students.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="py-4 text-muted">
                No students in this class yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
