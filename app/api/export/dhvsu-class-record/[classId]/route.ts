import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchClassGradingData } from "@/lib/record-card-data";
import { buildDhvsuClassRecord } from "@/lib/dhvsu-export";
import type { ClassRow, Student, Teacher } from "@/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  const { classId } = await params;
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

  const [{ data: teacher }, { data: students }] = await Promise.all([
    supabase.from("teachers").select("*").eq("id", (classRow as ClassRow).teacher_id).single(),
    supabase.from("students").select("*").eq("class_id", classId).order("name", { ascending: true }),
  ]);

  if (!teacher) {
    return NextResponse.json({ error: "Teacher not found." }, { status: 404 });
  }

  const classData = await fetchClassGradingData(supabase, classId);

  if (classData.config?.use_prelims) {
    return NextResponse.json(
      { error: "DHVSU export only supports Midterm/Finals classes. Turn off Prelims in Setup to export." },
      { status: 409 },
    );
  }

  let buffer: Buffer;
  try {
    buffer = await buildDhvsuClassRecord({
      classRow: classRow as ClassRow,
      teacher: teacher as Teacher,
      students: (students as Student[] | null) ?? [],
      classData,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not generate the export." },
      { status: 500 },
    );
  }

  const filename = `${(classRow as ClassRow).name.replace(/\s+/g, "-")}-class-record.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
