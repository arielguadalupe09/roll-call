import { useCallback, useMemo, useState } from "react";
import type {
  Assessment,
  AssessmentScore,
  Assignment,
  Attendance,
  GradeAdjustment,
  GradeRelease,
  GradingConfig,
  MajorExam,
  MajorExamScore,
  ParticipationLog,
  Period,
  Student,
  Submission,
} from "@/lib/types";
import type { ClassGradingData } from "@/lib/record-card-data";
import { computeDhvsuGrades, gradeDescriptive, type DhvsuEquivalent } from "@/lib/dhvsu-grade";
import { CLASS_STANDING_SLOTS, criterionLabel } from "@/lib/grading-criteria";
import CollapsibleSection from "@/app/_components/collapsible-section";
import { useToast } from "@/app/_components/toast";
import { useConfirm } from "@/app/_components/confirm-provider";
import { createClient } from "@/lib/supabase/client";
import MenuSelect from "@/app/_components/menu-select";
import Button from "@/app/_components/button";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/app/_components/table";
import { StatCard } from "@/app/_components/stat-card";
import { TileIcon } from "@/app/_components/tile-icon";
import { tierFor, TIER_TEXT, type Tier } from "@/lib/chart-tiers";

const PERIOD_LABEL: Record<Period, string> = {
  prelim: "Prelim",
  midterm: "Midterm",
  finals: "Finals",
};

const ICON_STUDENTS = "M5.5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10.5 7a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM2 13c0-2 1.6-3.5 3.5-3.5S9 11 9 13M9.3 9.7c1.6.1 2.7 1.6 2.7 3.3";
const ICON_TREND = "M2 11l3.5-4 2.5 2.5L13 4.5M13 4.5H9.5M13 4.5V8";
const ICON_BARS = "M4 13V7M8 13V3M12 13V9";
const ICON_ALERT = "M8 2.5 14 13H2L8 2.5zM8 6.5v3M8 11.2v.1";

// Long item titles wrap inside a narrow column instead of stretching the
// table past the card, so the grade columns stay in view.
// The `!` beats TableHeaderCell's own whitespace-nowrap, which otherwise
// wins and lets long titles spill over the neighbouring columns.
const ITEM_HEADER = "w-28 min-w-[5.5rem] max-w-[8rem] whitespace-normal! break-words align-bottom leading-tight";

function formatEquivalent(eq: DhvsuEquivalent): string {
  return typeof eq === "number" ? eq.toFixed(2) : eq;
}

// Remarks colour: Failed / FA red, Low Pass amber, Pass / High Pass green.
function remarksTier(eq: DhvsuEquivalent): Tier {
  if (eq === "FA" || eq === 5) return "critical";
  if (eq === 3) return "warning";
  return "good";
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <TableCell align="center" tabular className="whitespace-nowrap px-2">
      {children ?? <span className="text-ink/20">—</span>}
    </TableCell>
  );
}

