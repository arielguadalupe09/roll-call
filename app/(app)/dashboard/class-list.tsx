import type { ClassStats } from "@/lib/dashboard-insights";
import { getAttendanceGroup } from "@/lib/chart-tiers";
import { ClassCard } from "@/app/_components/class-card";
import ArchiveButton from "./archive-button";

// Prop names ("danger"/"success") are just this file's own local labels for
// "needs attention" vs "on track" groups -- rendered colors follow the same
// navy/gold duotone as the rest of the attendance-rate tier system (see
// app/globals.css's --chart-* comment), not the generic red/green tokens.
const DOT_CLASSES = {
  danger: "bg-warning",
  success: "bg-navy",
  neutral: "bg-muted",
} as const;

function GroupLabel({
  tone,
  children,
}: {
  tone: keyof typeof DOT_CLASSES;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 first:mt-0 [&:not(:first-child)]:mt-6">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASSES[tone]}`} />
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">{children}</span>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
    </div>
  );
}

function CardGrid({ stats, warmBorder = false }: { stats: ClassStats[]; warmBorder?: boolean }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((s) => (
        <ClassCard
          key={s.classRow.id}
          slug={s.classRow.slug}
          name={s.classRow.name}
          subject={s.classRow.subject}
          studentCount={s.studentCount}
          attendanceRate={s.attendanceRate}
          warmBorder={warmBorder}
          archiveSlot={
            <ArchiveButton
              classId={s.classRow.id}
              name={s.classRow.name}
              archived={false}
              className="w-full"
            />
          }
        />
      ))}
    </ul>
  );
}

// Splits the class-list grid into attendance-health groups (per the
// academic-grading-system card redesign) instead of one flat grid. The
// "Excellent" (>=90%) group only gets its own section when there's a
// meaningful number of them (2+) -- a single excellent class doesn't
// justify a third section, so it folds into "On track" instead.
export default function ClassList({ stats }: { stats: ClassStats[] }) {
  const needsAttention = stats.filter((s) => getAttendanceGroup(s.attendanceRate) === "needs-attention");
  const onTrack = stats.filter((s) => getAttendanceGroup(s.attendanceRate) === "on-track");
  const excellent = stats.filter((s) => getAttendanceGroup(s.attendanceRate) === "excellent");
  const noData = stats.filter((s) => getAttendanceGroup(s.attendanceRate) === "no-data");

  const splitExcellent = excellent.length >= 2;
  const onTrackGroup = splitExcellent ? onTrack : [...onTrack, ...excellent];

  return (
    <div>
      {needsAttention.length > 0 && (
        <>
          <GroupLabel tone="danger">Needs attention · below 75%</GroupLabel>
          <CardGrid stats={needsAttention} warmBorder />
        </>
      )}
      {onTrackGroup.length > 0 && (
        <>
          <GroupLabel tone="success">
            On track · 75%{splitExcellent ? "–89%" : " and above"}
          </GroupLabel>
          <CardGrid stats={onTrackGroup} />
        </>
      )}
      {splitExcellent && (
        <>
          <GroupLabel tone="success">Excellent · 90%+</GroupLabel>
          <CardGrid stats={excellent} />
        </>
      )}
      {noData.length > 0 && (
        <>
          <GroupLabel tone="neutral">No sessions yet</GroupLabel>
          <CardGrid stats={noData} />
        </>
      )}
    </div>
  );
}
