import { TIER_BG, type Tier } from "@/lib/chart-tiers";

// Shared legend for the good/warning/critical tier bands -- used beside
// every chart/table that colors a value by threshold, so the encoding is
// never color-alone.
export function TierLegend({ hasNoData }: { hasNoData?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
      <LegendSwatch tone="good" label="≥ 90%" />
      <LegendSwatch tone="warning" label="75–89%" />
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
