import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Student } from "@/lib/types";
import PrintSheet from "./print-sheet";

export default async function QrPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ ids?: string }>;
}) {
  const { classId } = await params;
  const { ids } = await searchParams;
  const supabase = await createClient();

  const { data: classRow } = await supabase
    .from("classes")
    .select("*")
    .eq("id", classId)
    .single();

  if (!classRow) notFound();

  const { data: students } = await supabase
    .from("students")
    .select("*")
    .eq("class_id", classId)
    .order("name", { ascending: true });

  const allStudents = (students as Student[] | null) ?? [];
  const idFilter = ids ? new Set(ids.split(",")) : null;
  const filteredStudents = idFilter
    ? allStudents.filter((s) => idFilter.has(s.id))
    : allStudents;

  return (
    <div className="py-6">
      <PrintSheet className={classRow.name} students={filteredStudents} />
    </div>
  );
}
