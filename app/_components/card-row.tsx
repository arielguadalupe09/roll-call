import Link from "next/link";

// The core repeating unit of the card-row/pill portal design: leading
// icon/avatar, a title (optionally linked), one metadata line, and trailing
// content that's usually a StatusPill or action Button. White bg, no
// border -- separation comes from the warm page background, not a hairline.
export function CardRow({
  leading,
  title,
  titleHref,
  meta,
  trailing,
  className = "",
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  titleHref?: string;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl bg-card px-4 py-3 transition hover:bg-slate-light/50 ${className}`}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink first-letter:capitalize">
          {titleHref ? (
            <Link href={titleHref} className="hover:underline">
              {title}
            </Link>
          ) : (
            title
          )}
        </p>
        {meta && <p className="mt-0.5 truncate text-xs text-muted first-letter:capitalize">{meta}</p>}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
    </div>
  );
}
