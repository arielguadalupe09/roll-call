"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toLastNameFirst } from "@/lib/name-format";
import type { Student } from "@/lib/types";
import { useToast } from "@/app/_components/toast";
import Button from "@/app/_components/button";
import { Input, Select } from "@/app/_components/input";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/app/_components/table";
import { StatCard } from "@/app/_components/stat-card";

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
        <StatCard label="Total students" figure={{ kind: "number", value: rows.length, mono: true }} />
        <StatCard label="Classes" figure={{ kind: "number", value: classOptions.length, mono: true }} />
        <StatCard label="Showing" figure={{ kind: "number", value: filtered.length, mono: true }} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Input
          type="text"
          placeholder="Search by name, code, or class..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1"
        />
        <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="!w-auto">
          <option value="all">All classes</option>
          {classOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <Button
          variant="secondary"
          className="whitespace-nowrap"
          onClick={checkNameFormatting}
          disabled={checking || rows.length === 0}
        >
          Check name formatting
        </Button>
      </div>

      {pendingFixes && pendingFixes.length > 0 && (
        <div className="mt-4 rounded-lg border border-gold/60 bg-gold/10 p-4">
          <p className="font-medium text-ink">
            {pendingFixes.length} name{pendingFixes.length === 1 ? "" : "s"} across all
            classes {pendingFixes.length === 1 ? "doesn&apos;t" : "don&apos;t"} match
            &ldquo;Lastname, Firstname M.I.&rdquo; — mostly full middle names that
            weren&apos;t abbreviated.
          </p>
          <ul className="mt-3 max-h-64 overflow-y-auto rounded-sm border border-line/60 bg-white">
            {pendingFixes.map((fix) => (
              <li
                key={fix.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line/40 px-3 py-2 text-sm last:border-b-0"
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
            <Button onClick={applyFixes} disabled={applying}>
              {applying
                ? "Updating..."
                : `Apply ${pendingFixes.length} fix${pendingFixes.length === 1 ? "" : "es"}`}
            </Button>
            <Button variant="secondary" onClick={() => setPendingFixes(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Class</TableHeaderCell>
              <TableHeaderCell>Code</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.student.id} striped>
                <TableCell className="font-semibold">{r.student.name}</TableCell>
                <TableCell>
                  <Link
                    href={`/dashboard/classes/${r.classId}`}
                    className="text-slate underline underline-offset-2"
                  >
                    {r.className}
                  </Link>
                </TableCell>
                <TableCell tabular className="text-slate">{r.student.code}</TableCell>
                <TableCell align="right">
                  <Button href={`/record-card/${r.classId}/${r.student.id}`} variant="secondary" size="sm">
                    Record Card
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-4">
                  {rows.length === 0 ? "No students yet." : "No students match your filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
