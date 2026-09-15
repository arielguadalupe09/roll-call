import Link from "next/link";
import { StatusRing } from "./status-ring";
import { StackedBreakdownBar, type BreakdownSegment } from "./stacked-breakdown-bar";

type Figure =
  // `mono` swaps the serif headline-number treatment for tabular figures --
  // for a count that reads as live/tabular data (e.g. a filtered result
  // count) rather than a one-off headline stat.
  | { kind: "number"; value: string | number; danger?: boolean; mono?: boolean }
  | { kind: "ring"; rate: number | null; caption?: string }
  | { kind: "breakdown"; segments: BreakdownSegment[] }
  // A plain circular badge for a headline count that isn't a rate (so it
  // can't honestly use StatusRing's percentage arc) -- e.g. "12 classes
  // need attention".
  | { kind: "badge"; value: string | number; danger?: boolean };

// The shared shell for every stat/KPI tile in the app: white bg, hairline
// border, 10px radius, no shadow -- plus one of three "figure" shapes so a
// single rate becomes a ring, a raw count stays a number, and a composite
// breakdown becomes a stacked bar, instead of each card picking its own
// bespoke chart.
export function StatCard({
  label,
  href,
  icon,
  figure,
  footnote,
  alert = false,
  className = "",
}: {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  figure: Figure;
  footnote?: React.ReactNode;
  alert?: boolean;
  className?: string;
}) {
  const shellClass = `group rounded-[10px] border p-4 transition ${
    alert
      ? "border-danger/30 bg-danger/[0.04] hover:border-danger/60"
      : "border-line bg-card hover:border-gold/60"
  } ${className}`;

  const content = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{label}</p>
        {icon}
      </div>
      <div className="mt-2">
        {figure.kind === "number" && (
          <p
            className={`text-3xl font-semibold ${figure.mono ? "font-mono" : "font-display"} ${
              figure.danger ? "text-danger" : "text-ink"
            }`}
          >
            {figure.value}
          </p>
        )}
        {figure.kind === "ring" && (
          <div className="flex items-center gap-3">
            <StatusRing rate={figure.rate} />
            {figure.caption && <p className="text-xs text-ink/60">{figure.caption}</p>}
          </div>
        )}
        {figure.kind === "breakdown" && (
          <>
            <p className="font-display text-3xl font-semibold text-ink">
              {figure.segments.reduce((sum, s) => sum + s.count, 0)}
            </p>
            <div className="mt-2">
              <StackedBreakdownBar segments={figure.segments} />
            </div>
          </>
        )}
        {figure.kind === "badge" && (
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full font-display text-xl font-semibold ${
              figure.danger ? "bg-danger/10 text-danger" : "bg-ink/[0.06] text-ink"
            }`}
          >
            {figure.value}
          </div>
        )}
      </div>
      {footnote}
    </>
  );

  if (!href) return <div className={shellClass}>{content}</div>;
  if (href.startsWith("#")) {
    return (
      <a href={href} className={shellClass}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={shellClass}>
      {content}
    </Link>
  );
}
