import type { ClassStats } from "@/lib/dashboard-insights";

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

/** Small radial gauge for a single 0-1 rate, used in the Attendance KPI tile. */
export function AttendanceRing({ rate }: { rate: number | null }) {
  const r = 15.5;
  const circumference = 2 * Math.PI * r;
  const pct = rate == null ? 0 : Math.max(0, Math.min(1, rate));
  const tier = rate == null ? null : tierFor(pct);
  const colorClass = tier ? TIER_TEXT[tier] : "text-rule";

  return (
    <svg width="52" height="52" viewBox="0 0 36 36" className="shrink-0" role="img" aria-label={rate == null ? "No attendance data yet" : `${Math.round(pct * 100)}% average attendance`}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--rule)" strokeOpacity="0.3" strokeWidth="3" />
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
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
        <div
          className="h-full bg-chart-good"
          style={{ width: `${activePct}%` }}
          title={`${active} active`}
        />
        {archived > 0 && (
          <div
            className="h-full bg-rule"
            style={{ width: `${100 - activePct}%` }}
            title={`${archived} archived`}
          />
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
    <div className="mt-2 flex h-6 items-end gap-[2px]" role="img" aria-label="Students per class">
      {classes.map((c) => (
        <div
          key={c.name}
          title={`${c.name}: ${c.count} student${c.count === 1 ? "" : "s"}`}
          className="min-h-[3px] flex-1 rounded-t-sm bg-chart-good/70"
          style={{ height: `${Math.max(10, (c.count / max) * 100)}%` }}
        />
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
        <div key={i.label} className="flex items-center gap-1.5" title={`${i.label}: ${i.count}`}>
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
    <div className="rounded-sm border border-rule bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold text-ink">Attendance by class</p>
          <p className="mt-0.5 text-sm text-ink/60">
            Session attendance rate for each of your active classes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wide text-ink/60">
          <Legend swatch="bg-chart-good" label="≥ 90%" />
          <Legend swatch="bg-chart-warning" label="75–89%" />
          <Legend swatch="bg-chart-critical" label="< 75%" />
          {hasNoData && <Legend swatch="bg-ink/15" label="No data" />}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-ink/60">No classes yet.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {rows.map((s) => {
            const rate = s.attendanceRate;
            const pct = rate == null ? 0 : Math.round(rate * 100);
            const barColor = rate == null ? "bg-ink/15" : TIER_BG[tierFor(rate)];
            return (
              <div
                key={s.classRow.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(8rem,14rem)_minmax(0,1fr)_auto]"
                title={`${s.classRow.name}: ${rate == null ? "no sessions recorded yet" : `${pct}% attendance`}, ${s.studentCount} student${s.studentCount === 1 ? "" : "s"}`}
              >
                <span className="hidden truncate font-semibold uppercase tracking-wide text-ink sm:block">
                  {s.classRow.name}
                </span>
                <div className="col-span-2 flex flex-col gap-0.5 sm:col-span-1">
                  <span className="truncate text-xs font-semibold uppercase tracking-wide text-ink sm:hidden">
                    {s.classRow.name}
                  </span>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
                    <div
                      className={`h-full rounded-full ${barColor}`}
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
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${swatch}`} />
      {label}
    </span>
  );
}
