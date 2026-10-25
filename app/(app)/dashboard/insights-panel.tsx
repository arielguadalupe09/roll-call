"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import type { Insight } from "@/lib/dashboard-insights";

export type LowAttendanceRow = {
  id: string;
  name: string;
  slug: string;
  low: number;
  total: number;
};

// Dashboard Insights body. Low-attendance classes get their own ranked list
// (worst share of the class first, with a bar for that share) since a bare
// "56 students below 75%" can't be compared to "4 students" without knowing
// each class's size. The remaining insights stay as plain lines. Mounted
// only while the section is open, so the bars replay on every open.
export function InsightsPanel({
  lowAttendance,
  thresholdPct,
  others,
}: {
  lowAttendance: LowAttendanceRow[];
  thresholdPct: number;
  others: Insight[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!rootRef.current) return;
    const mm = gsap.matchMedia(rootRef);
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from("[data-insight-row]", {
        opacity: 0,
        y: 4,
        duration: 0.2,
        stagger: 0.03,
        ease: "power1.out",
      });
      gsap.from("[data-insight-bar]", {
        scaleX: 0,
        transformOrigin: "left center",
        duration: 0.5,
        stagger: 0.03,
        ease: "power2.out",
        delay: 0.05,
      });
    });
    return () => mm.revert();
  }, []);

  if (lowAttendance.length === 0 && others.length === 0) {
    return <p className="text-sm text-ink/60">No issues detected.</p>;
  }

  const rows = [...lowAttendance].sort((a, b) => b.low / b.total - a.low / a.total || b.low - a.low);

  return (
    <div ref={rootRef} className="flex flex-col gap-5">
      {rows.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Students below {thresholdPct}% attendance</h3>
            <span className="text-xs text-muted">Share of class</span>
          </div>
          <ol className="flex flex-col">
            {rows.map((r) => {
              const share = r.low / r.total;
              return (
                <li key={r.id} data-insight-row>
                  <Link
                    href={`/dashboard/classes/${r.slug}`}
                    className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-md px-2 py-2 hover:bg-slate-light/50 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_7rem]"
                  >
                    <span className="truncate text-sm text-ink group-hover:underline">{r.name}</span>
                    <span className="col-span-2 row-start-2 h-2 overflow-hidden rounded-full bg-navy/[0.07] sm:col-span-1 sm:row-start-auto">
                      <span
                        data-insight-bar
                        className="block h-full rounded-full bg-chart-critical"
                        style={{ width: `${Math.max(2, share * 100)}%` }}
                      />
                    </span>
                    <span className="col-start-2 row-start-1 text-right font-mono text-xs tabular-nums text-ink/70 sm:col-start-auto sm:row-start-auto">
                      <span className="font-semibold text-ink">{r.low}</span>/{r.total}
                      <span className="ml-2 inline-block w-9 text-ink/50">{Math.round(share * 100)}%</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {others.length > 0 && (
        <section className={rows.length > 0 ? "border-t border-line pt-4" : ""}>
          <ul className="flex flex-col gap-2">
            {others.map((insight) => (
              <li key={insight.text} data-insight-row className="flex items-start gap-2.5 px-2 text-sm text-ink">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 block h-2 w-2 shrink-0 rounded-full ${
                    insight.severity === "warning" ? "bg-danger" : "bg-ink/30"
                  }`}
                />
                <span className="sr-only">{insight.severity === "warning" ? "Warning: " : "Note: "}</span>
                {insight.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
