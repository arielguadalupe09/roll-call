import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Attendance, ClassRow, GradingConfig, Student } from "@/lib/types";
import { computeClassStats, computeInsights, type ClassStats } from "@/lib/dashboard-insights";
import CreateClassForm from "./create-class-form";
import ArchiveButton from "./archive-button";
import ArchivedClasses from "./archived-classes";

function attendanceBadge(rate: number | null) {
  if (rate == null) {
    return <span className="rounded-sm bg-ink/10 px-2 py-0.5 font-mono text-xs text-ink/50">No data</span>;
  }
  const pct = Math.round(rate * 100);
  const color =
    rate >= 0.9 ? "bg-teal/20 text-teal" : rate >= 0.75 ? "bg-brass/20 text-brass" : "bg-danger/20 text-danger";
  return (
    <span className={`rounded-sm px-2 py-0.5 font-mono text-xs font-semibold ${color}`}>
      {pct}% attendance
    </span>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: classes } = await supabase
    .from("classes")
    .select("*")
    .order("created_at", { ascending: false });

  const allClasses = (classes as ClassRow[] | null) ?? [];
  const classList = allClasses.filter((c) => !c.archived);
  const archivedClasses = allClasses.filter((c) => c.archived);
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

  const stats: ClassStats[] = classList.map((c) =>
    computeClassStats(
      c,
      studentsByClass.get(c.id) ?? [],
      attendanceByClass.get(c.id) ?? [],
      configByClass.get(c.id) ?? null,
    ),
  );
  const insights = computeInsights(stats);

  const totalStudents = stats.reduce((sum, s) => sum + s.studentCount, 0);
  const ratesWithData = stats.map((s) => s.attendanceRate).filter((r): r is number => r != null);
  const overallAttendanceRate =
    ratesWithData.length > 0 ? ratesWithData.reduce((a, b) => a + b, 0) / ratesWithData.length : null;
  const classesNeedingAttention = new Set(
    insights.filter((i) => i.severity === "warning").map((i) => i.text),
  ).size;

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Your classes
        </h1>
        <p className="mt-1 text-ink/70">
          Create a class, then manage students, QR sheets, and attendance.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <a
            href="#class-list"
            className="rounded-sm border border-rule bg-white p-4 text-center transition hover:border-brass"
          >
            <p className="font-display text-2xl font-semibold text-ink">{classList.length}</p>
            <p className="font-mono text-xs uppercase tracking-wide text-ink/60">Classes</p>
          </a>
          <Link
            href="/students"
            className="rounded-sm border border-rule bg-white p-4 text-center transition hover:border-brass"
          >
            <p className="font-display text-2xl font-semibold text-ink">{totalStudents}</p>
            <p className="font-mono text-xs uppercase tracking-wide text-ink/60">Students</p>
          </Link>
          <Link
            href="/attendance"
            className="rounded-sm border border-rule bg-white p-4 text-center transition hover:border-brass"
          >
            <p className="font-display text-2xl font-semibold text-ink">
              {overallAttendanceRate != null ? `${Math.round(overallAttendanceRate * 100)}%` : "—"}
            </p>
            <p className="font-mono text-xs uppercase tracking-wide text-ink/60">Attendance</p>
          </Link>
          <a
            href="#insights"
            className="rounded-sm border border-rule bg-white p-4 text-center transition hover:border-brass"
          >
            <p className="font-display text-2xl font-semibold text-ink">{classesNeedingAttention}</p>
            <p className="font-mono text-xs uppercase tracking-wide text-ink/60">Need attention</p>
          </a>
        </div>

        <div id="insights" className="mt-6 scroll-mt-6 rounded-sm border border-rule bg-white p-4">
          <p className="font-mono text-xs uppercase tracking-wide text-ink/60">Insights</p>
          {insights.length === 0 ? (
            <p className="mt-2 text-sm text-ink/60">No issues detected.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {insights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      insight.severity === "warning" ? "bg-danger" : "bg-teal"
                    }`}
                  />
                  {insight.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 rounded-sm border border-rule bg-white p-4">
          <CreateClassForm teacherId={user.id} />
        </div>

        <ul id="class-list" className="mt-8 flex scroll-mt-6 flex-col gap-2">
          {stats.map((s) => (
            <li
              key={s.classRow.id}
              className="flex flex-col gap-2 rounded-sm border border-rule bg-white p-4 transition hover:border-brass sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <span className="font-display text-xl font-semibold text-ink">
                  {s.classRow.name}
                </span>
                <p className="mt-0.5 text-sm text-ink/60">
                  {s.classRow.subject || "No subject set"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs text-ink/50">
                  {s.studentCount} student{s.studentCount === 1 ? "" : "s"}
                </span>
                {attendanceBadge(s.attendanceRate)}
                <Link
                  href={`/dashboard/classes/${s.classRow.id}`}
                  className="font-mono text-xs uppercase tracking-wide text-teal"
                >
                  Open →
                </Link>
                <ArchiveButton classId={s.classRow.id} name={s.classRow.name} archived={false} />
              </div>
            </li>
          ))}
          {classList.length === 0 && (
            <p className="text-ink/60">
              No classes yet — add your first one above.
            </p>
          )}
        </ul>

        <ArchivedClasses classes={archivedClasses} />
      </div>
    </div>
  );
}
