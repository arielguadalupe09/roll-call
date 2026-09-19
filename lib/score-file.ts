// Client-side: turns an uploaded Excel/CSV/Word file into a rows-and-cells
// matrix for extractScoreRows. Spreadsheets are read in the browser (same as
// the student-list import); .docx goes through /api/gradebook/parse-scores
// because mammoth is a Node library.
export const MAX_SCORE_FILE_BYTES = 4 * 1024 * 1024;

export async function readScoreFile(file: File): Promise<unknown[][]> {
  if (file.size > MAX_SCORE_FILE_BYTES) throw new Error("That file is too large -- max 4MB.");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "xlsx" || ext === "xls" || ext === "csv") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    for (const name of workbook.SheetNames) {
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: "" });
      if (matrix.some((row) => row.some((cell) => String(cell ?? "").trim() !== ""))) return matrix;
    }
    throw new Error("That file has no rows.");
  }

  if (ext === "docx") {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/gradebook/parse-scores", { method: "POST", body });
    const data = (await res.json().catch(() => null)) as { matrix?: unknown[][]; error?: string } | null;
    if (!res.ok || !data?.matrix) throw new Error(data?.error ?? "Could not read that Word file.");
    if (data.matrix.length === 0) throw new Error("That file has no rows.");
    return data.matrix;
  }

  if (ext === "doc") {
    throw new Error("Old .doc files aren't supported -- open it in Word and save as .docx.");
  }
  throw new Error("Upload an Excel (.xlsx, .xls, .csv) or Word (.docx) file.");
}
