import { createClient } from "@/lib/supabase/client";

type AuditEntry = {
  teacherId: string;
  action: string;
  description: string;
  classId?: string | null;
};

// Fire-and-forget: the audit trail is a secondary record of what already
// happened, not something a failed write should block or surface to the
// teacher -- the primary mutation (attendance/student/grading change) has
// already succeeded by the time this is called.
export async function logAudit(supabase: ReturnType<typeof createClient>, entry: AuditEntry) {
  const { error } = await supabase.from("audit_log").insert({
    teacher_id: entry.teacherId,
    action: entry.action,
    description: entry.description,
    class_id: entry.classId ?? null,
  });
  if (error) {
    console.error("Failed to write audit log entry:", error.message);
  }
}
