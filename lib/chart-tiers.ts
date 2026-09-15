// Shared threshold-tier logic for every rate-based chart/bar/stat in the
// app -- attendance, and anything else normalized to the same 0-100 scale
// that reuses these bands rather than inventing its own. Centralized so no
// component redefines its own copy of the good/warning/critical cutoffs or
// color classes.
export type Tier = "good" | "warning" | "critical";

// Tailwind's build-time scanner needs the full class name literal somewhere
// in the codebase's text -- `bg-chart-${tier}` would never get generated, so
// tier -> class is a lookup table instead of a template string.
export const TIER_BG: Record<Tier, string> = {
  good: "bg-chart-good",
  warning: "bg-chart-warning",
  critical: "bg-chart-critical",
};

export const TIER_TEXT: Record<Tier, string> = {
  good: "text-chart-good",
  warning: "text-chart-warning",
  critical: "text-chart-critical",
};

export function tierFor(
  rate: number,
  cutoffs: { good: number; warning: number } = { good: 0.9, warning: 0.75 },
): Tier {
  if (rate >= cutoffs.good) return "good";
  if (rate >= cutoffs.warning) return "warning";
  return "critical";
}

// Same bands as tierFor, relabeled for grouping a list of classes/students
// by attendance health rather than coloring a single figure. "no-data"
// covers a class with no sessions recorded yet, which isn't a tier at all.
export type AttendanceGroup = "needs-attention" | "on-track" | "excellent" | "no-data";

export function getAttendanceGroup(rate: number | null): AttendanceGroup {
  if (rate == null) return "no-data";
  const tier = tierFor(rate);
  if (tier === "good") return "excellent";
  if (tier === "warning") return "on-track";
  return "needs-attention";
}
