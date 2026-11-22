"use client";

import { useRef, useState } from "react";
import type { Student } from "@/lib/types";
import Button from "@/app/_components/button";
import { useToast } from "@/app/_components/toast";
import { readScoreFile } from "@/lib/score-file";
import { matchScoresToRoster, type ScoreMatchResult } from "@/lib/score-import";
import { pickColumn, rowsForColumn, type SheetReading } from "@/lib/score-ai-read";

type Applied = {
  col: number;
  filled: number;
  replaced: number;
  result: ScoreMatchResult;
  uncertain: string[];
  notes: string[];
};

const IMAGE_MAX_SIDE = 2000;

// Phone photos are often 4-10 MB; shrink to <=2000px JPEG (well under the
// 4.5 MB request cap and plenty for reading handwriting).
async function shrinkImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Couldn't open that photo. Use a JPEG or PNG (on iPhone, set Camera > Formats > Most Compatible).");
  }
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare that photo."))), "image/jpeg", 0.85),
  );
}

// Encoding bot: an AI model transcribes a photo or spreadsheet; matching and
// validation happen here and in matchScoresToRoster. Scores land in the boxes
// as unsaved edits -- the teacher reviews them and clicks Save all.
export default function ScoreAiImport({
  classId,
  title,
  maxScore,
  students,
  currentScores,
  onScoreChange,
}: {
  classId: string;
  title: string;
  maxScore: number;
  students: Student[];
  currentScores: Record<string, string>;
  onScoreChange: (studentId: string, value: string) => void;
}) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState<SheetReading | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);

  function apply(r: SheetReading, col: number) {
    const { rows, uncertain, notes } = rowsForColumn(r, col);
    const result = matchScoresToRoster(rows, students);
    let filled = 0;
    let replaced = 0;
    const unsure: string[] = [];
    for (const m of result.matches) {
      if (m.score === "") continue;
      const existing = (currentScores[m.studentId] ?? "").trim();
      if (existing !== "" && existing !== m.score) replaced += 1;
      onScoreChange(m.studentId, m.score);
      filled += 1;
      if (uncertain.has(m.fileName)) unsure.push(`${m.studentName} (${m.score})`);
    }
    setApplied({ col, filled, replaced, result, uncertain: unsure, notes });
    showToast(`Filled ${filled} score${filled === 1 ? "" : "s"} — review, then Save all.`);
  }

  async function handleFile(file: File) {
    setBusy(true);
    setReading(null);
    setApplied(null);
    setFileName(file.name);
    try {
      let res: Response;
      if (file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
        const body = new FormData();
        body.append("file", await shrinkImage(file), "photo.jpg");
        body.append("classId", classId);
        body.append("title", title);
        res = await fetch("/api/gradebook/ai-read", { method: "POST", body });
      } else {
        const matrix = await readScoreFile(file);
        res = await fetch("/api/gradebook/ai-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId, title, fileName: file.name, matrix }),
        });
      }
      const data = (await res.json().catch(() => null)) as { reading?: SheetReading; error?: string } | null;
      if (!res.ok || !data?.reading) throw new Error(data?.error ?? "Could not read that file.");
      const r = data.reading;
      if (!r.readable) {
        showToast(r.problem || "That doesn't look like a score sheet.");
        return;
      }
      setReading(r);
      const col = pickColumn(r.columns, title);
      if (col >= 0) apply(r, col);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const column = reading && applied ? reading.columns[applied.col] : null;
  const loose = applied?.result.matches.filter((m) => m.loose && m.score !== "") ?? [];

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.xlsx,.xls,.csv,.docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <Button onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? "Reading with AI..." : "Read photo or sheet with AI"}
      </Button>
      <p className="mt-1 text-xs text-muted">
        For photos of paper class records or messy spreadsheets. The file is sent to an outside AI service to read
        it; nothing is saved until you click Save all.
      </p>

      {reading && (
        <div className="mt-3 rounded-[8px] border border-line bg-paper p-3 text-sm text-ink">
          <div className="flex items-start justify-between gap-3">
            <p>
              Read <span className="font-semibold">{reading.rows.length}</span> students and{" "}
              <span className="font-semibold">{reading.columns.length}</span> score column
              {reading.columns.length === 1 ? "" : "s"} from <span className="font-semibold">{fileName}</span>.
            </p>
            <button
              onClick={() => {
                setReading(null);
                setApplied(null);
              }}
              className="shrink-0 text-xs font-semibold text-slate hover:text-navy"
            >
              Dismiss
            </button>
          </div>

          {reading.columns.length > 1 && (
            <label className="mt-2 flex flex-wrap items-center gap-2">
              <span>Column for &ldquo;{title}&rdquo;:</span>
              <select
                className="rounded-[6px] border border-line bg-white px-2 py-1 text-sm"
                value={applied?.col ?? ""}
                onChange={(e) => apply(reading, Number(e.target.value))}
              >
                {!applied && <option value="">Choose a column…</option>}
                {reading.columns.map((c, i) => (
                  <option key={i} value={i}>
                    {c.header || `Column ${i + 1}`}
                    {c.maxScore ? ` (/${c.maxScore})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {applied ? (
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted">
              <li className="text-ink">
                Filled <span className="font-semibold">{applied.filled}</span> score{applied.filled === 1 ? "" : "s"} —{" "}
                <span className="font-semibold">not saved yet</span>. Check them against the sheet, then click Save all.
              </li>
              {column?.maxScore != null && column.maxScore !== maxScore && (
                <li className="text-danger">
                  The sheet says this column is out of {column.maxScore}, but this item is out of {maxScore}. Check the
                  item&apos;s total before saving.
                </li>
              )}
              {applied.uncertain.length > 0 && (
                <li className="text-danger">Hard to read — check these against the paper: {applied.uncertain.join("; ")}</li>
              )}
              {applied.replaced > 0 && (
                <li>{applied.replaced} existing score{applied.replaced === 1 ? " was" : "s were"} replaced (still unsaved).</li>
              )}
              {loose.length > 0 && (
                <li>Matched by surname and first name only — double-check: {loose.map((m) => `${m.fileName} → ${m.studentName}`).join("; ")}</li>
              )}
              {applied.result.unmatched.length > 0 && (
                <li className="text-danger">
                  Not found in this class ({applied.result.unmatched.length}) — enter by hand:{" "}
                  {applied.result.unmatched.map((r) => `${r.name} (${r.score || "blank"})`).join("; ")}
                </li>
              )}
              {applied.result.ambiguous.length > 0 && (
                <li className="text-danger">
                  Unclear match ({applied.result.ambiguous.length}) — skipped, enter by hand:{" "}
                  {applied.result.ambiguous.map((r) => `${r.name} (${r.score || "blank"})`).join("; ")}
                </li>
              )}
              {applied.notes.length > 0 && <li>Left blank: {applied.notes.join("; ")}</li>}
              {applied.result.missingFromFile.length > 0 && (
                <li>
                  {applied.result.missingFromFile.length} student{applied.result.missingFromFile.length === 1 ? " in" : "s in"} this
                  class {applied.result.missingFromFile.length === 1 ? "isn't" : "aren't"} on the sheet.
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-2 text-muted">Pick the column to fill in.</p>
          )}
        </div>
      )}
    </div>
  );
}
