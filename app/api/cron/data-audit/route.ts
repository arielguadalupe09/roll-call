import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditData } from "@/lib/data-audit";

export const dynamic = "force-dynamic";

const PAGE = 1000;

// PostgREST caps a single response at 1000 rows, so page through anything
// that can plausibly be larger than that (students, attempts).
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

// Weekly read-only audit (see vercel.json). Vercel Cron sends
// `Authorization: Bearer $CRON_SECRET`; without that header this is a 401,
// since it uses the service-role client and reads across every teacher's data.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const [classes, students, sessions, attempts] = await Promise.all([
      fetchAll((f, t) => admin.from("classes").select("id, name, archived").range(f, t)),
      fetchAll((f, t) => admin.from("students").select("id, class_id, name, code").range(f, t)),
      fetchAll((f, t) =>
        admin.from("sessions").select("id, class_id, date, opened_at, closed_at").is("closed_at", null).range(f, t),
      ),
      fetchAll((f, t) =>
        admin.from("exam_attempts").select("id, exam_id, student_id, started_at, submitted_at").is("submitted_at", null).range(f, t),
      ),
    ]);

    const findings = auditData({ classes, students, sessions, attempts });
    if (findings.length > 0) {
      // Shows up in Vercel's runtime logs; this is the only report channel.
      console.warn(`[data-audit] ${findings.length} finding(s)`, JSON.stringify(findings));
    } else {
      console.log("[data-audit] clean");
    }
    return NextResponse.json({ ok: true, count: findings.length, findings });
  } catch (err) {
    console.error("[data-audit] failed", err);
    return NextResponse.json({ error: "Audit failed" }, { status: 500 });
  }
}
