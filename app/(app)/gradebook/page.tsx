import { createClient } from "@/lib/supabase/server";
import type { AssignmentClass, ClassRow, Submission } from "@/lib/types";
import { CardRow } from "@/app/_components/card-row";
import { StatusPill } from "@/app/_components/status-pill";
import Button from "@/app/_components/button";
import { getCategoryColor } from "@/lib/category-colors";

const AVATAR_CLASSES = {
  sage: "bg-sage-tint text-sage",
  dustyblue: "bg-dustyblue-tint text-dustyblue",
  clay: "bg-clay-tint text-clay",
  violet: "bg-violet-tint text-violet",
} as const;

export default async function GradebookLandingPage() {
  const supabase = await createClient();

  const { data: classes } = await supabase
    .from("classes")
    .select("*")
    .eq("archived", false)
    .order("name", { ascending: true });

  const classList = (classes as ClassRow[] | null) ?? [];
  const classIds = classList.map((c) => c.id);

  const { data: links } = classIds.length
    ? await supabase.from("assignment_classes").select("assignment_id, class_id").in("class_id", classIds)
    : { data: [] as AssignmentClass[] };

  const linkRows = (links as AssignmentClass[] | null) ?? [];
  const assignmentIds = Array.from(new Set(linkRows.map((l) => l.assignment_id)));

  // "Ungraded" here counts submitted-but-not-yet-graded assignment
  // submissions -- a lightweight proxy for the landing page's pill, not the
  // full weighted-grade recomputation that lives in the per-class gradebook
  // (buildRecordCardData/computeFinalGrade), which is too heavy to re-run
  // per class just to render this list. If one assignment is shared across
  // multiple classes, its submitted count is attributed to each of them.
  const { data: submissions } = assignmentIds.length
    ? await supabase
        .from("submissions")
        .select("assignment_id, status")
        .in("assignment_id", assignmentIds)
        .eq("status", "submitted")
    : { data: [] as Submission[] };

  const submittedCountByAssignment = new Map<string, number>();
  for (const s of (submissions as Submission[] | null) ?? []) {
    submittedCountByAssignment.set(
      s.assignment_id,
      (submittedCountByAssignment.get(s.assignment_id) ?? 0) + 1,
    );
  }

  const ungradedByClass = new Map<string, number>();
  for (const link of linkRows) {
    const count = submittedCountByAssignment.get(link.assignment_id) ?? 0;
    ungradedByClass.set(link.class_id, (ungradedByClass.get(link.class_id) ?? 0) + count);
  }

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-display text-3xl font-semibold text-ink">Gradebook</h1>
        <p className="mt-1 text-ink/70">
          Open a class to enter scores. For weighted final grades and record cards, use that
          class&apos;s Overview tab.
        </p>

        <div className="mt-6 flex flex-col gap-1">
          {classList.map((c) => {
            const ungraded = ungradedByClass.get(c.id) ?? 0;
            const category = getCategoryColor(`${c.name} ${c.subject ?? ""}`);
            return (
              <CardRow
                key={c.id}
                leading={
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full font-display text-xs font-semibold ${AVATAR_CLASSES[category]}`}
                  >
                    {c.name.slice(0, 2).toUpperCase()}
                  </span>
                }
                title={c.name}
                meta={c.subject || "No subject set"}
                trailing={
                  <>
                    <StatusPill tone={ungraded > 0 ? "danger" : "success"} dot>
                      {ungraded > 0 ? `${ungraded} ungraded` : "All graded"}
                    </StatusPill>
                    <Button href={`/gradebook/${c.slug}`} variant="secondary" size="sm">
                      Open gradebook
                    </Button>
                  </>
                }
              />
            );
          })}
          {classList.length === 0 && <p className="text-ink/60">No classes yet.</p>}
        </div>
      </div>
    </div>
  );
}
