import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { createClient } from "@/lib/supabase/server";
import { htmlToScoreMatrix } from "@/lib/score-import";

const MAX_BYTES = 4 * 1024 * 1024;

// Reads a Word (.docx) score sheet into a plain rows/cells matrix. No model
// involved -- it's mammoth's HTML, with table rows split into cells. Signed-in
// teachers only, same as the exam upload route.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large -- max 4MB." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json({ error: "Only .docx Word files are supported." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { value: html } = await mammoth.convertToHtml({ buffer });
    return NextResponse.json({ matrix: htmlToScoreMatrix(html) });
  } catch {
    return NextResponse.json({ error: "Could not read that Word file." }, { status: 422 });
  }
}
