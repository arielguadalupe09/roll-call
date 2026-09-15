import type { ClassStats } from "@/lib/dashboard-insights";
import CollapsibleSection from "@/app/_components/collapsible-section";

type Tier = "good" | "warning" | "critical";

// Tailwind's build-time scanner needs the full class name literal somewhere
// in this file's text -- `bg-chart-${tier}` would never get generated, so
// tier -> class is a lookup table instead of a template string.
const TIER_TEXT: Record<Tier, string> = {
  good: "text-chart-good",
  warning: "text-chart-warning",
  critical: "text-chart-critical",
};
const TIER_BG: Record<Tier, string> = {
  good: "bg-chart-good",
  warning: "bg-chart-warning",
  critical: "bg-chart-critical",
};

function tierFor(rate: number): Tier {
  if (rate >= 0.9) return "good";
  if (rate >= 0.75) return "warning";
  return "critical";
}

// Shared hover/focus tooltip for a single mark (bar, segment, dot) -- the
// mark itself is the hit target, per the dataviz skill's interaction spec,
// rather than a crude native `title` attribute tooltip.
function ChartTooltip({
  label,
  className = "",
  style,
  children,
}: {
  label: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`group/tip relative flex items-end outline-none ${className}`}
      style={style}
      tabIndex={0}
    >
      {children}
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-navy px-2 py-1 text-[11px] font-medium text-card opacity-0 transition-opacity duration-100 group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100"
      >
        {label}
      </div>
    </div>
  );
}

function TierLegend({ hasNoData }: { hasNoData?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
      <LegendSwatch tone="good" label="≥ 90%" />
      <LegendSwatch tone="warning" label="75–89%" />
      <LegendSwatch tone="critical" label="< 75%" />
      {hasNoData && (
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ink/15" />
          No data
        </span>
      )}
    </div>
  );
}

function LegendSwatch({ tone, label }: { tone: Tier; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${TIER_BG[tone]}`} />
      {label}
    </span>
  );
}

/** Small radial gauge for a single 0-1 rate, used in the Attendance KPI tile. */
export function AttendanceRing({ rate }: { rate: number | null }) {
  const r = 15.5;
  const circumference = 2 * Math.PI * r;
  const pct = rate == null ? 0 : Math.max(0, Math.min(1, rate));
  const tier = rate == null ? null : tierFor(pct);
  const colorClass = tier ? TIER_TEXT[tier] : "text-card/70";

  return (
    <svg width="52" height="52" viewBox="0 0 36 36" className="shrink-0" role="img" aria-label={rate == null ? "No attendance data yet" : `${Math.round(pct * 100)}% average attendance`}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--line)" strokeWidth="3" />
      {rate != null && (
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          className={colorClass}
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          transform="rotate(-90 18 18)"
        />
      )}
      <text x="18" y="20.5" textAnchor="middle" fontSize="9" className="fill-ink font-mono font-semibold">
        {rate == null ? "—" : `${Math.round(pct * 100)}%`}
      </text>
    </svg>
  );
}

/** Two-segment horizontal bar: active vs archived class counts. */
export function ActiveArchivedBar({ active, archived }: { active: number; archived: number }) {
  const total = active + archived;
  if (total === 0) return <div className="mt-2 h-1.5 rounded-full bg-ink/10" />;
  const activePct = (active / total) * 100;

  return (
    <div className="mt-2">
      <div className="flex h-1.5 w-full gap-[2px]">
        <ChartTooltip label={`${active} active`} className="h-full" style={{ width: `${activePct}%` }}>
          <div className="h-full w-full rounded-full bg-chart-good transition hover:brightness-110" />
        </ChartTooltip>
        {archived > 0 && (
          <ChartTooltip label={`${archived} archived`} className="h-full" style={{ width: `${100 - activePct}%` }}>
            <div className="h-full w-full rounded-full bg-line transition hover:brightness-95" />
          </ChartTooltip>
        )}
      </div>
      <p className="mt-1 font-mono text-[10px] text-ink/50">
        {archived > 0 ? `${active} active · ${archived} archived` : "all active"}
      </p>
    </div>
  );
}

/** Tiny per-class sparkline for the Students KPI tile. */
export function StudentsSparkline({ classes }: { classes: { name: string; count: number }[] }) {
  if (classes.length === 0) return <div className="mt-2 h-6" />;
  const max = Math.max(1, ...classes.map((c) => c.count));

  return (
    <div className="mt-2 flex h-6 items-end justify-center gap-[2px]" role="img" aria-label="Students per class">
      {classes.map((c) => (
        <ChartTooltip
          key={c.name}
          label={`${c.name}: ${c.count} student${c.count === 1 ? "" : "s"}`}
          className="h-full max-w-[10px] flex-1"
        >
          <div
            className="min-h-[3px] w-full rounded-t bg-chart-good/70 transition hover:bg-chart-good"
            style={{ height: `${Math.max(10, (c.count / max) * 100)}%` }}
          />
        </ChartTooltip>
      ))}
    </div>
  );
}

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
            const barColor = rate == null ? "bg-ink/15" : TIER_BG[tierFor(rate)];
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
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ${barColor}`}
                      style={{ width: `${rate == null ? 100 : Math.max(pct, 3)}%` }}
                    />
                  </div>
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
