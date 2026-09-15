import type { StatusTone } from "./status-pill";

const TONE_CLASSES: Record<StatusTone | "gold", string> = {
  gold: "bg-gold/10 text-gold",
  success: "bg-success/10 text-success-text",
  warning: "bg-warning/10 text-warning-text",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-ink/[0.06] text-ink/60",
  sage: "bg-sage-tint text-ink",
  dustyblue: "bg-dustyblue-tint text-ink",
  clay: "bg-clay-tint text-ink",
  violet: "bg-violet-tint text-ink",
};

// Small circular icon badge for a StatCard's top-right corner -- shared so
// every KPI-row page (Dashboard, Students, Attendance, Gradebook) draws
// from the same icon-badge treatment instead of each re-styling its own.
export function TileIcon({ path, tone }: { path: string; tone: StatusTone | "gold" }) {
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONE_CLASSES[tone]}`}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d={path} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
