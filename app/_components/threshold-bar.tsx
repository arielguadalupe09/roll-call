import { tierFor, TIER_BG } from "@/lib/chart-tiers";

const HEIGHT_CLASSES = { sm: "h-1.5", md: "h-2.5" } as const;

// Horizontal proportional bar, tier-colored by which threshold band the
// value falls into, with tick marks at the cutoffs themselves -- so a
// value's position relative to "passing"/"honors"/whatever the band means
// is visible at a glance, not just implied by fill length.
export function ThresholdBar({
  value,
  thresholds = [{ value: 0.75, label: "75%" }, { value: 0.9, label: "90%" }],
  height = "md",
  showValue = false,
}: {
  value: number;
  thresholds?: { value: number; label?: string }[];
  height?: keyof typeof HEIGHT_CLASSES;
  showValue?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value));
  const sorted = [...thresholds].sort((a, b) => a.value - b.value);
  const cutoffs =
    sorted.length >= 2
      ? { warning: sorted[0].value, good: sorted[sorted.length - 1].value }
      : { good: 0.9, warning: 0.75 };
  const tier = tierFor(pct, cutoffs);
  const fillPct = pct > 0 ? Math.max(pct * 100, 3) : 0;

  return (
    <div className="flex items-center gap-2">
      <div
        className={`relative w-full overflow-hidden rounded-full bg-ink/10 ${HEIGHT_CLASSES[height]}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${TIER_BG[tier]}`}
          style={{ width: `${fillPct}%` }}
        />
        {thresholds.map((t) => (
          <span
            key={t.value}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 h-full w-px bg-ink/[0.18]"
            style={{ left: `${Math.max(0, Math.min(100, t.value * 100))}%` }}
          />
        ))}
      </div>
      {showValue && (
        <span className="shrink-0 whitespace-nowrap text-right font-mono text-xs text-ink/70">
          {Math.round(pct * 100)}%
        </span>
      )}
    </div>
  );
}
