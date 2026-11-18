import type { StatusTone } from "./status-pill";
import { ChartTooltip } from "./chart-tooltip";

// Solid fill for a bar segment or legend dot -- distinct from StatusPill's
// tinted-pill background, since a bar segment needs to read as a filled
// mark, not a badge. Same underlying tokens either way.
const SOLID_BG: Record<StatusTone, string> = {
  success: "bg-chart-good",
  // Slate, not --chart-warning: that token is navy, which made the middle
  // segment indistinguishable from "success" in a three-part bar.
  warning: "bg-slate",
  danger: "bg-chart-critical",
  neutral: "bg-line",
  navy: "bg-navy",
  sage: "bg-sage",
  dustyblue: "bg-dustyblue",
  clay: "bg-clay",
  violet: "bg-violet",
};

const HEIGHT_CLASSES = { sm: "h-1", md: "h-1.5" } as const;

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
          {visible.map((s, i) => (
            <ChartTooltip
              key={s.label}
              label={`${s.label}: ${s.count}`}
              className="h-full"
              style={{ width: `${(s.count / total) * 100}%` }}
            >
              {/* Only the outer ends are rounded, so the segments read as one
                  bar. Not overflow-hidden on the track: it would clip the tooltip. */}
              <div
                className={`h-full w-full transition hover:brightness-110 ${SOLID_BG[s.tone]} ${
                  i === 0 ? "rounded-l-full" : ""
                } ${i === visible.length - 1 ? "rounded-r-full" : ""}`}
              />
            </ChartTooltip>
          ))}
        </div>
      )}
      <ul className="mt-3 flex flex-col gap-1.5 text-xs text-muted">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SOLID_BG[s.tone]}`} />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="font-mono font-medium tabular-nums text-ink">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
