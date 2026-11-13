import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeProgramType } from "@/lib/dhvsu-grade";
import { majorExamLabel } from "@/lib/omr-sheet";
import {
  REPORT_FORMATS,
  TEMPLATE_LETTERHEAD,
  academicYearLine,
  buildItemAnalysisReport,
  signatoriesFromParams,
  type ReportFormat,
} from "@/lib/item-analysis-report";
import { buildItemAnalysisDocx, buildItemAnalysisPdf, buildItemAnalysisXlsx } from "@/lib/item-analysis-export";
import type { ClassRow, MajorExam, MajorExamItemResponse, Student, Teacher } from "@/lib/types";

const CONTENT_TYPES: Record<ReportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

// GET /api/export/item-analysis/<majorExamId>?format=xlsx|docx|pdf&pName=...
// "Results of Item Analysis" for one major exam, from its saved (scanned or
// typed) papers. Signatories and letterhead overrides come from the query.
export async function GET(request: NextRequest, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const search = request.nextUrl.searchParams;
  const format = search.get("format") as ReportFormat;
  if (!REPORT_FORMATS.includes(format)) {
    return NextResponse.json({ error: "format must be xlsx, docx or pdf." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // RLS limits both lookups to the signed-in teacher's own classes.
  const { data: exam } = await supabase.from("major_exams").select("*").eq("id", examId).maybeSingle();
  if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
  const ex = exam as MajorExam;
  const [{ data: classRow }, { data: students }, { data: responses }] = await Promise.all([
    supabase.from("classes").select("*").eq("id", ex.class_id).single(),
    supabase.from("students").select("*").eq("class_id", ex.class_id).order("name", { ascending: true }),
    supabase.from("major_exam_item_responses").select("*").eq("major_exam_id", examId),
  ]);
  if (!classRow) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  const cls = classRow as ClassRow;
  const { data: teacher } = await supabase.from("teachers").select("*").eq("id", cls.teacher_id).single();
  const t = teacher as Teacher | null;

  if (!ex.item_count) {
    return NextResponse.json({ error: "Set the exam's number of items first." }, { status: 409 });
  }
  const checked = (responses as MajorExamItemResponse[] | null) ?? [];
  if (checked.length === 0) {
    return NextResponse.json({ error: "No papers have been checked or scanned yet." }, { status: 409 });
  }

  const pick = (key: string, fallback: string) => search.get(key)?.trim().slice(0, 160) || fallback;
  const signatories = signatoriesFromParams(search);
  if (!signatories.prepared.name) signatories.prepared.name = t?.full_name ?? "";
  if (!signatories.prepared.title) signatories.prepared.title = t?.faculty_rank || "Instructor";

  const report = buildItemAnalysisReport({
    header: {
      schoolName: pick("school", t?.card_school_name?.toUpperCase() || TEMPLATE_LETTERHEAD.schoolName),
      campus: pick("campus", t?.card_campus_line?.toUpperCase() || TEMPLATE_LETTERHEAD.campus),
      address: pick("address", TEMPLATE_LETTERHEAD.address),
      academicYear: academicYearLine(cls.semester, cls.academic_year),
      program: cls.program ?? "",
      course: [cls.course_code, cls.subject].filter(Boolean).join(" — "),
      yearSection: cls.name,
      examLabel: majorExamLabel(ex.period, ex.kind),
    },
    itemCount: ex.item_count,
    answerKey: ex.answer_key ?? null,
    responses: checked.map((r) => ({ studentId: r.student_id, wrongItems: r.wrong_items, answers: r.answers })),
    programType: normalizeProgramType(cls.program_type),
    rosterNames: ((students as Student[] | null) ?? []).map((s) => s.name),
    signatories,
  });

  let body: Buffer;
  try {
    body =
      format === "xlsx"
        ? await buildItemAnalysisXlsx(report)
        : format === "docx"
          ? await buildItemAnalysisDocx(report)
          : buildItemAnalysisPdf(report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not generate the report." },
      { status: 500 },
    );
  }

  const filename = `${cls.name}-${ex.period}-${ex.kind}-item-analysis.${format}`.replace(/[^\w.-]+/g, "-");
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
