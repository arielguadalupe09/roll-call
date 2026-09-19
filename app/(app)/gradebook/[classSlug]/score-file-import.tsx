"use client";

import { useRef, useState } from "react";
import type { Student } from "@/lib/types";
import Button from "@/app/_components/button";
import { useToast } from "@/app/_components/toast";
import { readScoreFile } from "@/lib/score-file";
import { extractScoreRows, matchScoresToRoster, type ScoreMatchResult } from "@/lib/score-import";

type Summary = {
  fileName: string;
  rowsRead: number;
  filled: number;
  replaced: number;
  blankInFile: number;
  result: ScoreMatchResult;
};

// Upload an Excel/Word score sheet: matched students' boxes are filled in as
// unsaved edits (the same state a typed or pasted score is in), so the
// teacher reviews the table and clicks Save all -- nothing is written here.
export default function ScoreFileImport({
  students,
  currentScores,
  onScoreChange,
}: {
  students: Student[];
  currentScores: Record<string, string>;
  onScoreChange: (studentId: string, value: string) => void;
}) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setSummary(null);
    try {
      const matrix = await readScoreFile(file);
      const fileRows = extractScoreRows(matrix);
      if (fileRows.length === 0) {
        showToast("Couldn't find student names and scores in that file. Check it has a name column and a score column.");
        return;
      }
      const result = matchScoresToRoster(fileRows, students);
      let filled = 0;
      let replaced = 0;
      let blankInFile = 0;
      for (const m of result.matches) {
        if (m.score === "") {
          blankInFile += 1;
          continue;
        }
        const existing = (currentScores[m.studentId] ?? "").trim();
        if (existing !== "" && existing !== m.score) replaced += 1;
        onScoreChange(m.studentId, m.score);
        filled += 1;
      }
      setSummary({ fileName: file.name, rowsRead: fileRows.length, filled, replaced, blankInFile, result });
      showToast(`Filled ${filled} score${filled === 1 ? "" : "s"} from ${file.name} — review, then Save all.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const loose = summary?.result.matches.filter((m) => m.loose && m.score !== "") ?? [];

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? "Reading file..." : "Upload Excel / Word file"}
      </Button>

      {summary && (
        <div className="mt-3 rounded-[8px] border border-line bg-paper p-3 text-sm text-ink">
          <div className="flex items-start justify-between gap-3">
            <p>
              Read <span className="font-semibold">{summary.rowsRead}</span> rows from{" "}
              <span className="font-semibold">{summary.fileName}</span>. Filled{" "}
              <span className="font-semibold">{summary.filled}</span> score{summary.filled === 1 ? "" : "s"} into the
              boxes below — they&apos;re <span className="font-semibold">not saved yet</span>. Check them, then click
              Save all.
            </p>
            <button onClick={() => setSummary(null)} className="shrink-0 text-xs font-semibold text-slate hover:text-navy">
              Dismiss
            </button>
          </div>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted">
            {summary.replaced > 0 && (
              <li>{summary.replaced} existing score{summary.replaced === 1 ? " was" : "s were"} replaced (still unsaved).</li>
            )}
            {loose.length > 0 && (
              <li>
                Matched by surname and first name only — double-check:{" "}
                {loose.map((m) => `${m.fileName} → ${m.studentName}`).join("; ")}
              </li>
            )}
            {summary.result.unmatched.length > 0 && (
              <li className="text-danger">
                Not found in this class ({summary.result.unmatched.length}) — enter by hand:{" "}
                {summary.result.unmatched.map((r) => `${r.name} (${r.score || "blank"})`).join("; ")}
              </li>
            )}
            {summary.result.ambiguous.length > 0 && (
              <li className="text-danger">
                Unclear match ({summary.result.ambiguous.length}) — skipped, enter by hand:{" "}
                {summary.result.ambiguous.map((r) => `${r.name} (${r.score || "blank"})`).join("; ")}
              </li>
            )}
            {summary.blankInFile > 0 && <li>{summary.blankInFile} student{summary.blankInFile === 1 ? " has" : "s have"} a blank score in the file (left unchanged).</li>}
            {summary.result.missingFromFile.length > 0 && (
              <li>{summary.result.missingFromFile.length} student{summary.result.missingFromFile.length === 1 ? " in" : "s in"} this class {summary.result.missingFromFile.length === 1 ? "isn't" : "aren't"} in the file.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
