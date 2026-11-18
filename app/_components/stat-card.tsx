import Link from "next/link";
import { StatusRing } from "./status-ring";
import { StackedBreakdownBar, type BreakdownSegment } from "./stacked-breakdown-bar";

type Figure =
  // `mono` swaps the serif headline-number treatment for tabular figures --
  // for a count that reads as live/tabular data (e.g. a filtered result
  // count) rather than a one-off headline stat.
  | { kind: "number"; value: string | number; danger?: boolean; mono?: boolean }
  | { kind: "ring"; rate: number | null; caption?: string }
  | { kind: "breakdown"; segments: BreakdownSegment[] };

// The shared shell for every stat/KPI tile in the app: a flat white surface
// with no border or shadow, separated from the page by fill alone -- plus one
// of three "figure" shapes so a single rate becomes a ring, a raw count stays
// a number, and a composite breakdown becomes a stacked bar, instead of each
// card picking its own bespoke chart.
export function StatCard({
  label,
  href,
  icon,
  figure,
  footnote,
  className = "",
}: {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  figure: Figure;
  footnote?: React.ReactNode;
  className?: string;
}) {
  const shellClass = `group block rounded-[10px] bg-card p-4 transition ${
    href ? "hover:bg-slate-light/50 focus-visible:outline-2 focus-visible:outline-slate" : ""
  } ${className}`;

  const content = (
    <>
      {/* Fixed height so the figures line up across a row of cards, with or
          without an icon. */}
      <div className="flex h-8 items-center justify-between gap-2">
        <p className="text-sm text-muted first-letter:capitalize">{label}</p>
        {icon}
      </div>
      <div className="mt-3">
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
            <StatusRing rate={figure.rate} size={64} />
            {figure.caption && <p className="text-xs text-muted">{figure.caption}</p>}
          </div>
        )}
        {figure.kind === "breakdown" && (
          <>
            <p className="font-display text-3xl font-semibold text-ink">
              {figure.segments.reduce((sum, s) => sum + s.count, 0)}
            </p>
            <div className="mt-3">
              <StackedBreakdownBar segments={figure.segments} />
            </div>
          </>
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
