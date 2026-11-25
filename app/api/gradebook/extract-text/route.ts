import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractTextFromFile } from "@/lib/file-text-extract";

const MAX_BYTES = 4 * 1024 * 1024;

// Plain text of an uploaded Word (.docx) or PDF file, for the answer-key
// upload (lib/answer-key-text.ts parses it in the browser). No model involved.
// Signed-in teachers only, same as the score import route.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is too large -- max 4MB." }, { status: 400 });
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext !== "docx" && ext !== "pdf") {
    return NextResponse.json({ error: "Only Word (.docx) and PDF files are read here." }, { status: 400 });
  }

  try {
    const text = await extractTextFromFile(Buffer.from(await file.arrayBuffer()), file.name, file.type);
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: `Could not read that ${ext === "pdf" ? "PDF" : "Word"} file.` }, { status: 422 });
  }
}
