export function PageHeader({
  eyebrow,
  title,
  actions,
  className = "",
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div>
        {eyebrow && <p className="text-sm text-muted">{eyebrow}</p>}
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
