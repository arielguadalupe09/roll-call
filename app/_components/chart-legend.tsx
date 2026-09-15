import { TIER_BG, type Tier } from "@/lib/chart-tiers";

// Shared legend for the attendance-rate duotone -- good and warning tiers
// render identically (navy, "meeting the 75% bar") since app/globals.css's
// --chart-* tokens collapsed to two colors, so this shows two swatches
// (not three) instead of implying a distinction the colors no longer make.
export function TierLegend({ hasNoData }: { hasNoData?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
      <LegendSwatch tone="good" label="≥ 75%" />
      <LegendSwatch tone="critical" label="< 75%" />
      {hasNoData && (
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ink/15" />
          No data
        </span>
      )}
    </div>
  );
}

function LegendSwatch({ tone, label }: { tone: Tier; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${TIER_BG[tone]}`} />
      {label}
    </span>
  );
}
