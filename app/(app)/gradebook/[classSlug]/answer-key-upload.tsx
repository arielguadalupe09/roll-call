"use client";

import { useRef, useState } from "react";
import Button from "@/app/_components/button";
import { useToast } from "@/app/_components/toast";
import { AnswerKeyPhotoError, readAnswerKeyPhoto } from "@/lib/answer-key-photo";
import { answerKeyFromText, matrixToText } from "@/lib/answer-key-text";
import { formatItemList } from "@/lib/item-analysis";

// "Upload answer key": fills the on-screen ovals from a file instead of
// tapping them one by one. Nothing is saved -- the teacher checks the ovals
// and clicks Save answer key, same as typing it.
//   - a photo or scan (JPG/PNG/...) of a shaded GAINS answer sheet is read in
//     the browser by the bubble-sheet reader (lib/answer-key-photo.ts);
//   - an Excel/CSV/Word/PDF/text file listing the answers ("1. A", an
//     Item | Answer table, or just "ABDCA...") is parsed as text
//     (lib/answer-key-text.ts).

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PHOTO_BYTES = 25 * 1024 * 1024; // read on the device, never uploaded

type Summary = { fileName: string; found: number; notes: string[]; problems: string[] };

export default function AnswerKeyUpload({
  examId,
  itemCount,
  onRead,
}: {
  examId: string;
  // The item count in the editor, or 0 when it isn't set yet.
  itemCount: number;
  // One letter per item ("" = not found); its length is the item count the file implies.
  onRead: (letters: string[]) => void;
}) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setSummary(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const isImage = file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext);
      const result = isImage ? await fromPhoto(file) : await fromDocument(file, ext);
      const found = result.letters.filter(Boolean).length;
      if (found === 0) throw new Error("No answers found in that file.");
      onRead(result.letters);
      setSummary({ fileName: file.name, found, notes: result.notes, problems: result.problems });
      showToast(`Read ${found} answer${found === 1 ? "" : "s"} from ${file.name} — check the ovals, then save.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function fromPhoto(file: File) {
    if (file.size > MAX_PHOTO_BYTES) throw new Error("That photo is too large -- max 25MB.");
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error("Couldn't open that image. Use a JPG or PNG photo or scan.");
    }
    const s = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * s);
    canvas.height = Math.round(bitmap.height * s);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // iOS Safari holds canvas memory until the size is zeroed.
    const { width, height } = canvas;
    canvas.width = canvas.height = 0;

    try {
      const read = readAnswerKeyPhoto(data, width, height, itemCount, examId);
      const problems: string[] = [];
      if (read.multiple.length)
        problems.push(`More than one oval shaded on item${read.multiple.length === 1 ? "" : "s"} ${formatItemList(read.multiple)} — left blank.`);
      if (read.blank.length)
        problems.push(`Nothing shaded on item${read.blank.length === 1 ? "" : "s"} ${formatItemList(read.blank)} — left blank.`);
      if (read.warning) problems.unshift(read.warning);
      return { letters: read.letters, notes: ["Read from the bubble sheet."], problems };
    } catch (err) {
      if (err instanceof AnswerKeyPhotoError) throw new Error(err.message);
      throw err;
    }
  }

  async function fromDocument(file: File, ext: string) {
    if (file.size > MAX_BYTES) throw new Error("That file is too large -- max 4MB.");
    let text: string;
    if (ext === "xlsx" || ext === "xls" || ext === "csv") {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      text = workbook.SheetNames.map((name) =>
        matrixToText(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: "" })),
      ).find((t) => answerKeyFromText(t)) ?? "";
    } else if (ext === "docx" || ext === "pdf") {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/gradebook/extract-text", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
      if (!res.ok || data?.text == null) throw new Error(data?.error ?? "Could not read that file.");
      text = data.text;
      if (ext === "pdf" && !text.trim()) {
        throw new Error("That PDF is a scanned image with no text. Upload the scan as a JPG or PNG instead.");
      }
    } else if (ext === "txt") {
      text = await file.text();
    } else if (ext === "doc") {
      throw new Error("Old .doc files aren't supported -- open it in Word and save as .docx.");
    } else {
      throw new Error("Upload a photo/scan of the answer sheet, or an Excel, Word, PDF or text file.");
    }

    const key = answerKeyFromText(text);
    if (!key) {
      throw new Error('No answer key found in that file. List it as "1. A", "2. B", ... or just the letters in order.');
    }
    const problems: string[] = [];
    const missing = key.letters.flatMap((l, i) => (l ? [] : [i + 1]));
    if (missing.length) problems.push(`No answer for item${missing.length === 1 ? "" : "s"} ${formatItemList(missing)}.`);
    if (key.conflicts.length)
      problems.push(`Item${key.conflicts.length === 1 ? "" : "s"} ${formatItemList(key.conflicts)} appeared twice — used the last answer.`);
    if (itemCount > 0 && key.letters.length !== itemCount)
      problems.push(`The file has ${key.letters.length} items but the exam is set to ${itemCount}.`);
    return { letters: key.letters, notes: [key.format === "numbered" ? "Read the numbered answers." : "Read the answers in order."], problems };
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.xlsx,.xls,.csv,.docx,.pdf,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "Reading…" : "Upload answer key"}
        </Button>
        <span className="text-xs text-muted">
          A photo or scan of the shaded answer sheet, or an Excel, Word, PDF or text file of the answers.
        </span>
      </div>

      {summary && (
        <div className="rounded-[8px] border border-line bg-paper p-3 text-sm text-ink">
          <div className="flex items-start justify-between gap-3">
            <p>
              Filled <span className="font-semibold">{summary.found}</span> answer{summary.found === 1 ? "" : "s"} from{" "}
              <span className="font-semibold">{summary.fileName}</span>. {summary.notes.join(" ")} They&apos;re{" "}
              <span className="font-semibold">not saved yet</span> — check the ovals, then click Save answer key.
            </p>
            <button
              type="button"
              onClick={() => setSummary(null)}
              className="shrink-0 text-xs font-semibold text-slate hover:text-navy"
            >
              Dismiss
            </button>
          </div>
          {summary.problems.length > 0 && (
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-danger">
              {summary.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
