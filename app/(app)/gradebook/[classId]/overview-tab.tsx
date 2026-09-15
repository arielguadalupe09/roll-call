import { useMemo } from "react";
import type {
  Assessment,
  AssessmentScore,
  Assignment,
  GradingConfig,
  MajorExam,
  MajorExamScore,
  ParticipationLog,
  Period,
  Student,
  Submission,
} from "@/lib/types";
import { summarizeParticipation } from "@/lib/participation";
import { buildRecordCardData, type ClassGradingData } from "@/lib/record-card-data";
import { computeFinalGrade } from "@/lib/final-grade";
import CollapsibleSection from "@/app/_components/collapsible-section";
import Button from "@/app/_components/button";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/app/_components/table";
import { StatCard } from "@/app/_components/stat-card";
import { TileIcon } from "@/app/_components/tile-icon";
import { tierFor, TIER_TEXT } from "@/lib/chart-tiers";

const PERIOD_LABEL: Record<Period, string> = {
  prelim: "Prelim",
  midterm: "Midterm",
  finals: "Finals",
};

const ICON_STUDENTS = "M5.5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10.5 7a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM2 13c0-2 1.6-3.5 3.5-3.5S9 11 9 13M9.3 9.7c1.6.1 2.7 1.6 2.7 3.3";
const ICON_TREND = "M2 11l3.5-4 2.5 2.5L13 4.5M13 4.5H9.5M13 4.5V8";
const ICON_BARS = "M4 13V7M8 13V3M12 13V9";
const ICON_ALERT = "M8 2.5 14 13H2L8 2.5zM8 6.5v3M8 11.2v.1";

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <TableCell align="center" tabular>
      {children ?? <span className="text-ink/20">—</span>}
    </TableCell>
  );
}

