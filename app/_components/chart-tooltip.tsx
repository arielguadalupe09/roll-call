// Shared hover/focus tooltip for a single chart mark (bar, segment, dot) --
// the mark itself is the hit target, per the dataviz skill's interaction
// spec, rather than a crude native `title` attribute tooltip.
export function ChartTooltip({
  label,
  className = "",
  style,
  children,
}: {
  label: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`group/tip relative flex items-end outline-none ${className}`}
      style={style}
      tabIndex={0}
    >
      {children}
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-navy px-2 py-1 text-[11px] font-medium text-card opacity-0 transition-opacity duration-100 group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100"
      >
        {label}
      </div>
    </div>
  );
}
