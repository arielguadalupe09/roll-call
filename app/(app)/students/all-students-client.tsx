"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toLastNameFirst } from "@/lib/name-format";
import type { Student } from "@/lib/types";
import { useToast } from "@/app/_components/toast";

type Row = { student: Student; classId: string; className: string };
type NameFix = { id: string; className: string; from: string; to: string };

export default function AllStudentsClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [pendingFixes, setPendingFixes] = useState<NameFix[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.classId, r.className);
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (classFilter !== "all" && r.classId !== classFilter) return false;
      if (!q) return true;
      return (
        r.student.name.toLowerCase().includes(q) ||
        r.student.code.toLowerCase().includes(q) ||
        r.className.toLowerCase().includes(q)
      );
    });
  }, [rows, query, classFilter]);

  function checkNameFormatting() {
    setChecking(true);
    const fixes: NameFix[] = [];
    for (const r of rows) {
      const formatted = toLastNameFirst(r.student.name);
      if (formatted !== r.student.name) {
        fixes.push({
          id: r.student.id,
          className: r.className,
          from: r.student.name,
          to: formatted,
        });
      }
    }
    setChecking(false);
    setPendingFixes(fixes);
    if (fixes.length === 0) {
      showToast("Every name is already formatted as Lastname, Firstname M.I.");
    }
  }

  async function applyFixes() {
    if (!pendingFixes || pendingFixes.length === 0) return;
    setApplying(true);
    const supabase = createClient();

    const results = await Promise.all(
      pendingFixes.map((fix) =>
        supabase.from("students").update({ name: fix.to }).eq("id", fix.id),
      ),
    );

    setApplying(false);
    const failed = results.filter((r) => r.error).length;
    const succeeded = results.length - failed;

    if (succeeded > 0) {
      showToast(
        failed > 0
          ? `Reformatted ${succeeded} name${succeeded === 1 ? "" : "s"}, ${failed} failed`
          : `Reformatted ${succeeded} name${succeeded === 1 ? "" : "s"}`,
      );
    } else {
      showToast("Couldn't update those names. Try again.");
    }
    setPendingFixes(null);
    router.refresh();
  }

  return (
    <div className="mt-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-sm border border-rule bg-white p-4 text-center">
          <p className="font-display text-2xl font-semibold text-ink">{rows.length}</p>
          <p className="font-mono text-xs uppercase tracking-wide text-ink/60">
            Total students
          </p>
        </div>
        <div className="rounded-sm border border-rule bg-white p-4 text-center">
          <p className="font-display text-2xl font-semibold text-ink">
            {classOptions.length}
          </p>
          <p className="font-mono text-xs uppercase tracking-wide text-ink/60">Classes</p>
        </div>
        <div className="rounded-sm border border-rule bg-white p-4 text-center">
          <p className="font-display text-2xl font-semibold text-ink">{filtered.length}</p>
          <p className="font-mono text-xs uppercase tracking-wide text-ink/60">Showing</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name, code, or class..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
        />
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="rounded-sm border border-rule bg-white px-3 py-2 text-ink outline-none focus:border-brass"
        >
          <option value="all">All classes</option>
          {classOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <button
          onClick={checkNameFormatting}
          disabled={checking || rows.length === 0}
          className="whitespace-nowrap rounded-sm border border-teal px-4 py-2 font-medium text-teal transition hover:bg-teal/10 disabled:opacity-60"
        >
          Check name formatting
        </button>
      </div>

      {pendingFixes && pendingFixes.length > 0 && (
        <div className="mt-4 rounded-sm border border-brass bg-brass/10 p-4">
          <p className="font-medium text-ink">
            {pendingFixes.length} name{pendingFixes.length === 1 ? "" : "s"} across all
            classes {pendingFixes.length === 1 ? "doesn&apos;t" : "don&apos;t"} match
            &ldquo;Lastname, Firstname M.I.&rdquo; — mostly full middle names that
            weren&apos;t abbreviated.
          </p>
          <ul className="mt-3 max-h-64 overflow-y-auto rounded-sm border border-rule/60 bg-white">
            {pendingFixes.map((fix) => (
              <li
                key={fix.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-rule/40 px-3 py-2 text-sm last:border-b-0"
              >
                <span className="text-ink/60">{fix.className}</span>
                <span className="font-mono">
                  <span className="text-ink/70">{fix.from}</span>
                  <span className="mx-2 text-ink/40">→</span>
                  <span className="font-semibold text-ink">{fix.to}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={applyFixes}
              disabled={applying}
              className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
            >
              {applying
                ? "Updating..."
                : `Apply ${pendingFixes.length} fix${pendingFixes.length === 1 ? "" : "es"}`}
            </button>
            <button
              onClick={() => setPendingFixes(null)}
              className="text-sm text-ink/60 underline underline-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-sm border border-rule">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-rule bg-white font-mono text-xs uppercase tracking-wide text-ink/60">
              <th className="py-2 px-3">Name</th>
              <th className="py-2 px-3">Class</th>
              <th className="py-2 px-3">Code</th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.student.id} className="border-b border-rule/50 bg-white">
                <td className="py-2 px-3 font-semibold uppercase tracking-wide text-ink">
                  {r.student.name}
                </td>
                <td className="py-2 px-3">
                  <Link
                    href={`/dashboard/classes/${r.classId}`}
                    className="text-teal underline underline-offset-2"
                  >
                    {r.className}
                  </Link>
                </td>
                <td className="py-2 px-3 font-mono text-teal">{r.student.code}</td>
                <td className="py-2 px-3 text-right">
                  <Link
                    href={`/record-card/${r.classId}/${r.student.id}`}
                    className="text-sm text-teal underline underline-offset-2"
                  >
                    Record Card
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 px-3 text-ink/60">
                  {rows.length === 0 ? "No students yet." : "No students match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
