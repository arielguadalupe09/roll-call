import type { StatusTone } from "./status-pill";
import { ChartTooltip } from "./chart-tooltip";

// Solid fill for a bar segment or legend dot -- distinct from StatusPill's
// tinted-pill background, since a bar segment needs to read as a filled
// mark, not a badge. Same underlying tokens either way.
const SOLID_BG: Record<StatusTone, string> = {
  success: "bg-chart-good",
  warning: "bg-chart-warning",
  danger: "bg-chart-critical",
  neutral: "bg-line",
  sage: "bg-sage",
  dustyblue: "bg-dustyblue",
  clay: "bg-clay",
  violet: "bg-violet",
};

const HEIGHT_CLASSES = { sm: "h-1.5", md: "h-2.5" } as const;

export type BreakdownSegment = { tone: StatusTone; count: number; label: string };

// A single composite/breakdown card's figure: one stacked horizontal bar
// (success/warning/danger/... segments, proportional to count) plus a dot
// + label + tabular-count legend beneath -- the one pattern every "how is
// this split up" card in the app uses, instead of a bespoke chart per card.
export function StackedBreakdownBar({
  segments,
  height = "md",
}: {
  segments: BreakdownSegment[];
  height?: keyof typeof HEIGHT_CLASSES;
}) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  const visible = segments.filter((s) => s.count > 0);

  return (
    <div>
      {total === 0 ? (
        <div className={`w-full rounded-full bg-ink/10 ${HEIGHT_CLASSES[height]}`} />
      ) : (
        <div className={`flex w-full gap-[2px] ${HEIGHT_CLASSES[height]}`}>
          {visible.map((s) => (
            <ChartTooltip
              key={s.label}
              label={`${s.label}: ${s.count}`}
              className="h-full"
              style={{ width: `${(s.count / total) * 100}%` }}
            >
              <div className={`h-full w-full rounded-full transition hover:brightness-110 ${SOLID_BG[s.tone]}`} />
            </ChartTooltip>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${SOLID_BG[s.tone]}`} />
            {s.label}
            <span className="font-mono text-ink/60">{s.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
