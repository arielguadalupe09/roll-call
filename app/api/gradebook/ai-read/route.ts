import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AiReadError, aiReadConfigured, readScoreSheet, type SheetInput } from "@/lib/score-ai-model";
import { matrixToCsv } from "@/lib/score-ai-read";

// Encoding bot: transcribes a photo or spreadsheet of scores with an AI model
// (Groq free tier by default, Claude optionally -- see lib/score-ai-model.ts).
// It never writes grades -- the client fills the score boxes as unsaved edits
// for the teacher to review and Save all, same as the Excel import.
export const maxDuration = 120;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB
const DAILY_LIMIT = 60; // AI reads per teacher per 24 h (protects the shared free-tier quota)
const ACTION = "ai_score_read";

function imageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function POST(request: NextRequest) {
  const configured = aiReadConfigured();
  if (!configured.ok) {
    return NextResponse.json({ error: `AI reading isn't set up on this server (missing ${configured.missing}).` }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Two shapes: multipart (a photo) or JSON (a spreadsheet already read into a matrix in the browser).
  let classId = "";
  let title = "";
  let fileName = "";
  let input: SheetInput;
  const isJson = (request.headers.get("content-type") ?? "").includes("application/json");
  if (isJson) {
    const body = (await request.json().catch(() => null)) as { classId?: string; title?: string; fileName?: string; matrix?: unknown[][] } | null;
    if (!body || !Array.isArray(body.matrix)) return NextResponse.json({ error: "Missing spreadsheet." }, { status: 400 });
    classId = String(body.classId ?? "");
    title = String(body.title ?? "");
    fileName = String(body.fileName ?? "spreadsheet");
    const csv = matrixToCsv(body.matrix);
    if (!csv) return NextResponse.json({ error: "That file has no rows." }, { status: 400 });
    input = { kind: "csv", csv };
  } else {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    classId = String(form?.get("classId") ?? "");
    title = String(form?.get("title") ?? "");
    if (!(file instanceof File)) return NextResponse.json({ error: "Missing photo." }, { status: 400 });
    if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "That photo is too large -- max 4MB." }, { status: 400 });
    fileName = file.name || "photo";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mediaType = imageType(bytes);
    if (!mediaType) return NextResponse.json({ error: "Upload a JPEG, PNG or WebP photo." }, { status: 400 });
    input = { kind: "image", mediaType, base64: Buffer.from(bytes).toString("base64") };
  }

  // The class must be one of this teacher's (RLS also enforces this).
  const { data: cls } = await supabase.from("classes").select("id").eq("id", classId).eq("teacher_id", user.id).maybeSingle();
  if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", user.id)
    .eq("action", ACTION)
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json({ error: `You've used today's ${DAILY_LIMIT} AI reads. Try again tomorrow, or use the Excel upload.` }, { status: 429 });
  }

  try {
    const hint = title ? `The teacher is encoding "${title.slice(0, 80)}".` : "";
    const reading = await readScoreSheet(input, hint);
    const { error } = await supabase.from("audit_log").insert({
      teacher_id: user.id,
      class_id: classId,
      action: ACTION,
      description: `AI read ${fileName.slice(0, 80)} for ${title.slice(0, 80) || "a score item"}: ${reading.rows.length} rows, ${reading.columns.length} score columns (nothing saved).`,
    });
    if (error) console.error("Failed to write audit log entry:", error.message);
    return NextResponse.json({ reading });
  } catch (err) {
    if (err instanceof AiReadError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("AI score read failed:", err);
    return NextResponse.json({ error: "Could not read that file. Try again." }, { status: 500 });
  }
}
