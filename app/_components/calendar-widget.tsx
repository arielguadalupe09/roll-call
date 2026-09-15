// Compact "this month" glance widget for the Dashboard's right rail --
// today gets a filled dot, days with a recorded session get an underline
// dot. Read-only (no month navigation) by design, to keep this a quick
// glance rather than a full calendar app.
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export function CalendarWidget({ sessionDates }: { sessionDates: string[] }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const sessionDays = new Set(
    sessionDates
      .map((d) => new Date(`${d}T00:00:00`))
      .filter((d) => d.getFullYear() === year && d.getMonth() === month)
      .map((d) => d.getDate()),
  );

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthLabel = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="rounded-xl bg-card p-4">
      <p className="text-sm font-semibold text-ink">{monthLabel}</p>
      <div className="mt-3 grid grid-cols-7 gap-y-1.5 text-center">
        {WEEKDAY_LABELS.map((w, i) => (
          <span key={i} className="text-[10px] font-medium text-muted">
            {w}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day == null) return <span key={i} />;
          const isToday = day === today;
          const hasSession = sessionDays.has(day);
          return (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  isToday ? "bg-navy font-semibold text-card" : "text-ink"
                }`}
              >
                {day}
              </span>
              <span className={`h-1 w-1 rounded-full ${hasSession && !isToday ? "bg-gold" : ""}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
