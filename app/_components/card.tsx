const VARIANT_CLASSES = {
  default: "border border-line bg-card",
  flat: "",
  accent: "border border-line border-t-2 border-t-gold bg-card",
} as const;

type CardVariant = keyof typeof VARIANT_CLASSES;

export function Card({
  variant = "default",
  className = "",
  children,
}: {
  variant?: CardVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-[10px] p-4 sm:p-5 ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className = "",
  chevron,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  // When set, the title/subtitle become a toggle button with a rotating
  // chevron instead of a static header -- the single collapsible-header
  // implementation shared by CollapsibleSection and any other card that
  // needs the same expand/collapse affordance.
  //
  // The whole title row is a button, so it gets a hover fill and a text label
  // beside the chevron ("Show"/"Hide" by default) -- a bare chevron alone was
  // easy to miss as clickable. Pass openLabel/closedLabel for a more specific
  // call to action (e.g. "Enter scores").
  chevron?: { open: boolean; onToggle: () => void; openLabel?: string; closedLabel?: string };
}) {
  const titleBlock = (
    <div>
      <h2 className="font-display text-lg font-semibold text-ink first-letter:capitalize">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-muted first-letter:capitalize">{subtitle}</p>}
    </div>
  );

  if (!chevron) {
    return (
      <div className={`mb-4 flex flex-wrap items-start justify-between gap-3 ${className}`}>
        {titleBlock}
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 ${className}`}>
      <button
        onClick={chevron.onToggle}
        aria-expanded={chevron.open}
        aria-label={chevron.open ? "Collapse section" : "Expand section"}
        className="group -m-2 flex flex-1 cursor-pointer items-center justify-between gap-4 rounded-[8px] p-2 text-left transition hover:bg-paper focus-visible:bg-paper"
      >
        {titleBlock}
        <span className="flex shrink-0 items-center gap-2 text-slate transition group-hover:text-navy group-focus-visible:text-navy">
          <span className="text-xs font-semibold">
            {chevron.open ? (chevron.openLabel ?? "Hide") : (chevron.closedLabel ?? "Show")}
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card transition group-hover:border-slate">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className={`transition-transform ${chevron.open ? "rotate-180" : ""}`}
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          </span>
        </span>
      </button>
      {actions}
    </div>
  );
}
