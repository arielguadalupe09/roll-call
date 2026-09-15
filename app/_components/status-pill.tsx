// Tinted background + matching text only -- never a raw saturated fill.
// Domain -> tone mapping (e.g. attendance "present" -> "success") stays at
// each call site; this component doesn't know about domain status types.
const TONE_CLASSES = {
  success: "bg-success/12 text-success-text",
  warning: "bg-warning/15 text-warning-text",
  danger: "bg-danger/12 text-danger",
  neutral: "bg-line text-muted",
  // Navy half of the attendance-rate duotone (lib/chart-tiers.ts) -- the
  // "meeting the bar" signal, paired with the existing gold "warning" tone
  // for "below it," instead of introducing a fourth traffic-light hue.
  navy: "bg-navy/10 text-navy",
  // Category tones (subject/topic color-coding): tinted bg + dark ink text,
  // matching hue reserved for the accompanying left-accent border elsewhere.
  sage: "bg-sage-tint text-ink",
  dustyblue: "bg-dustyblue-tint text-ink",
  clay: "bg-clay-tint text-ink",
  violet: "bg-violet-tint text-ink",
} as const;

export type StatusTone = keyof typeof TONE_CLASSES;

const DOT_CLASSES: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-muted",
  navy: "bg-navy",
  sage: "bg-sage",
  dustyblue: "bg-dustyblue",
  clay: "bg-clay",
  violet: "bg-violet",
};

export function StatusPill({
  tone,
  dot = false,
  className = "",
  children,
}: {
  tone: StatusTone;
  // A small leading color dot, for when the pill sits somewhere the tint
  // alone might not read clearly as a status signal (e.g. next to other
  // tinted chips) -- color is still never the *only* signal, since the
  // label text stays.
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASSES[tone]}`} />}
      {children}
    </span>
  );
}
