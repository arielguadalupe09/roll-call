"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Student } from "@/lib/types";

type Row = { student: Student; classId: string; className: string };

export default function AllStudentsClient({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");

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

      <div className="mt-6 flex flex-wrap gap-3">
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
      </div>

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
