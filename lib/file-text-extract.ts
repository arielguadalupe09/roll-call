import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

// Server-only -- mammoth/pdf-parse are Node libraries, never bundle this into
// a client component.
export async function extractTextFromFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "docx" || mimeType.includes("wordprocessingml")) {
    return extractDocxText(buffer);
  }

  if (ext === "pdf" || mimeType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  return buffer.toString("utf-8");
}

// extractRawText discards formatting entirely -- but teachers commonly mark
// the correct multiple-choice option or true/false answer with bold/underline
// instead of writing an explicit "Answer:" line, which would otherwise make
// the correct answer invisible to a downstream text-only parser. Convert to
// HTML instead and turn bold/underline runs into "**...**" markers so that
// signal survives into plain text.
async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer }, { styleMap: ["u => u"] });
  return htmlToEmphasisText(result.value);
}

export function htmlToEmphasisText(html: string): string {
  return html
    .replace(/<(strong|b|u)\b[^>]*>/gi, "**")
    .replace(/<\/(strong|b|u)>/gi, "**")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
