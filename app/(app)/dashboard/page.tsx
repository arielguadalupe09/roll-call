import { redirect } from "next/navigation";
import { createClient, getUser, getTeacherRow } from "@/lib/supabase/server";
import type { Attendance, ClassRow, GradingConfig, Student } from "@/lib/types";
import {
  computeClassStats,
  computeInsights,
  TREND_DROP_THRESHOLD,
  type ClassStats,
} from "@/lib/dashboard-insights";
import CollapsibleSection from "@/app/_components/collapsible-section";
import Button from "@/app/_components/button";
import CreateClassForm from "./create-class-form";
import ArchiveButton from "./archive-button";
import ArchivedClasses from "./archived-classes";
import { AttendanceByClassChart, AttentionBreakdown } from "./dashboard-charts";
import { StatCard } from "@/app/_components/stat-card";
import { StatusPill, type StatusTone } from "@/app/_components/status-pill";
import { TileIcon } from "@/app/_components/tile-icon";
import { tierFor } from "@/lib/chart-tiers";

function classInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const ICON_CLASSES = "M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1 1.3H12.5A1.5 1.5 0 0 1 14 5.8v5.7A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7z";
const ICON_STUDENTS = "M5.5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10.5 7a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM2 13c0-2 1.6-3.5 3.5-3.5S9 11 9 13M9.3 9.7c1.6.1 2.7 1.6 2.7 3.3";
const ICON_ALERT = "M8 2.5 14 13H2L8 2.5zM8 6.5v3M8 11.2v.1";

const TIER_TONE: Record<ReturnType<typeof tierFor>, StatusTone> = {
  good: "success",
  warning: "warning",
  critical: "danger",
};

function attendanceBadge(rate: number | null) {
  if (rate == null) {
    return <StatusPill tone="neutral">No data</StatusPill>;
  }
  const pct = Math.round(rate * 100);
  return (
    <StatusPill tone={TIER_TONE[tierFor(rate)]} className="font-mono font-semibold">
      {pct}% attendance
    </StatusPill>
  );
}

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

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-gold">Dashboard</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
          Your classes
        </h1>
        <p className="mt-1 text-ink/70">
          Create a class, then manage students, QR sheets, and attendance.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
            figure={{ kind: "number", value: totalStudents }}
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
          <CollapsibleSection id="insights" title="Insights" defaultOpen>
            {insights.length === 0 ? (
              <p className="text-sm text-ink/60">No issues detected.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {insights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        insight.severity === "warning" ? "bg-danger" : "bg-success"
                      }`}
                    />
                    {insight.text}
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>
        </div>

        <div className="mt-8">
          <CollapsibleSection
            id="class-list"
            title="Classes"
            subtitle={`${classList.length} class${classList.length === 1 ? "" : "es"}`}
            defaultOpen
          >
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stats.map((s) => (
                <li
                  key={s.classRow.id}
                  className="group flex flex-col gap-3 rounded-[10px] border border-line bg-card p-5 transition hover:border-gold/60"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/10 font-display text-sm font-semibold text-gold">
                      {classInitials(s.classRow.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-semibold text-ink">
                        {s.classRow.name}
                      </p>
                      <p className="truncate text-sm text-ink/60">
                        {s.classRow.subject || "No subject set"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-ink/50">
                      {s.studentCount} student{s.studentCount === 1 ? "" : "s"}
                    </span>
                    {attendanceBadge(s.attendanceRate)}
                  </div>

                  <div className="mt-auto flex items-center justify-between border-t border-line/40 pt-3">
                    <Button href={`/dashboard/classes/${s.classRow.id}`} variant="secondary" size="sm">
                      Open →
                    </Button>
                    <ArchiveButton classId={s.classRow.id} name={s.classRow.name} archived={false} />
                  </div>
                </li>
              ))}
            </ul>
            {classList.length === 0 && (
              <p className="mt-3 text-ink/60">
                No classes yet — add your first one above.
              </p>
            )}
          </CollapsibleSection>
        </div>

        <ArchivedClasses classes={archivedClasses} />
      </div>
    </div>
  );
}
