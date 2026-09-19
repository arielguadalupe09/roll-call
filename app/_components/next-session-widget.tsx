"use client";

import { useEffect, useState } from "react";
import type { DayOfWeek, ScheduleEntry } from "@/lib/types";

const DAY_INDEX: Record<DayOfWeek, number> = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
};

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Nearest upcoming occurrence of a weekly-recurring entry from `now`,
// ignoring school_year/semester (a teacher only has one or two active
// terms' worth of entries at a time in practice, so the rare overlap isn't
// worth extra plumbing for a glance widget).
function nextOccurrence(entry: ScheduleEntry, now: Date): Date {
  const targetDay = DAY_INDEX[entry.day_of_week];
  const startMinutes = toMinutes(entry.start_time);
  const nowDay = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let dayDelta = (targetDay - nowDay + 7) % 7;
  if (dayDelta === 0 && startMinutes <= nowMinutes) dayDelta = 7;

  const result = new Date(now);
  result.setDate(now.getDate() + dayDelta);
  result.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  return result;
}

function relativeLabel(target: Date, now: Date): string {
  const diffMs = target.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `in ${diffMin} min`;
  const sameDay = target.toDateString() === now.toDateString();
  const time = target.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `today, ${time}`;
  const isTomorrow = target.toDateString() === new Date(now.getTime() + 86400000).toDateString();
  if (isTomorrow) return `tomorrow, ${time}`;
  return `${target.toLocaleDateString(undefined, { weekday: "short" })}, ${time}`;
}

export function NextSessionWidget({ scheduleEntries }: { scheduleEntries: ScheduleEntry[] }) {
  // Lazy initializer so the ticking clock starts from a real timestamp
  // immediately; the inevitable one-off server/client render mismatch (SSR
  // time vs. hydration time) is exactly what suppressHydrationWarning below
  // is for, rather than delaying the first paint with a null placeholder.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // 1s so the minute rolls over in step with the top bar's seconds clock.
    const id = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);

  const clock = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  let nextLabel = "No upcoming classes";
  let nextTime: string | null = null;
  if (scheduleEntries.length > 0) {
    const upcoming = scheduleEntries
      .map((entry) => ({ entry, at: nextOccurrence(entry, now) }))
      .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
    if (upcoming) {
      nextLabel = `${upcoming.entry.subject_code}${upcoming.entry.section ? ` · ${upcoming.entry.section}` : ""}`;
      nextTime = `${relativeLabel(upcoming.at, now)}${upcoming.entry.room ? ` · ${upcoming.entry.room}` : ""}`;
    }
  }

  return (
    <div className="rounded-xl bg-navy p-4 text-card">
      <p className="font-mono text-2xl font-semibold tabular-nums" suppressHydrationWarning>
        {clock}
      </p>
      <p className="mt-3 text-xs text-card/70">Next class</p>
      <p className="mt-0.5 truncate text-sm font-semibold" suppressHydrationWarning>
        {nextLabel}
      </p>
      {nextTime && (
        <p className="mt-0.5 truncate text-xs text-card/70" suppressHydrationWarning>
          {nextTime}
        </p>
      )}
    </div>
  );
}
