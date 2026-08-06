import { createClient } from "@/lib/supabase/server";
import type { ClassRow, Student } from "@/lib/types";
import AllStudentsClient from "./all-students-client";

export default async function AllStudentsPage() {
  const supabase = await createClient();

  const { data: classes } = await supabase
    .from("classes")
    .select("*")
    .order("name", { ascending: true });

  const classList = (classes as ClassRow[] | null) ?? [];
  const classIds = classList.map((c) => c.id);

  const { data: students } = classIds.length
    ? await supabase.from("students").select("*").in("class_id", classIds)
    : { data: [] as Student[] };

  const classById = new Map(classList.map((c) => [c.id, c]));
  const rows = ((students as Student[] | null) ?? [])
    .map((s) => ({
      student: s,
      classId: s.class_id,
      className: classById.get(s.class_id)?.name ?? "Unknown class",
    }))
    .sort((a, b) => a.student.name.localeCompare(b.student.name));

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          All students
        </h1>
        <p className="mt-1 text-ink/70">
          Every student across all of your classes. To edit or remove a
          student, open their class&apos;s Students tab.
        </p>

        <AllStudentsClient rows={rows} />
      </div>
    </div>
  );
}
