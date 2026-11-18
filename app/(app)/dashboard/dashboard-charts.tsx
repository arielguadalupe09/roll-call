import type { ClassStats } from "@/lib/dashboard-insights";
import CollapsibleSection from "@/app/_components/collapsible-section";
import { tierFor } from "@/lib/chart-tiers";
import { TierLegend } from "@/app/_components/chart-legend";
import { CardRow } from "@/app/_components/card-row";
import { StatusPill, type StatusTone } from "@/app/_components/status-pill";

// Duotone: navy = meeting the 75% bar (good + warning tiers), gold = below
// it (critical) -- see the --chart-* retint comment in app/globals.css.
const TIER_TONE: Record<ReturnType<typeof tierFor>, StatusTone> = {
  good: "navy",
  warning: "navy",
  critical: "warning",
};

/** Reason counts for the "Need attention" KPI tile, styled like the breakdown legends. */
export function AttentionBreakdown({
  items,
}: {
  items: { label: string; count: number }[];
}) {
  const visible = items.filter((i) => i.count > 0);
  if (visible.length === 0) {
    return <p className="mt-3 text-xs text-muted">All classes look healthy.</p>;
  }

  return (
    <ul className="mt-3 flex flex-col gap-1.5 text-xs text-muted">
      {visible.slice(0, 3).map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
          <span className="min-w-0 flex-1 truncate">{i.label}</span>
          <span className="font-mono font-medium tabular-nums text-ink">{i.count}</span>
        </li>
      ))}
    </ul>
  );
}

/** Card-row list: attendance rate per class, as a status pill rather than a bar. */
export function AttendanceByClassChart({ stats }: { stats: ClassStats[] }) {
  const rows = [...stats].sort((a, b) => {
    if (a.attendanceRate == null && b.attendanceRate == null) return 0;
    if (a.attendanceRate == null) return 1;
    if (b.attendanceRate == null) return -1;
    return b.attendanceRate - a.attendanceRate;
  });
  const hasNoData = rows.some((r) => r.attendanceRate == null);

  return (
    <CollapsibleSection
      title="Attendance by class"
      subtitle="Session attendance rate for each of your active classes."
      variant="primary"
      actions={<TierLegend hasNoData={hasNoData} />}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-ink/60">No classes yet.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {rows.map((s) => {
            const rate = s.attendanceRate;
            const pct = rate == null ? null : Math.round(rate * 100);
            const tone: StatusTone = rate == null ? "neutral" : TIER_TONE[tierFor(rate)];
            return (
              <CardRow
                key={s.classRow.id}
                title={s.classRow.name}
                meta={`${s.studentCount} student${s.studentCount === 1 ? "" : "s"}`}
                trailing={
                  <StatusPill tone={tone} dot className="font-mono">
                    {pct == null ? "No data" : `${pct}%`}
                  </StatusPill>
                }
              />
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}
