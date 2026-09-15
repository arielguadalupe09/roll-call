import { createClient } from "@/lib/supabase/server";
import type { Attendance, ClassRow, Session, Student } from "@/lib/types";
import { CardRow } from "@/app/_components/card-row";
import { StatusPill } from "@/app/_components/status-pill";
import Button from "@/app/_components/button";
import AllAttendanceClient from "./all-attendance-client";

export default async function AllAttendancePage() {
  const supabase = await createClient();

  const { data: classes } = await supabase
    .from("classes")
    .select("*")
    .order("name", { ascending: true });

  const classList = (classes as ClassRow[] | null) ?? [];
  const activeClasses = classList.filter((c) => !c.archived);
  const classIds = classList.map((c) => c.id);
  const activeClassIds = activeClasses.map((c) => c.id);

  const [{ data: students }, { data: attendance }, { data: openSessions }] = classIds.length
    ? await Promise.all([
        supabase.from("students").select("*").in("class_id", classIds),
        supabase.from("attendance").select("*").in("class_id", classIds),
        // Gate on "is there a currently open session," never a
        // server-computed "today" -- this app runs in UTC on Vercel but
        // the school is UTC+8 (see CLAUDE.md's check-in gating convention).
        activeClassIds.length
          ? supabase.from("sessions").select("*").in("class_id", activeClassIds).is("closed_at", null)
          : Promise.resolve({ data: [] as Session[] }),
      ])
    : [{ data: [] as Student[] }, { data: [] as Attendance[] }, { data: [] as Session[] }];

  const classById = new Map(classList.map((c) => [c.id, c]));
  const studentById = new Map(((students as Student[] | null) ?? []).map((s) => [s.id, s]));
  const openSessionByClass = new Map(
    ((openSessions as Session[] | null) ?? []).map((s) => [s.class_id, s]),
  );

  const rows = ((attendance as Attendance[] | null) ?? []).map((a) => ({
    attendance: a,
    studentName: studentById.get(a.student_id)?.name ?? "Unknown student",
    className: classById.get(a.class_id)?.name ?? "Unknown class",
  }));

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Attendance
        </h1>
        <p className="mt-1 text-ink/70">
          A combined log across all of your classes. For per-class attendance
          sheets and CSV export, open a class&apos;s Records tab.
        </p>

        {activeClasses.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Today&apos;s sessions
            </p>
            <div className="mt-2 flex flex-col gap-1">
              {activeClasses.map((c) => {
                const open = openSessionByClass.get(c.id);
                return (
                  <CardRow
                    key={c.id}
                    title={c.name}
                    meta={c.subject || "No subject set"}
                    trailing={
                      <>
                        <StatusPill tone={open ? "success" : "neutral"} dot>
                          {open ? "Open" : "Not started"}
                        </StatusPill>
                        <Button href={`/checkin/${c.id}`} variant="secondary" size="sm">
                          {open ? "View" : "Start session"}
                        </Button>
                      </>
                    }
                  />
                );
              })}
            </div>
          </div>
        )}

        <AllAttendanceClient rows={rows} />
      </div>
    </div>
  );
}
