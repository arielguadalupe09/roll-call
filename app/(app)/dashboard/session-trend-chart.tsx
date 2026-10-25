"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { LOW_ATTENDANCE_THRESHOLD } from "@/lib/dashboard-insights";
import { tierFor, TIER_BG, type Tier } from "@/lib/chart-tiers";
import { ChartTooltip } from "@/app/_components/chart-tooltip";
import { TierLegend } from "@/app/_components/chart-legend";

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const GRIDLINES = [0, 50, 100];

// Two-tone bars: a pale full-height column (100%) behind the solid fill,
// both from the same palette hue -- navy on slate-light, gold on gold-soft.
const GHOST_BG: Record<Tier, string> = {
  good: "bg-slate-light",
  warning: "bg-slate-light",
  critical: "bg-gold-soft",
};

/**
 * Per-session attendance bars for a single class: two-tone navy/gold bars
 * on faint gridlines, with the 75% threshold marked in gold on the axis.
 * Hovering a bar dims the rest; bars grow in on mount (skipped under
 * prefers-reduced-motion).
 */
export function SessionTrendChart({ series }: { series: { date: string; rate: number }[] }) {
  const plotRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!plotRef.current) return;
    const mm = gsap.matchMedia(plotRef);
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from("[data-session-bar]", {
        scaleY: 0,
        transformOrigin: "bottom center",
        duration: 0.55,
        stagger: 0.03,
        ease: "power3.out",
      });
    });
    return () => mm.revert();
  }, [series]);

  if (series.length === 0) {
    return <p className="text-sm text-ink/60">No sessions recorded yet.</p>;
  }

  const thresholdPct = Math.round(LOW_ATTENDANCE_THRESHOLD * 100);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <TierLegend />
      </div>
      <div ref={plotRef} className="flex gap-2">
        <div aria-hidden="true" className="relative h-28 w-8 shrink-0 font-mono text-[10px] leading-none text-ink/40">
          {GRIDLINES.map((g) => (
            <span key={g} className="absolute right-0 translate-y-1/2" style={{ bottom: `${g}%` }}>
              {g}%
            </span>
          ))}
          <span
            className="absolute right-0 translate-y-1/2 font-semibold text-warning-text"
            style={{ bottom: `${thresholdPct}%` }}
          >
            {thresholdPct}%
          </span>
        </div>

        <div className="relative min-w-0 flex-1">
          {GRIDLINES.map((g) => (
            <div
              key={g}
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 border-t border-line"
              style={{ bottom: `${g}%` }}
            />
          ))}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 z-[1] border-t border-dashed border-gold"
            style={{ bottom: `${thresholdPct}%` }}
          />
          <div className="group/plot relative flex h-28 items-end gap-1 sm:gap-1.5" role="img" aria-label="Attendance rate per session">
            {series.map((point) => {
              const pct = Math.round(point.rate * 100);
              return (
                <ChartTooltip
                  key={point.date}
                  label={`${shortDate(point.date)}: ${pct}%`}
                  className="h-full min-w-0 max-w-10 flex-1"
                >
                  <div
                    className={`relative h-full w-full overflow-hidden rounded-t-md rounded-b-[2px] transition-opacity duration-150 group-hover/plot:opacity-35 group-hover/tip:opacity-100! ${GHOST_BG[tierFor(point.rate)]}`}
                  >
                    <div
                      data-session-bar
                      className={`absolute inset-x-0 bottom-0 rounded-t-md ${TIER_BG[tierFor(point.rate)]}`}
                      style={{ height: `${Math.max(3, pct)}%` }}
                    />
                  </div>
                </ChartTooltip>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-2 flex justify-between pl-10 font-mono text-[10px] text-ink/50">
        <span>{shortDate(series[0].date)}</span>
        {series.length > 1 && <span>{shortDate(series[series.length - 1].date)}</span>}
      </div>
    </div>
  );
}
