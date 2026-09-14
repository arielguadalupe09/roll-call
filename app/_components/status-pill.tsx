// Tinted background + matching text only -- never a raw saturated fill.
// Domain -> tone mapping (e.g. attendance "present" -> "success") stays at
// each call site; this component doesn't know about domain status types.
const TONE_CLASSES = {
  success: "bg-success/12 text-success-text",
  warning: "bg-warning/15 text-warning-text",
  danger: "bg-danger/12 text-danger",
  neutral: "bg-line text-muted",
  // Category tones (subject/topic color-coding): tinted bg + dark ink text,
  // matching hue reserved for the accompanying left-accent border elsewhere.
  sage: "bg-sage-tint text-ink",
  dustyblue: "bg-dustyblue-tint text-ink",
  clay: "bg-clay-tint text-ink",
  violet: "bg-violet-tint text-ink",
} as const;

export type StatusTone = keyof typeof TONE_CLASSES;

export function StatusPill({
  tone,
  className = "",
  children,
}: {
  tone: StatusTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
