import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { computeClassStats, computeInsights } from "@/lib/dashboard-insights";
import type { Attendance, ClassRow, GradingConfig, Student } from "@/lib/types";

const SYSTEM_PROMPT = `You are the class assistant inside Roll Call, a teacher attendance/grading app.
Answer the teacher's question using only the class data provided below -- don't invent students, numbers, or events not present in it.
Be concise (a few sentences, or a short list). If asked to draft an announcement or message, write it ready to paste in, with no extra commentary around it.`;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const classId = body?.classId;
  const question = body?.question;

  if (!classId || typeof classId !== "string" || !question || typeof question !== "string") {
    return NextResponse.json({ error: "Missing classId or question." }, { status: 400 });
  }

  // Regular authenticated client, not the service-role admin one -- RLS
  // (class_id in classes where teacher_id = auth.uid()) is what actually
  // stops a teacher from asking about a class that isn't theirs.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: classRow } = await supabase
    .from("classes")
    .select("*")
    .eq("id", classId)
    .single();

  if (!classRow) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }

  const [{ data: students }, { data: attendance }, { data: gradingConfig }] = await Promise.all([
    supabase.from("students").select("*").eq("class_id", classId),
    supabase.from("attendance").select("*").eq("class_id", classId),
    supabase.from("grading_configs").select("*").eq("class_id", classId).maybeSingle(),
  ]);

  const stats = computeClassStats(
    classRow as ClassRow,
    (students as Student[] | null) ?? [],
    (attendance as Attendance[] | null) ?? [],
    (gradingConfig as GradingConfig | null) ?? null,
  );
  const insights = computeInsights([stats]);

  const lowAttendanceNames = ((students as Student[] | null) ?? [])
    .filter((s) => {
      const dates = new Set(
        ((attendance as Attendance[] | null) ?? [])
          .filter((a) => a.student_id === s.id && (a.status === "present" || a.status === "late"))
          .map((a) => a.date),
      );
      const sessionDates = new Set(((attendance as Attendance[] | null) ?? []).map((a) => a.date));
      return sessionDates.size > 0 && dates.size / sessionDates.size < 0.75;
    })
    .map((s) => s.name);

  const context = `Class: ${classRow.name}${classRow.subject ? ` (${classRow.subject})` : ""}
Students enrolled: ${stats.studentCount}
Average attendance rate: ${stats.attendanceRate != null ? `${Math.round(stats.attendanceRate * 100)}%` : "no sessions recorded yet"}
Students below 75% attendance: ${lowAttendanceNames.length > 0 ? lowAttendanceNames.join(", ") : "none"}
Insights:
${insights.length > 0 ? insights.map((i) => `- ${i.text}`).join("\n") : "- none"}`;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "The class assistant isn't configured yet (missing ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  const anthropic = new Anthropic();
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Class data:\n${context}\n\nQuestion: ${question}`,
      },
    ],
  });

  const answer = message.content.find((block) => block.type === "text")?.text ?? "";
  return NextResponse.json({ answer });
}
