"use client";

import type { DayOfWeek, ScheduleEntry } from "@/lib/types";
import { formatTime12h } from "@/lib/time-format";
import { useNow } from "./use-now";

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
  const time = formatTime12h(target);
  if (sameDay) return `today, ${time}`;
  const isTomorrow = target.toDateString() === new Date(now.getTime() + 86400000).toDateString();
  if (isTomorrow) return `tomorrow, ${time}`;
  return `${target.toLocaleDateString(undefined, { weekday: "short" })}, ${time}`;
}

export function NextSessionWidget({ scheduleEntries }: { scheduleEntries: ScheduleEntry[] }) {
  // Null until mounted: both the clock and which class is "next" depend on
  // the teacher's local time, which the server (UTC) doesn't know.
  const now = useNow();

  const clock = now ? formatTime12h(now) : " ";

  let nextLabel = now ? "No upcoming classes" : " ";
  let nextTime: string | null = null;
  if (now && scheduleEntries.length > 0) {
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
      <p className="font-mono text-2xl font-semibold tabular-nums">
        {clock}
      </p>
      <p className="mt-3 text-xs text-card/70">Next class</p>
      <p className="mt-0.5 truncate text-sm font-semibold">
        {nextLabel}
      </p>
      {nextTime && (
        <p className="mt-0.5 truncate text-xs text-card/70">
          {nextTime}
        </p>
      )}
    </div>
  );
}
