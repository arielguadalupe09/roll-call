import { tierFor, TIER_TEXT } from "@/lib/chart-tiers";

// Circular gauge for a single 0-1 rate, tier-colored -- the "single
// aggregate rate" pattern used anywhere a card would otherwise show a bare
// percentage (attendance, completion, any rate against the same 75/90
// bands).
export function StatusRing({
  rate,
  size = 52,
  label,
  emptyLabel = "No data yet",
  // "dark" is for placing the ring on a navy/ink surface (e.g. the student
  // profile hero) where the default light-card track/text would be
  // unreadably faint.
  variant = "light",
}: {
  rate: number | null;
  size?: number;
  label?: string;
  emptyLabel?: string;
  variant?: "light" | "dark";
}) {
  const r = 15.5;
  const circumference = 2 * Math.PI * r;
  const pct = rate == null ? 0 : Math.max(0, Math.min(1, rate));
  const tier = rate == null ? null : tierFor(pct);
  const colorClass = tier ? TIER_TEXT[tier] : variant === "dark" ? "text-card/50" : "text-card/70";
  const ariaLabel = label ?? (rate == null ? emptyLabel : `${Math.round(pct * 100)}%`);

  return (
    <svg width={size} height={size} viewBox="0 0 36 36" className="shrink-0" role="img" aria-label={ariaLabel}>
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke={variant === "dark" ? "var(--card)" : "var(--line)"}
        strokeOpacity={variant === "dark" ? 0.2 : 1}
        strokeWidth="3"
      />
      {rate != null && (
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          className={colorClass}
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          transform="rotate(-90 18 18)"
        />
      )}
      <text
        x="18"
        y="20.5"
        textAnchor="middle"
        fontSize="9"
        className={`font-mono font-semibold ${variant === "dark" ? "fill-card" : "fill-ink"}`}
      >
        {rate == null ? "—" : `${Math.round(pct * 100)}%`}
      </text>
    </svg>
  );
}
