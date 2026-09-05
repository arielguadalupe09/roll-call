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

const PERIOD_LABEL: Record<Period, string> = {
  prelim: "Prelim",
  midterm: "Midterm",
  finals: "Finals",
};

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td className="border-b border-rule/50 py-2 px-3 text-center font-mono text-xs text-ink">
      {children ?? <span className="text-ink/20">—</span>}
    </td>
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

  return (
    <div className="mt-6">
      <div className="flex justify-end">
        {config.use_prelims ? (
          <span
            title="DHVSU export only supports Midterm/Finals classes. Turn off Prelims in Setup to export."
            className="cursor-not-allowed rounded-sm border border-rule px-3 py-1.5 text-sm font-medium text-ink/40"
          >
            Export Class Record (.xlsx)
          </span>
        ) : (
          <a
            href={`/api/export/dhvsu-class-record/${classId}`}
            className="rounded-sm border border-teal px-3 py-1.5 text-sm font-medium text-teal transition hover:bg-teal/10"
          >
            Export Class Record (.xlsx)
          </a>
        )}
      </div>
      <CollapsibleSection title="Overview" subtitle={`${students.length} students`}>
        <div className="overflow-x-auto rounded-2xl border border-rule/60 shadow-sm">
          <table className="w-full min-w-max border-collapse text-left">
            <thead>
              <tr className="border-b border-rule bg-paper font-mono text-xs uppercase tracking-wide text-ink/60">
                <th className="sticky left-0 bg-paper py-2 px-3">Student</th>
                {assignments.map((a) => (
                  <th key={a.id} className="py-2 px-3 text-center">
                    {a.title}
                    <span className="block font-normal normal-case text-ink/40">
                      Assignment / {a.max_score}
                    </span>
                  </th>
                ))}
                {quizzes.map((a) => (
                  <th key={a.id} className="py-2 px-3 text-center">
                    {a.title}
                    <span className="block font-normal normal-case text-ink/40">
                      Quiz / {a.max_score}
                    </span>
                  </th>
                ))}
                {written.map((a) => (
                  <th key={a.id} className="py-2 px-3 text-center">
                    {a.title}
                    <span className="block font-normal normal-case text-ink/40">
                      Written / {a.max_score}
                    </span>
                  </th>
                ))}
                {labs.map((a) => (
                  <th key={a.id} className="py-2 px-3 text-center">
                    {a.title}
                    <span className="block font-normal normal-case text-ink/40">
                      Lab / {a.max_score}
                    </span>
                  </th>
                ))}
                {periods.map((p) => {
                  const exam = examByPeriod.get(p);
                  if (!exam) return null;
                  return (
                    <th key={p} className="py-2 px-3 text-center">
                      Major exam
                      <span className="block font-normal normal-case text-ink/40">
                        {PERIOD_LABEL[p]} / {exam.max_score}
                      </span>
                    </th>
                  );
                })}
                <th className="py-2 px-3 text-center">
                  Recitation
                  <span className="block font-normal normal-case text-ink/40">avg / 5</span>
                </th>
                {periods.map((p) => (
                  <th key={p} className="py-2 px-3 text-center">
                    {PERIOD_LABEL[p]}
                    <span className="block font-normal normal-case text-ink/40">grade</span>
                  </th>
                ))}
                <th className="py-2 px-3 text-center font-semibold text-ink">
                  Final Grade
                  <span className="block font-normal normal-case text-ink/40">weighted</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const recitation = recitationByStudent.get(s.id);
                const grade = finalGradeByStudent.get(s.id);
                return (
                  <tr key={s.id} className="bg-white">
                    <td className="sticky left-0 bg-white py-2 px-3 text-ink">{s.name}</td>
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
                    {periods.map((p) => {
                      const exam = examByPeriod.get(p);
                      if (!exam) return null;
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
                    <td className="border-b border-rule/50 py-2 px-3 text-center font-mono text-xs font-semibold text-ink">
                      {grade?.final != null ? (
                        `${grade.final.toFixed(1)}%`
                      ) : (
                        <span className="font-normal text-ink/20">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {students.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-4 px-3 text-ink/60">
                    No students in this class yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {!hasAnyColumns && (
            <p className="p-4 text-ink/60">
              No assignments, quizzes, activities, or major exams recorded yet.
            </p>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}
