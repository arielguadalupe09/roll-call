"use client";

export type PortalTab = "overview" | "grades" | "attendance";

const TABS: { key: PortalTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "grades", label: "Grades" },
  { key: "attendance", label: "Attendance" },
];

// The navy chrome for the student portal: a back button, a serif course
// title with a muted eyebrow, and (once a class is loaded) the
// Overview/Grades/Attendance tabs -- the same "navy-soft fill on the active
// item" treatment the instructor sidebar uses for its active nav link,
// applied horizontally here instead of down a vertical list.
export default function PortalTopBar({
  eyebrow,
  title,
  tab,
  onTabChange,
  onBack,
  backLabel = "Back",
}: {
  eyebrow: string;
  title: string;
  tab?: PortalTab;
  onTabChange?: (tab: PortalTab) => void;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <header className="sticky top-0 z-10 bg-navy px-4 py-3 sm:px-8">
      <div className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              aria-label={backLabel}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-card/70 transition hover:bg-navy-soft hover:text-card focus-visible:bg-navy-soft focus-visible:text-card"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path
                  d="M11 4l-5 5 5 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          <div className="min-w-0">
            <p className="truncate text-xs text-card/60">{eyebrow}</p>
            <h1 className="truncate font-display text-xl font-semibold text-card sm:text-2xl">
              {title}
            </h1>
          </div>
        </div>

        {tab && onTabChange && (
          <nav
            className="flex items-center gap-1 rounded-full bg-navy-soft/40 p-1"
            aria-label="Student portal sections"
          >
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => onTabChange(key)}
                aria-current={tab === key ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition focus-visible:bg-navy-soft focus-visible:text-card ${
                  tab === key
                    ? "bg-navy-soft text-card"
                    : "text-card/70 hover:bg-navy-soft/60 hover:text-card"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
