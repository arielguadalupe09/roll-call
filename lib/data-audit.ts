import { nameKey } from "./name-format";

export type AuditClass = { id: string; name: string; archived: boolean };
export type AuditStudent = { id: string; class_id: string; name: string; code: string };
export type AuditSession = {
  id: string;
  class_id: string;
  date: string;
  opened_at: string | null;
  closed_at: string | null;
};
export type AuditAttempt = {
  id: string;
  exam_id: string;
  student_id: string;
  started_at: string;
  submitted_at: string | null;
};

export type AuditFinding = {
  check: "duplicate_student" | "stale_open_session" | "stale_exam_attempt" | "empty_class";
  message: string;
  ids: string[];
};

const STALE_MS = 24 * 60 * 60 * 1000;

// Read-only integrity checks over already-fetched rows. Nothing here touches
// the database, so it's safe to run against production data on a schedule.
export function auditData(
  data: {
    classes: AuditClass[];
    students: AuditStudent[];
    sessions: AuditSession[];
    attempts: AuditAttempt[];
  },
  now: Date = new Date(),
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const className = new Map(data.classes.map((c) => [c.id, c.name]));

  const byNameInClass = new Map<string, AuditStudent[]>();
  for (const s of data.students) {
    const key = `${s.class_id}|${nameKey(s.name)}`;
    const list = byNameInClass.get(key) ?? [];
    list.push(s);
    byNameInClass.set(key, list);
  }
  for (const list of byNameInClass.values()) {
    if (list.length < 2) continue;
    findings.push({
      check: "duplicate_student",
      message: `"${list[0].name}" appears ${list.length} times in ${className.get(list[0].class_id) ?? "an unknown class"} (codes ${list.map((s) => s.code).join(", ")})`,
      ids: list.map((s) => s.id),
    });
  }

  for (const s of data.sessions) {
    if (s.closed_at || !s.opened_at) continue;
    const ageMs = now.getTime() - new Date(s.opened_at).getTime();
    if (ageMs < STALE_MS) continue;
    findings.push({
      check: "stale_open_session",
      message: `Session for ${className.get(s.class_id) ?? "an unknown class"} (${s.date}) has been open for ${Math.floor(ageMs / STALE_MS)}+ day(s)`,
      ids: [s.id],
    });
  }

  for (const a of data.attempts) {
    if (a.submitted_at) continue;
    const ageMs = now.getTime() - new Date(a.started_at).getTime();
    if (ageMs < STALE_MS) continue;
    findings.push({
      check: "stale_exam_attempt",
      message: `Exam attempt started ${Math.floor(ageMs / STALE_MS)}+ day(s) ago was never submitted`,
      ids: [a.id],
    });
  }

  const classesWithStudents = new Set(data.students.map((s) => s.class_id));
  for (const c of data.classes) {
    if (c.archived || classesWithStudents.has(c.id)) continue;
    findings.push({
      check: "empty_class",
      message: `Class "${c.name}" has no students`,
      ids: [c.id],
    });
  }

  return findings;
}
