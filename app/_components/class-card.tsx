import Button from "./button";
import { StatusPill, type StatusTone } from "./status-pill";
import { getCategoryColor } from "@/lib/category-colors";
import { tierFor } from "@/lib/chart-tiers";

const AVATAR_CLASSES: Record<ReturnType<typeof getCategoryColor>, string> = {
  sage: "bg-sage-tint text-sage",
  dustyblue: "bg-dustyblue-tint text-dustyblue",
  clay: "bg-clay-tint text-clay",
  violet: "bg-violet-tint text-violet",
};

// Duotone: navy = meeting the 75% bar (good + warning tiers), gold = below
// it (critical) -- see the --chart-* retint comment in app/globals.css.
const TIER_TONE: Record<ReturnType<typeof tierFor>, StatusTone> = {
  good: "navy",
  warning: "navy",
  critical: "warning",
};

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Shared "class card" tile: avatar chip color-coded by subject/category,
// tabular student count, a quiet tinted attendance status tag, and an
// Open/Archive action row with a clear primary/secondary hierarchy. Used by
// the Dashboard's class-list grid; built generically enough to reuse
// anywhere else a list of classes needs the same card.
export function ClassCard({
  id,
  name,
  subject,
  studentCount,
  attendanceRate,
  archiveSlot,
  warmBorder = false,
}: {
  id: string;
  name: string;
  subject: string | null;
  studentCount: number;
  attendanceRate: number | null;
  // Rendered as the secondary action -- passed in rather than built here
  // since it's a stateful client component (confirm dialog, toast, undo).
  archiveSlot: React.ReactNode;
  // Subtle warm-tinted border for cards grouped under "needs attention",
  // reinforcing the grouping without relying on the status tag color alone.
  warmBorder?: boolean;
}) {
  const category = getCategoryColor(`${name} ${subject ?? ""}`);
  const pct = attendanceRate == null ? null : Math.round(attendanceRate * 100);
  const tone = attendanceRate == null ? "neutral" : TIER_TONE[tierFor(attendanceRate)];

  return (
    <li
      className={`group flex flex-col gap-3 rounded-[10px] border bg-card p-5 transition hover:border-gold/60 ${
        warmBorder ? "border-danger/20" : "border-line"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold ${AVATAR_CLASSES[category]}`}
        >
          {initials(name)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold text-ink">{name}</p>
          <p className="truncate text-sm text-muted">{subject || "No subject set"}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs">
          <span className="font-semibold text-ink">{studentCount}</span>{" "}
          <span className="text-muted">student{studentCount === 1 ? "" : "s"}</span>
        </span>
        <StatusPill tone={tone} dot className="font-mono">
          {pct == null ? "No data" : `${pct}%`}
        </StatusPill>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-line/40 pt-3">
        <Button href={`/dashboard/classes/${id}`} variant="primary" size="sm" className="flex-1">
          Open
        </Button>
        <div className="flex-1">{archiveSlot}</div>
      </div>
    </li>
  );
}
