import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Attendance, ClassRow, GradingConfig, Student } from "@/lib/types";
import {
  computeClassStats,
  computeInsights,
  TREND_DROP_THRESHOLD,
  type ClassStats,
} from "@/lib/dashboard-insights";
import CreateClassForm from "./create-class-form";
import ArchiveButton from "./archive-button";
import ArchivedClasses from "./archived-classes";
import {
  ActiveArchivedBar,
  AttendanceByClassChart,
  AttendanceRing,
  AttentionBreakdown,
  StudentsSparkline,
} from "./dashboard-charts";

function TileIcon({ path }: { path: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-ink/40">
      <path d={path} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICON_CLASSES = "M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1 1.3H12.5A1.5 1.5 0 0 1 14 5.8v5.7A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7z";
const ICON_STUDENTS = "M5.5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10.5 7a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM2 13c0-2 1.6-3.5 3.5-3.5S9 11 9 13M9.3 9.7c1.6.1 2.7 1.6 2.7 3.3";
const ICON_ALERT = "M8 2.5 14 13H2L8 2.5zM8 6.5v3M8 11.2v.1";

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

  const lowAttendanceClassCount = stats.filter((s) => s.lowAttendanceStudentCount > 0).length;
  const droppedTrendClassCount = stats.filter(
    (s) => s.weekTrend && s.weekTrend.previous - s.weekTrend.current > TREND_DROP_THRESHOLD,
  ).length;
  const ungradedClassCount = stats.filter((s) => !s.gradingConfigured).length;
  const studentsPerClass = classList.map((c) => ({
    name: c.name,
    count: studentsByClass.get(c.id)?.length ?? 0,
  }));

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
            className="rounded-sm border border-rule bg-white p-4 transition hover:border-brass"
          >
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] uppercase tracking-wide text-ink/60">Classes</p>
              <TileIcon path={ICON_CLASSES} />
            </div>
            <p className="mt-1 font-display text-3xl font-semibold text-ink">{classList.length}</p>
            <ActiveArchivedBar active={classList.length} archived={archivedClasses.length} />
          </a>
          <Link
            href="/students"
            className="rounded-sm border border-rule bg-white p-4 transition hover:border-brass"
          >
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] uppercase tracking-wide text-ink/60">Students</p>
              <TileIcon path={ICON_STUDENTS} />
            </div>
            <p className="mt-1 font-display text-3xl font-semibold text-ink">{totalStudents}</p>
            <StudentsSparkline classes={studentsPerClass} />
          </Link>
          <Link
            href="/attendance"
            className="rounded-sm border border-rule bg-white p-4 transition hover:border-brass"
          >
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink/60">Attendance</p>
            <div className="mt-1 flex items-center gap-3">
              <AttendanceRing rate={overallAttendanceRate} />
              <p className="text-xs text-ink/60">
                Average across {ratesWithData.length > 0 ? classList.length : 0} class
                {classList.length === 1 ? "" : "es"}
              </p>
            </div>
          </Link>
          <a
            href="#insights"
            className="rounded-sm border border-rule bg-white p-4 transition hover:border-brass"
          >
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] uppercase tracking-wide text-ink/60">Need attention</p>
              <TileIcon path={ICON_ALERT} />
            </div>
            <p className="mt-1 font-display text-3xl font-semibold text-ink">{classesNeedingAttention}</p>
            <AttentionBreakdown
              items={[
                { label: "Low attendance", count: lowAttendanceClassCount },
                { label: "Attendance dropped", count: droppedTrendClassCount },
                { label: "Grading not set up", count: ungradedClassCount },
              ]}
            />
          </a>
        </div>

        <div className="mt-6">
          <AttendanceByClassChart stats={stats} />
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