export default function OverviewTab({
  classId,
  classSlug,
  students,
  config,
  assignments,
  submissions,
  assessments,
  assessmentScores,
  majorExams,
  majorExamScores,
  recitationLogs,
  attendance,
  adjustments: initialAdjustments,
  releases: initialReleases,
  programType,
}: {
  // Used to build the DHVSU export link
  // (/api/export/dhvsu-class-record/[classSlug]).
  classSlug: string;
  students: Student[];
  config: GradingConfig;
  assignments: Assignment[];
  submissions: Submission[];
  assessments: Assessment[];
  assessmentScores: AssessmentScore[];
  majorExams: MajorExam[];
  majorExamScores: MajorExamScore[];
  recitationLogs: ParticipationLog[];
  attendance: Attendance[];
  adjustments: GradeAdjustment[];
  releases: (GradeRelease & { seenCount: number })[];
  programType: string | null;
  classId: string;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  // Term grades stay hidden in the student portal until released here;
  // releasing gives each student a one-time "your grade is out" notice.
  const [releases, setReleases] = useState(initialReleases);
  const [releasing, setReleasing] = useState<Period | null>(null);

  async function releaseTerm(period: Period) {
    const ok = await confirm(
      `Each of the ${students.length} students will see their ${PERIOD_LABEL[period]} grade, equivalent and remarks in the student portal, with a "New" notice the next time they open it.`,
      { title: `Release ${PERIOD_LABEL[period]} grades?`, confirmLabel: "Release" },
    );
    if (!ok) return;
    setReleasing(period);
    const { data, error } = await createClient()
      .from("grade_releases")
      .insert({ class_id: classId, period })
      .select()
      .single();
    setReleasing(null);
    if (error) {
      showToast(error.message);
      return;
    }
    setReleases((prev) => [...prev, { ...(data as GradeRelease), seenCount: 0 }]);
    showToast(`${PERIOD_LABEL[period]} grades released. Students will see them in the student portal.`);
  }

  async function unreleaseTerm(release: GradeRelease) {
    const ok = await confirm(
      `Students will no longer see their ${PERIOD_LABEL[release.period]} grade in the student portal. Releasing again later shows them a new notice.`,
      { title: `Hide ${PERIOD_LABEL[release.period]} grades?`, confirmLabel: "Hide grades", danger: true },
    );
    if (!ok) return;
    const { error } = await createClient().from("grade_releases").delete().eq("id", release.id);
    if (error) {
      showToast(error.message);
      return;
    }
    setReleases((prev) => prev.filter((r) => r.id !== release.id));
  }
  // The DHVSU "+" Adjustments column: points added onto a term grade.
  // Edited inline; the typed text is kept per student+term so a half-typed
  // "-" or "1." isn't lost, and the grade recomputes from the parsed value.
  const [adjText, setAdjText] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialAdjustments.map((a) => [`${a.student_id}_${a.period}`, String(a.points)])),
  );
  const adjustments = useMemo<GradeAdjustment[]>(
    () =>
      Object.entries(adjText).flatMap(([key, text]) => {
        const points = Number(text);
        if (!text.trim() || !Number.isFinite(points) || points === 0) return [];
        const [student_id, period] = key.split("_") as [string, Period];
        return [{ id: key, class_id: classId, student_id, period, points, updated_at: "" }];
      }),
    [adjText, classId],
  );

  async function saveAdjustment(studentId: string, period: Period) {
    const text = (adjText[`${studentId}_${period}`] ?? "").trim();
    const points = Number(text);
    if (text && !Number.isFinite(points)) {
      showToast("Adjustment must be a number, e.g. 2 or -1.5.");
      return;
    }
    const supabase = createClient();
    const { error } =
      !text || points === 0
        ? await supabase
            .from("grade_adjustments")
            .delete()
            .eq("class_id", classId)
            .eq("student_id", studentId)
            .eq("period", period)
        : await supabase.from("grade_adjustments").upsert(
            { class_id: classId, student_id: studentId, period, points, updated_at: new Date().toISOString() },
            { onConflict: "class_id,student_id,period" },
          );
    if (error) showToast(error.message);
  }

  const periods: Period[] = config.use_prelims
    ? ["prelim", "midterm", "finals"]
    : ["midterm", "finals"];
  // Display-only term filter: one term's items, attendance and grade, or
  // every term plus the final rating. Grades are always computed over all
  // terms; this only picks which columns show (the export is unaffected).
  const [view, setView] = useState<Period | "all">("all");
  const shownPeriods = view === "all" ? periods : [view];
  const inView = useCallback((a: Assessment) => view === "all" || a.period === view, [view]);
  const byCategory = useCallback(
    (category: Assessment["category"]) => assessments.filter((a) => a.category === category && inView(a)),
    [assessments, inView],
  );
  const quizzes = useMemo(() => byCategory("quiz"), [byCategory]);
  const written = useMemo(() => byCategory("written"), [byCategory]);
  const labs = useMemo(() => byCategory("laboratory"), [byCategory]);
  const recitations = useMemo(() => byCategory("recitation"), [byCategory]);
  const others = useMemo(() => byCategory("other"), [byCategory]);

  const assessmentScoreByKey = useMemo(
    () => new Map(assessmentScores.map((s) => [`${s.assessment_id}_${s.student_id}`, s])),
    [assessmentScores],
  );
  const majorExamScoreByKey = useMemo(
    () => new Map(majorExamScores.map((s) => [`${s.major_exam_id}_${s.student_id}`, s])),
    [majorExamScores],
  );

  const finalGradeByStudent = useMemo(() => {
    const classData: ClassGradingData = {
      config,
      assignments,
      submissions,
      assessments,
      assessmentScores,
      majorExams,
      majorExamScores,
      recitationLogs,
      attendance,
      adjustments,
    };
    // Same DHVSU computation the class record export's formulas perform.
    return computeDhvsuGrades(classData, students, programType);
  }, [
    students,
    config,
    assignments,
    submissions,
    assessments,
    assessmentScores,
    majorExams,
    majorExamScores,
    recitationLogs,
    attendance,
    adjustments,
    programType,
  ]);

  // Assignments don't count toward grades (Attendance replaced them), so
  // they get no columns here.
  const hasAnyColumns =
    quizzes.length > 0 ||
    written.length > 0 ||
    labs.length > 0 ||
    recitations.length > 0 ||
    others.length > 0 ||
    majorExams.length > 0;
  // Each term can have a written and a laboratory exam; one column each.
  const shownExams = majorExams
    .filter((e) => shownPeriods.includes(e.period))
    .sort(
      (a, b) =>
        shownPeriods.indexOf(a.period) - shownPeriods.indexOf(b.period) ||
        (a.kind === "laboratory" ? 1 : 0) - (b.kind === "laboratory" ? 1 : 0),
    );
  // Attendance is a weighted category of each term grade (Setup), shown as
  // the transmuted attendance grade with the raw P5/L3/E2 points under it.
  const attendanceWeight = Number(config.weight_attendance) || 0;
  const attendancePeriods = attendanceWeight > 0 ? shownPeriods : [];

  // A criterion (or Major Exam) with weight but no items in a term counts
  // as 0 under the DHVSU rule -- call it out so lower grades aren't a
  // mystery.
  const emptyCriteria = shownPeriods.flatMap((p) => {
    const missing: { period: Period; label: string; weight: number }[] = [];
    for (const slot of CLASS_STANDING_SLOTS) {
      const weight = Number(config[slot.weightField]) || 0;
      if (weight > 0 && !assessments.some((a) => a.category === slot.key && a.period === p)) {
        missing.push({ period: p, label: criterionLabel(config, slot.key), weight });
      }
    }
    const majorWeight = Number(config.weight_major_exam) || 0;
    if (majorWeight > 0 && !majorExams.some((e) => e.period === p)) {
      missing.push({ period: p, label: "Major Exam", weight: majorWeight });
    }
    return missing;
  });

  // Stat cards follow the dropdown: the term grade, or the final rating.
  const gradedFinals = students
    .map((s) => {
      const g = finalGradeByStudent.get(s.id);
      return view === "all" ? g?.final : g?.[view];
    })
    .filter((v): v is number => v != null);
  const averageFinal =
    gradedFinals.length > 0 ? gradedFinals.reduce((a, b) => a + b, 0) / gradedFinals.length : null;
  const tierCounts = { good: 0, warning: 0, critical: 0 };
  for (const final of gradedFinals) tierCounts[tierFor(final / 100)] += 1;
  const ungradedCount = students.length - gradedFinals.length;
  const totalCols =
    1 + // student
    quizzes.length +
    written.length +
    labs.length +
    recitations.length +
    others.length +
    shownExams.length +
    attendancePeriods.length +
    shownPeriods.length + // adjustments
    shownPeriods.length + // per-period grade
    (view === "all" ? 1 : 0) + // final rating
    2; // equivalent + remarks

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Students"
          icon={<TileIcon path={ICON_STUDENTS} tone="gold" />}
          figure={{ kind: "number", value: students.length }}
        />
        <StatCard
          label="Class average"
          icon={<TileIcon path={ICON_TREND} tone="success" />}
          figure={{ kind: "ring", rate: averageFinal == null ? null : averageFinal / 100 }}
        />
        <StatCard
          label="Grade distribution"
          icon={<TileIcon path={ICON_BARS} tone="warning" />}
          figure={{
            kind: "breakdown",
            segments: [
              { tone: "success", count: tierCounts.good, label: "≥ 90%" },
              { tone: "warning", count: tierCounts.warning, label: "75–89%" },
              { tone: "danger", count: tierCounts.critical, label: "< 75%" },
            ],
          }}
        />
        <StatCard
          label="Ungraded"
          icon={<TileIcon path={ICON_ALERT} tone="danger" />}
          alert={ungradedCount > 0}
          figure={{ kind: "badge", value: ungradedCount, danger: ungradedCount > 0 }}
        />
      </div>

      <div className="mb-4 mt-6 flex flex-wrap items-center justify-between gap-3">
        <MenuSelect
          label="Show"
          value={view}
          onChange={setView}
          options={[
            ...periods.map((p) => ({ value: p as Period | "all", label: PERIOD_LABEL[p] })),
            { value: "all", label: `${config.use_prelims ? "All terms" : "Both terms"} + final rating` },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          {periods.map((p) => {
            const release = releases.find((r) => r.period === p);
            return release ? (
              <span
                key={p}
                className="flex h-8 items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 text-sm text-success-text"
                title={`Released ${new Date(release.released_at).toLocaleString()}`}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {PERIOD_LABEL[p]} released
                <span className="text-xs text-success-text/80">
                  · {release.seenCount}/{students.length} seen
                </span>
                <button
                  type="button"
                  onClick={() => unreleaseTerm(release)}
                  className="text-xs text-muted underline underline-offset-2 hover:text-ink"
                >
                  Undo
                </button>
              </span>
            ) : (
              <Button
                key={p}
                variant="secondary"
                size="sm"
                className="h-8"
                disabled={releasing !== null}
                onClick={() => releaseTerm(p)}
              >
                {releasing === p ? "Releasing..." : `Release ${PERIOD_LABEL[p]} grades`}
              </Button>
            );
          })}
        {config.use_prelims ? (
          <span
            title="DHVSU export only supports Midterm/Finals classes. Turn off Prelims in Setup to export."
            className="flex h-8 cursor-not-allowed items-center rounded-lg bg-line/20 px-3 text-sm font-medium text-ink/40"
          >
            Export Class Record (.xlsx)
          </span>
        ) : (
          <Button
            href={`/api/export/dhvsu-class-record/${classSlug}`}
            external
            variant="highlight"
            size="sm"
            className="h-8"
          >
            Export Class Record (.xlsx)
          </Button>
        )}
        </div>
      </div>
      {emptyCriteria.length > 0 && (
        <div className="mb-4 rounded-[10px] border border-gold/50 bg-gold-soft px-4 py-3 text-sm text-ink">
          <p className="font-semibold">Some weighted criteria have no items yet</p>
          <ul className="mt-1 list-disc pl-5">
            {emptyCriteria.map((e) => (
              <li key={`${e.period}-${e.label}`}>
                <span className="font-medium">{e.label}</span> ({e.weight}%) has no {PERIOD_LABEL[e.period]} items, so it
                counts as 0 — every student&apos;s {PERIOD_LABEL[e.period]} grade is up to {e.weight} points lower until
                you add one or set its weight to 0% in Setup.
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">This is the DHVSU class record&apos;s rule; the exported file computes the same.</p>
        </div>
      )}
      <CollapsibleSection title="Overview" subtitle={`${students.length} students`}>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="sticky left-0 z-[1] bg-navy align-bottom">Student</TableHeaderCell>
              {quizzes.map((a) => (
                <TableHeaderCell key={a.id} align="center" className={ITEM_HEADER}>
                  {a.title}
                  <span className="block font-sans text-[11px] font-normal text-card/70">
                    {criterionLabel(config, "quiz")} / {a.max_score}
                  </span>
                </TableHeaderCell>
              ))}
              {written.map((a) => (
                <TableHeaderCell key={a.id} align="center" className={ITEM_HEADER}>
                  {a.title}
                  <span className="block font-sans text-[11px] font-normal text-card/70">
                    {criterionLabel(config, "written")} / {a.max_score}
                  </span>
                </TableHeaderCell>
              ))}
              {labs.map((a) => (
                <TableHeaderCell key={a.id} align="center" className={ITEM_HEADER}>
                  {a.title}
                  <span className="block font-sans text-[11px] font-normal text-card/70">
                    {criterionLabel(config, "laboratory")} / {a.max_score}
                  </span>
                </TableHeaderCell>
              ))}
              {recitations.map((a) => (
                <TableHeaderCell key={a.id} align="center" className={ITEM_HEADER}>
                  {a.title}
                  <span className="block font-sans text-[11px] font-normal text-card/70">
                    {criterionLabel(config, "recitation")} / {a.max_score}
                  </span>
                </TableHeaderCell>
              ))}
              {others.map((a) => (
                <TableHeaderCell key={a.id} align="center" className={ITEM_HEADER}>
                  {a.title}
                  <span className="block font-sans text-[11px] font-normal text-card/70">
                    {criterionLabel(config, "other")} / {a.max_score}
                  </span>
                </TableHeaderCell>
              ))}
              {shownExams.map((exam) => (
                <TableHeaderCell key={exam.id} align="center" className={ITEM_HEADER}>
                  {exam.kind === "laboratory" ? "Lab exam" : "Major exam"}
                  <span className="block font-sans text-[11px] font-normal text-card/70">
                    {PERIOD_LABEL[exam.period]} / {exam.max_score}
                  </span>
                </TableHeaderCell>
              ))}
              {attendancePeriods.map((p) => (
                <TableHeaderCell key={`att-${p}`} align="center" className={ITEM_HEADER}>
                  Attendance
                  <span className="block font-sans text-[11px] font-normal text-card/70">
                    {PERIOD_LABEL[p]} · {attendanceWeight}%
                  </span>
                </TableHeaderCell>
              ))}
              {shownPeriods.map((p) => (
                <TableHeaderCell key={`adj-${p}`} align="center" className={ITEM_HEADER}>
                  Adjustments
                  <span className="block font-sans text-[11px] font-normal text-card/70">
                    {PERIOD_LABEL[p]} · +
                  </span>
                </TableHeaderCell>
              ))}
              {shownPeriods.map((p) => (
                <TableHeaderCell key={p} align="center" className={ITEM_HEADER}>
                  {PERIOD_LABEL[p]}
                  <span className="block font-sans text-[11px] font-normal text-card/70">grade / 100</span>
                </TableHeaderCell>
              ))}
              {view === "all" && (
                <TableHeaderCell align="center" className={`${ITEM_HEADER} font-semibold`}>
                  Final rating
                  <span className="block font-sans text-[11px] font-normal text-card/70">
                    {periods.map((p) => `${PERIOD_LABEL[p]} ${Number(config[`${p}_weight`]) || 0}%`).join(" + ")}
                  </span>
                </TableHeaderCell>
              )}
              <TableHeaderCell align="center" className={ITEM_HEADER}>
                Equivalent
              </TableHeaderCell>
              <TableHeaderCell align="center" className={ITEM_HEADER}>
                Remarks
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {students.map((s) => {
              const grade = finalGradeByStudent.get(s.id);
              // The selected term's own equivalent, or the final one.
              const shownEquivalent = view === "all" ? grade?.equivalent : grade?.termEquivalents[view];
              return (
                <TableRow key={s.id} striped>
                  <TableCell className="sticky left-0 z-[1] whitespace-nowrap border-r border-line bg-card">{s.name}</TableCell>
                  {quizzes.map((a) => {
                    const score = assessmentScoreByKey.get(`${a.id}_${s.id}`)?.score;
                    return (
                      <Cell key={a.id}>{score != null ? `${score}/${a.max_score}` : null}</Cell>
                    );
                  })}
                  {written.map((a) => {
                    const score = assessmentScoreByKey.get(`${a.id}_${s.id}`)?.score;
                    return (
                      <Cell key={a.id}>{score != null ? `${score}/${a.max_score}` : null}</Cell>
                    );
                  })}
                  {labs.map((a) => {
                    const score = assessmentScoreByKey.get(`${a.id}_${s.id}`)?.score;
                    return (
                      <Cell key={a.id}>{score != null ? `${score}/${a.max_score}` : null}</Cell>
                    );
                  })}
                  {recitations.map((a) => {
                    const score = assessmentScoreByKey.get(`${a.id}_${s.id}`)?.score;
                    return (
                      <Cell key={a.id}>{score != null ? `${score}/${a.max_score}` : null}</Cell>
                    );
                  })}
                  {others.map((a) => {
                    const score = assessmentScoreByKey.get(`${a.id}_${s.id}`)?.score;
                    return (
                      <Cell key={a.id}>{score != null ? `${score}/${a.max_score}` : null}</Cell>
                    );
                  })}
                  {shownExams.map((exam) => {
                    const score = majorExamScoreByKey.get(`${exam.id}_${s.id}`)?.score;
                    return (
                      <Cell key={exam.id}>{score != null ? `${score}/${exam.max_score}` : null}</Cell>
                    );
                  })}
                  {attendancePeriods.map((p) => {
                    const term = grade?.terms[p];
                    return (
                      <Cell key={`att-${p}`}>
                        {term ? (
                          <>
                            {term.attendance.toFixed(2)}
                            <span className="block text-[11px] text-muted">
                              {term.attendanceMax > 0 ? `${term.attendancePoints}/${term.attendanceMax} pts` : "no classes yet"}
                            </span>
                          </>
                        ) : null}
                      </Cell>
                    );
                  })}
                  {shownPeriods.map((p) => {
                    const key = `${s.id}_${p}`;
                    return (
                      <TableCell key={`adj-${p}`} align="center" className="px-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={adjText[key] ?? ""}
                          onChange={(e) => setAdjText((prev) => ({ ...prev, [key]: e.target.value }))}
                          onBlur={() => saveAdjustment(s.id, p)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          placeholder="+"
                          aria-label={`${PERIOD_LABEL[p]} adjustment for ${s.name}`}
                          className="h-8 w-16 rounded-sm border border-line bg-card px-2 text-center font-mono text-sm text-ink placeholder:text-ink/25 focus:border-navy focus:outline-none"
                        />
                      </TableCell>
                    );
                  })}
                  {shownPeriods.map((p) => {
                    const termGrade = grade?.[p];
                    const termEq = grade?.termEquivalents[p];
                    return (
                      <TableCell
                        key={p}
                        align="center"
                        tabular
                        className={`whitespace-nowrap px-2 ${view === "all" ? "" : "font-semibold"}`}
                      >
                        {termGrade != null ? termGrade.toFixed(2) : <span className="text-ink/20">—</span>}
                        {/* In the all-terms view each term's own equivalent sits under its grade. */}
                        {view === "all" && termEq != null && (
                          <span className="block text-[11px] text-muted">{formatEquivalent(termEq)}</span>
                        )}
                      </TableCell>
                    );
                  })}
                  {view === "all" && (
                    <TableCell align="center" tabular className="whitespace-nowrap px-2 font-semibold text-ink">
                      {grade?.final ?? <span className="font-normal text-ink/20">—</span>}
                    </TableCell>
                  )}
                  <TableCell align="center" tabular className="whitespace-nowrap px-2 font-semibold text-ink">
                    {shownEquivalent != null ? formatEquivalent(shownEquivalent) : <span className="font-normal text-ink/20">—</span>}
                  </TableCell>
                  <TableCell
                    align="center"
                    className={`whitespace-nowrap px-2 text-sm font-medium ${shownEquivalent != null ? TIER_TEXT[remarksTier(shownEquivalent)] : ""}`}
                  >
                    {shownEquivalent != null ? gradeDescriptive(shownEquivalent) : <span className="text-ink/20">—</span>}
                  </TableCell>
                </TableRow>
              );
            })}
            {students.length === 0 && (
              <TableRow>
                <TableCell colSpan={totalCols} className="py-4">
                  No students in this class yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {!hasAnyColumns && (
          <p className="mt-3 text-ink/60">
            No quizzes, activities, recitations, or major exams recorded yet.
          </p>
        )}
      </CollapsibleSection>
    </div>
  );
}