export default function OverviewTab({
  classId,
  students,
  config,
  assignments,
  submissions,
  assessments,
  assessmentScores,
  majorExams,
  majorExamScores,
  recitationLogs,
}: {
  classId: string;
  students: Student[];
  config: GradingConfig;
  assignments: Assignment[];
  submissions: Submission[];
  assessments: Assessment[];
  assessmentScores: AssessmentScore[];
  majorExams: MajorExam[];
  majorExamScores: MajorExamScore[];
  recitationLogs: ParticipationLog[];
}) {
  const quizzes = useMemo(() => assessments.filter((a) => a.category === "quiz"), [assessments]);
  const written = useMemo(
    () => assessments.filter((a) => a.category === "written"),
    [assessments],
  );
  const labs = useMemo(
    () => assessments.filter((a) => a.category === "laboratory"),
    [assessments],
  );
  const periods: Period[] = config.use_prelims
    ? ["prelim", "midterm", "finals"]
    : ["midterm", "finals"];
  const examByPeriod = useMemo(
    () => new Map(majorExams.map((e) => [e.period, e])),
    [majorExams],
  );

  const submissionByKey = useMemo(
    () => new Map(submissions.map((s) => [`${s.assignment_id}_${s.student_id}`, s])),
    [submissions],
  );
  const assessmentScoreByKey = useMemo(
    () => new Map(assessmentScores.map((s) => [`${s.assessment_id}_${s.student_id}`, s])),
    [assessmentScores],
  );
  const majorExamScoreByKey = useMemo(
    () => new Map(majorExamScores.map((s) => [`${s.major_exam_id}_${s.student_id}`, s])),
    [majorExamScores],
  );
  const recitationByStudent = useMemo(
    () => summarizeParticipation(recitationLogs),
    [recitationLogs],
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
      attendance: [],
    };
    const map = new Map<string, ReturnType<typeof computeFinalGrade>>();
    for (const s of students) {
      map.set(s.id, computeFinalGrade(buildRecordCardData(s, classData), config));
    }
    return map;
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
  ]);

  const hasAnyColumns =
    assignments.length > 0 || quizzes.length > 0 || written.length > 0 || labs.length > 0 || majorExams.length > 0;
  const examPeriods = periods.filter((p) => examByPeriod.has(p));

  const gradedFinals = students
    .map((s) => finalGradeByStudent.get(s.id)?.final)
    .filter((v): v is number => v != null);
  const averageFinal =
    gradedFinals.length > 0 ? gradedFinals.reduce((a, b) => a + b, 0) / gradedFinals.length : null;
  const tierCounts = { good: 0, warning: 0, critical: 0 };
  for (const final of gradedFinals) tierCounts[tierFor(final / 100)] += 1;
  const ungradedCount = students.length - gradedFinals.length;
  const totalCols =
    1 + // student
    assignments.length +
    quizzes.length +
    written.length +
    labs.length +
    examPeriods.length +
    1 + // recitation
    periods.length + // per-period grade
    1; // final grade

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

      <div className="mt-6 flex justify-end">
        {config.use_prelims ? (
          <span
            title="DHVSU export only supports Midterm/Finals classes. Turn off Prelims in Setup to export."
            className="cursor-not-allowed rounded-sm bg-line/20 px-3 py-1.5 text-sm font-medium text-ink/40"
          >
            Export Class Record (.xlsx)
          </span>
        ) : (
          <Button href={`/api/export/dhvsu-class-record/${classId}`} external variant="highlight" size="sm">
            Export Class Record (.xlsx)
          </Button>
        )}
      </div>
      <CollapsibleSection title="Overview" subtitle={`${students.length} students`}>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="sticky left-0 bg-navy">Student</TableHeaderCell>
              {assignments.map((a) => (
                <TableHeaderCell key={a.id} align="center">
                  {a.title}
                  <span className="block font-sans text-[11px] font-normal text-card/70">
                    Assignment / {a.max_score}
                  </span>
                </TableHeaderCell>
              ))}
              {quizzes.map((a) => (
                <TableHeaderCell key={a.id} align="center">
                  {a.title}
                  <span className="block font-sans text-[11px] font-normal text-card/70">
                    Quiz / {a.max_score}
                  </span>
                </TableHeaderCell>
              ))}
              {written.map((a) => (
                <TableHeaderCell key={a.id} align="center">
                  {a.title}
                  <span className="block font-sans text-[11px] font-normal text-card/70">
                    Written / {a.max_score}
                  </span>
                </TableHeaderCell>
              ))}
              {labs.map((a) => (
                <TableHeaderCell key={a.id} align="center">
                  {a.title}
                  <span className="block font-sans text-[11px] font-normal text-card/70">
                    Lab / {a.max_score}
                  </span>
                </TableHeaderCell>
              ))}
              {examPeriods.map((p) => {
                const exam = examByPeriod.get(p)!;
                return (
                  <TableHeaderCell key={p} align="center">
                    Major exam
                    <span className="block font-sans text-[11px] font-normal text-card/70">
                      {PERIOD_LABEL[p]} / {exam.max_score}
                    </span>
                  </TableHeaderCell>
                );
              })}
              <TableHeaderCell align="center">
                Recitation
                <span className="block font-sans text-[11px] font-normal text-card/70">avg / 5</span>
              </TableHeaderCell>
              {periods.map((p) => (
                <TableHeaderCell key={p} align="center">
                  {PERIOD_LABEL[p]}
                  <span className="block font-sans text-[11px] font-normal text-card/70">grade</span>
                </TableHeaderCell>
              ))}
              <TableHeaderCell align="center" className="font-semibold">
                Final grade
                <span className="block font-sans text-[11px] font-normal text-card/70">weighted</span>
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {students.map((s) => {
              const recitation = recitationByStudent.get(s.id);
              const grade = finalGradeByStudent.get(s.id);
              const finalTier = grade?.final != null ? tierFor(grade.final / 100) : null;
              return (
                <TableRow key={s.id} striped>
                  <TableCell className="sticky left-0 bg-card">{s.name}</TableCell>
                  {assignments.map((a) => {
                    const score = submissionByKey.get(`${a.id}_${s.id}`)?.score;
                    return (
                      <Cell key={a.id}>{score != null ? `${score}/${a.max_score}` : null}</Cell>
                    );
                  })}
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
                  {examPeriods.map((p) => {
                    const exam = examByPeriod.get(p)!;
                    const score = majorExamScoreByKey.get(`${exam.id}_${s.id}`)?.score;
                    return (
                      <Cell key={p}>{score != null ? `${score}/${exam.max_score}` : null}</Cell>
                    );
                  })}
                  <Cell>
                    {recitation?.avg != null ? `${recitation.avg.toFixed(1)}/5` : null}
                  </Cell>
                  {periods.map((p) => (
                    <Cell key={p}>
                      {grade?.[p] != null ? `${(grade[p] as number).toFixed(1)}%` : null}
                    </Cell>
                  ))}
                  <TableCell align="center" tabular className={`font-semibold ${finalTier ? TIER_TEXT[finalTier] : "text-ink/20 font-normal"}`}>
                    {grade?.final != null ? `${grade.final.toFixed(1)}%` : "—"}
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
            No assignments, quizzes, activities, or major exams recorded yet.
          </p>
        )}
      </CollapsibleSection>
    </div>
  );
}
