"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toLastNameFirst } from "@/lib/name-format";
import type { Student } from "@/lib/types";
import type { StudentActivityTier } from "@/lib/dashboard-insights";
import { useToast } from "@/app/_components/toast";
import Button from "@/app/_components/button";
import { Input, Select } from "@/app/_components/input";
import { StatCard } from "@/app/_components/stat-card";
import { TileIcon } from "@/app/_components/tile-icon";
import { CardRow } from "@/app/_components/card-row";
import { StatusPill, type StatusTone } from "@/app/_components/status-pill";
import { getCategoryColor } from "@/lib/category-colors";

type Row = { student: Student; classId: string; className: string; tier: StudentActivityTier | null };
type NameFix = { id: string; className: string; from: string; to: string };

const ICON_STUDENTS = "M5.5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10.5 7a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM2 13c0-2 1.6-3.5 3.5-3.5S9 11 9 13M9.3 9.7c1.6.1 2.7 1.6 2.7 3.3";
const ICON_CLASSES = "M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1 1.3H12.5A1.5 1.5 0 0 1 14 5.8v5.7A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7z";
const ICON_SEARCH = "M7.2 12.4a5.2 5.2 0 1 0 0-10.4 5.2 5.2 0 0 0 0 10.4zM11 11l3.5 3.5";

const TIER_LABEL: Record<StudentActivityTier, string> = {
  active: "Active",
  "at-risk": "At risk",
  inactive: "Inactive",
};

const TIER_TONE: Record<StudentActivityTier, StatusTone> = {
  active: "success",
  "at-risk": "warning",
  inactive: "danger",
};

const AVATAR_CLASSES: Record<ReturnType<typeof getCategoryColor>, string> = {
  sage: "bg-sage-tint text-sage",
  dustyblue: "bg-dustyblue-tint text-dustyblue",
  clay: "bg-clay-tint text-clay",
  violet: "bg-violet-tint text-violet",
};

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

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
        <StatCard
          label="Total students"
          icon={<TileIcon path={ICON_STUDENTS} tone="gold" />}
          figure={{ kind: "number", value: rows.length, mono: true }}
        />
        <StatCard
          label="Classes"
          icon={<TileIcon path={ICON_CLASSES} tone="success" />}
          figure={{ kind: "number", value: classOptions.length, mono: true }}
        />
        <StatCard
          label="Showing"
          icon={<TileIcon path={ICON_SEARCH} tone="warning" />}
          figure={{ kind: "number", value: filtered.length, mono: true }}
        />
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

      <div className="mt-6">
        <p className="text-sm font-semibold text-ink">All students</p>
        <p className="text-xs text-muted">Every enrolled student across your classes.</p>
        <div className="mt-2 flex flex-col gap-1">
          {filtered.map((r) => {
            const category = getCategoryColor(`${r.className} ${r.student.name}`);
            return (
              <CardRow
                key={r.student.id}
                leading={
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full font-display text-xs font-semibold ${AVATAR_CLASSES[category]}`}
                  >
                    {initials(r.student.name)}
                  </span>
                }
                title={r.student.name}
                meta={
                  <>
                    <Link href={`/dashboard/classes/${r.classId}`} className="underline underline-offset-2 hover:text-ink">
                      {r.className}
                    </Link>
                    {" · "}
                    <span className="font-mono">{r.student.code}</span>
                  </>
                }
                trailing={
                  <>
                    {r.tier && <StatusPill tone={TIER_TONE[r.tier]} dot>{TIER_LABEL[r.tier]}</StatusPill>}
                    <Button href={`/record-card/${r.classId}/${r.student.id}`} variant="secondary" size="sm">
                      Record Card
                    </Button>
                  </>
                }
              />
            );
          })}
          {filtered.length === 0 && (
            <p className="py-4 text-sm text-muted">
              {rows.length === 0 ? "No students yet." : "No students match your filters."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
