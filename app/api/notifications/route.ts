import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Attendance, ClassRow, GradingConfig, Student } from "@/lib/types";
import { computeClassStats, computeInsights } from "@/lib/dashboard-insights";

// Backs the top bar's notification bell with the same insight computation
// the Dashboard already uses, kept behind a fetch-on-open route (rather
// than run in app/(app)/layout.tsx) so this multi-table query doesn't run
// on every single page navigation in the authenticated shell.
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: classes } = await supabase
    .from("classes")
    .select("*")
    .eq("archived", false);

  const classList = (classes as ClassRow[] | null) ?? [];
  const classIds = classList.map((c) => c.id);

  const [{ data: students }, { data: attendance }, { data: gradingConfigs }] = classIds.length
    ? await Promise.all([
        supabase.from("students").select("*").in("class_id", classIds),
        supabase.from("attendance").select("*").in("class_id", classIds),
        supabase.from("grading_configs").select("*").in("class_id", classIds),
      ])
    : [{ data: [] as Student[] }, { data: [] as Attendance[] }, { data: [] as GradingConfig[] }];

  const studentsByClass = new Map<string, Student[]>();
  for (const s of (students as Student[] | null) ?? []) {
    const list = studentsByClass.get(s.class_id) ?? [];
    list.push(s);
    studentsByClass.set(s.class_id, list);
  }

  const attendanceByClass = new Map<string, Attendance[]>();
  for (const a of (attendance as Attendance[] | null) ?? []) {
    const list = attendanceByClass.get(a.class_id) ?? [];
    list.push(a);
    attendanceByClass.set(a.class_id, list);
  }

  const configByClass = new Map<string, GradingConfig>(
    ((gradingConfigs as GradingConfig[] | null) ?? []).map((c) => [c.class_id, c]),
  );

  const stats = classList.map((c) =>
    computeClassStats(
      c,
      studentsByClass.get(c.id) ?? [],
      attendanceByClass.get(c.id) ?? [],
      configByClass.get(c.id) ?? null,
    ),
  );

  return NextResponse.json({ insights: computeInsights(stats) });
}
