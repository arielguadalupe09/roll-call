import type { ClassStats } from "@/lib/dashboard-insights";
import CollapsibleSection from "@/app/_components/collapsible-section";
import { tierFor, TIER_BG } from "@/lib/chart-tiers";
import { ChartTooltip } from "@/app/_components/chart-tooltip";
import { TierLegend } from "@/app/_components/chart-legend";
import { ThresholdBar } from "@/app/_components/threshold-bar";

/** Mini breakdown bars for the "Need attention" KPI tile. */
export function AttentionBreakdown({
  items,
}: {
  items: { label: string; count: number }[];
}) {
  const visible = items.filter((i) => i.count > 0);
  if (visible.length === 0) {
    return <p className="mt-2 text-[11px] text-ink/50">All classes look healthy.</p>;
  }
  const max = Math.max(...visible.map((i) => i.count));

  return (
    <div className="mt-2 flex flex-col gap-1">
      {visible.slice(0, 3).map((i) => (
        <div key={i.label} className="flex items-center gap-1.5">
          <span className="w-[4.5rem] shrink-0 truncate text-[9px] text-ink/60">{i.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full bg-chart-warning"
              style={{ width: `${Math.max(8, (i.count / max) * 100)}%` }}
            />
          </div>
          <span className="w-4 shrink-0 text-right font-mono text-[10px] text-ink/60">{i.count}</span>
        </div>
      ))}
    </div>
  );
}

/** Full-width horizontal bar chart: attendance rate per class. */
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
      defaultOpen
      variant="primary"
      actions={<TierLegend hasNoData={hasNoData} />}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-ink/60">No classes yet.</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {rows.map((s) => {
            const rate = s.attendanceRate;
            const pct = rate == null ? 0 : Math.round(rate * 100);
            return (
              <div
                key={s.classRow.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-1.5 py-1.5 transition hover:bg-slate-light sm:grid-cols-[minmax(8rem,14rem)_minmax(0,1fr)_auto]"
              >
                <span className="hidden truncate font-semibold text-ink sm:block">
                  {s.classRow.name}
                </span>
                <div className="col-span-2 flex flex-col gap-0.5 sm:col-span-1">
                  <span className="truncate text-xs font-semibold text-ink sm:hidden">
                    {s.classRow.name}
                  </span>
                  {rate == null ? (
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink/10" />
                  ) : (
                    <ThresholdBar value={rate} />
                  )}
                </div>
                <span className="whitespace-nowrap text-right font-mono text-xs text-ink/70">
                  {rate == null ? "No data" : `${pct}%`}
                  <span className="ml-1.5 text-ink/40">· {s.studentCount}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}

/** Per-session attendance rate over time, for a single class' analytics panel. */
export function SessionTrendChart({ series }: { series: { date: string; rate: number }[] }) {
  if (series.length === 0) {
    return <p className="text-sm text-ink/60">No sessions recorded yet.</p>;
  }

  return (
    <div>
      <div className="mb-1.5 flex justify-end">
        <TierLegend />
      </div>
      <div className="flex h-24 items-end justify-center gap-1" role="img" aria-label="Attendance rate per session">
        {series.map((point) => {
          const pct = Math.round(point.rate * 100);
          const formattedDate = new Date(`${point.date}T00:00:00`).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
          return (
            <ChartTooltip
              key={point.date}
              label={`${formattedDate}: ${pct}%`}
              className="h-full max-w-6 flex-1"
            >
              <div
                className={`min-h-[3px] w-full rounded-t transition hover:brightness-110 ${TIER_BG[tierFor(point.rate)]}`}
                style={{ height: `${Math.max(4, pct)}%` }}
              />
            </ChartTooltip>
          );
        })}
      </div>
    </div>
  );
}
