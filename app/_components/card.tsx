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
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-4 flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
