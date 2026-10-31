import { redirect } from "next/navigation";
import { createClient, getUser, getTeacherRow } from "@/lib/supabase/server";
import type { Attendance, ClassRow, GradingConfig, ScheduleEntry, Student } from "@/lib/types";
import {
  computeClassStats,
  computeInsights,
  computeStudentActivityCounts,
  LOW_ATTENDANCE_THRESHOLD,
  TREND_DROP_THRESHOLD,
  type ClassStats,
} from "@/lib/dashboard-insights";
import CollapsibleSection from "@/app/_components/collapsible-section";
import CreateClassForm from "./create-class-form";
import ArchivedClasses from "./archived-classes";
import ClassList from "./class-list";
import { AttendanceByClassChart, AttentionBreakdown } from "./dashboard-charts";
import { StatCard } from "@/app/_components/stat-card";
import { TileIcon } from "@/app/_components/tile-icon";
import { InsightsPanel } from "./insights-panel";
import { CalendarWidget } from "@/app/_components/calendar-widget";
import { NextSessionWidget } from "@/app/_components/next-session-widget";

const ICON_CLASSES = "M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1 1.3H12.5A1.5 1.5 0 0 1 14 5.8v5.7A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7z";
const ICON_STUDENTS = "M5.5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10.5 7a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM2 13c0-2 1.6-3.5 3.5-3.5S9 11 9 13M9.3 9.7c1.6.1 2.7 1.6 2.7 3.3";
const ICON_ALERT = "M8 2.5 14 13H2L8 2.5zM8 6.5v3M8 11.2v.1";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getUser();

  if (!user) redirect("/login");

  const [{ data: classes }, teacherRow] = await Promise.all([
    supabase.from("classes").select("*").order("created_at", { ascending: false }),
    getTeacherRow(user.id),
  ]);

  const allClasses = (classes as ClassRow[] | null) ?? [];
  const classList = allClasses.filter((c) => !c.archived);
  const archivedClasses = allClasses.filter((c) => c.archived);
  const classIds = classList.map((c) => c.id);

  // The calendar widget picks the teacher's month client-side; this server
  // runs in UTC, which lags UTC+8, so their month is either this UTC month or
  // the next one -- fetch both.
  const now = new Date();
  const ymd = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const monthStart = ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const monthEnd = ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0)));

  const [
    { data: students },
    { data: attendance },
    { data: gradingConfigs },
    { data: monthSessions },
    { data: scheduleEntries },
  ] = await Promise.all([
    classIds.length
      ? supabase.from("students").select("*").in("class_id", classIds)
      : Promise.resolve({ data: [] as Student[] }),
    classIds.length
      ? supabase.from("attendance").select("*").in("class_id", classIds)
      : Promise.resolve({ data: [] as Attendance[] }),
    classIds.length
      ? supabase.from("grading_configs").select("*").in("class_id", classIds)
      : Promise.resolve({ data: [] as GradingConfig[] }),
    classIds.length
      ? supabase
          .from("sessions")
          .select("date")
          .in("class_id", classIds)
          .gte("date", monthStart)
          .lte("date", monthEnd)
      : Promise.resolve({ data: [] as { date: string }[] }),
    supabase.from("schedule_entries").select("*").eq("teacher_id", user.id),
  ]);

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
  // Low attendance gets its own ranked list in the Insights panel; the rest
  // come from computeInsights with that count zeroed so they aren't repeated.
  const lowAttendanceRows = stats
    .filter((s) => s.lowAttendanceStudentCount > 0)
    .map((s) => ({
      id: s.classRow.id,
      name: s.classRow.name,
      slug: s.classRow.slug,
      low: s.lowAttendanceStudentCount,
      total: s.studentCount,
    }));
  const otherInsights = computeInsights(stats.map((s) => ({ ...s, lowAttendanceStudentCount: 0 })));

  const studentActivity = computeStudentActivityCounts(
    classList.map((c) => ({
      id: c.id,
      students: studentsByClass.get(c.id) ?? [],
      attendance: attendanceByClass.get(c.id) ?? [],
    })),
  );
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

  const sessionDates = ((monthSessions as { date: string }[] | null) ?? []).map((s) => s.date);

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm text-gold">Dashboard</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
          Your classes
        </h1>
        <p className="mt-1 text-ink/70">
          Create a class, then manage students, QR sheets, and attendance.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            href="#class-list"
            label="Classes"
            icon={<TileIcon path={ICON_CLASSES} tone="gold" />}
            figure={{
              kind: "breakdown",
              segments: [
                { tone: "success", count: classList.length, label: "Active" },
                { tone: "neutral", count: archivedClasses.length, label: "Archived" },
              ],
            }}
          />
          <StatCard
            href="/students"
            label="Students"
            icon={<TileIcon path={ICON_STUDENTS} tone="success" />}
            figure={{
              kind: "breakdown",
              segments: [
                { tone: "success", count: studentActivity.active, label: "Active" },
                { tone: "warning", count: studentActivity.atRisk, label: "At-risk" },
                { tone: "danger", count: studentActivity.inactive, label: "Inactive" },
              ],
            }}
          />
          <StatCard
            href="/attendance"
            label="Attendance"
            figure={{
              kind: "ring",
              rate: overallAttendanceRate,
              caption: `Average across ${ratesWithData.length > 0 ? classList.length : 0} class${
                classList.length === 1 ? "" : "es"
              }`,
            }}
          />
          <StatCard
            href="#insights"
            label="Need attention"
            icon={<TileIcon path={ICON_ALERT} tone="danger" />}
            alert={classesNeedingAttention > 0}
            figure={{ kind: "badge", value: classesNeedingAttention, danger: classesNeedingAttention > 0 }}
            footnote={
              <AttentionBreakdown
                items={[
                  { label: "Low attendance", count: lowAttendanceClassCount },
                  { label: "Attendance dropped", count: droppedTrendClassCount },
                  { label: "Grading not set up", count: ungradedClassCount },
                ]}
              />
            }
          />
        </div>

        <div className="mt-6 rounded-lg border border-dashed border-gold/50 bg-gold/[0.04] p-5">
          <p className="text-xs text-gold">+ New</p>
          <CreateClassForm
            teacherId={user.id}
            defaultUsePrelims={teacherRow?.default_use_prelims ?? false}
          />
        </div>

        <div className="mt-6">
          <AttendanceByClassChart stats={stats} />
        </div>

        <div className="mt-6">
          <CollapsibleSection
            id="insights"
            title="Insights"
            subtitle={
              lowAttendanceRows.length > 0
                ? `${lowAttendanceRows.length} of ${classList.length} classes have students below ${Math.round(
                    LOW_ATTENDANCE_THRESHOLD * 100,
                  )}% attendance`
                : undefined
            }
          >
            <InsightsPanel
              lowAttendance={lowAttendanceRows}
              thresholdPct={Math.round(LOW_ATTENDANCE_THRESHOLD * 100)}
              others={otherInsights}
            />
          </CollapsibleSection>
        </div>

        <div className="mt-8">
          <CollapsibleSection
            id="class-list"
            title="Classes"
            subtitle={`${classList.length} class${classList.length === 1 ? "" : "es"}`}
          >
            <ClassList stats={stats} />
            {classList.length === 0 && (
              <p className="mt-3 text-ink/60">
                No classes yet — add your first one above.
              </p>
            )}
          </CollapsibleSection>
        </div>

        <ArchivedClasses classes={archivedClasses} />
        </div>

        <div className="flex flex-col gap-4">
          <CalendarWidget sessionDates={sessionDates} />
          <NextSessionWidget scheduleEntries={(scheduleEntries as ScheduleEntry[] | null) ?? []} />
        </div>
        </div>
      </div>
    </div>
  );
}
