"use client";

import { useState } from "react";
import type {
  Assessment,
  AssessmentScore,
  Assignment,
  ClassRow,
  GradingConfig,
  MajorExam,
  MajorExamScore,
  ParticipationLog,
  Student,
  Submission,
} from "@/lib/types";
import AssignmentsClient from "../../assignments/[classId]/assignments-client";
import AssessmentRoster from "./assessment-roster";
import SetupTab from "./setup-tab";
import MajorExamTab from "./major-exam-tab";
import RecitationTab from "./recitation-tab";
import OverviewTab from "./overview-tab";
import GroupedNav, { type NavItem } from "@/app/_components/grouped-nav";

type Tab =
  | "overview"
  | "setup"
  | "assignments"
  | "quiz"
  | "written"
  | "laboratory"
  | "major-exam"
  | "recitation";

const TABS: Tab[] = [
  "overview",
  "setup",
  "assignments",
  "quiz",
  "written",
  "laboratory",
  "major-exam",
  "recitation",
];

export default function GradingHubClient({
  classId,
  teacherId,
  teacherClasses,
  allStudents,
  students,
  config,
  assignments,
  submissions,
  assessments,
  assessmentScores,
  majorExams,
  majorExamScores,
  recitationLogs,
  initialTab,
}: {
  classId: string;
  teacherId: string;
  teacherClasses: ClassRow[];
  allStudents: Student[];
  students: Student[];
  config: GradingConfig;
  assignments: Assignment[];
  submissions: Submission[];
  assessments: Assessment[];
  assessmentScores: AssessmentScore[];
  majorExams: MajorExam[];
  majorExamScores: MajorExamScore[];
  recitationLogs: ParticipationLog[];
  // Lets the top nav's Gradebook dropdown deep-link straight to a tab (e.g.
  // Quiz/Written Activity/Laboratory Activity), which otherwise are only
  // reachable by first landing on Overview and clicking through. Computed
  // server-side from the URL's ?tab= and passed down as a normal prop (with
  // the page keying this component by it) instead of read client-side, so
  // the very first render already shows the right tab -- no flash, no
  // hydration mismatch.
  initialTab?: string;
}) {
  const [tab, setTab] = useState<Tab>(
    (TABS as string[]).includes(initialTab ?? "") ? (initialTab as Tab) : "overview",
  );

  const submissionCounts: Record<string, { submitted: number; total: number }> = {};
  const classStudentIds = new Set(students.map((s) => s.id));
  for (const s of submissions) {
    if (!classStudentIds.has(s.student_id)) continue;
    const counts = submissionCounts[s.assignment_id] ?? { submitted: 0, total: 0 };
    counts.total += 1;
    if (s.status !== "missing") counts.submitted += 1;
    submissionCounts[s.assignment_id] = counts;
  }

  const quizAssessments = assessments.filter((a) => a.category === "quiz");
  const writtenAssessments = assessments.filter((a) => a.category === "written");
  const labAssessments = assessments.filter((a) => a.category === "laboratory");

  const scoresFor = (items: Assessment[]) => {
    const ids = new Set(items.map((a) => a.id));
    return assessmentScores.filter((s) => ids.has(s.assessment_id));
  };

  const navItems: NavItem[] = [
    { kind: "tool", label: "Overview", active: tab === "overview", onClick: () => setTab("overview") },
    { kind: "tool", label: "Setup", active: tab === "setup", onClick: () => setTab("setup") },
    {
      kind: "group",
      label: "Assessments",
      tools: [
        { label: "Assignments", active: tab === "assignments", onClick: () => setTab("assignments") },
        { label: "Quiz", active: tab === "quiz", onClick: () => setTab("quiz") },
        { label: "Written Activity", active: tab === "written", onClick: () => setTab("written") },
        {
          label: "Laboratory Activity",
          active: tab === "laboratory",
          onClick: () => setTab("laboratory"),
        },
      ],
    },
    {
      kind: "group",
      label: "Exams",
      tools: [
        { label: "Major Exam", active: tab === "major-exam", onClick: () => setTab("major-exam") },
        { label: "Recitation", active: tab === "recitation", onClick: () => setTab("recitation") },
      ],
    },
  ];

  return (
    <div>
      <GroupedNav items={navItems} />

      {tab === "overview" && (
        <OverviewTab
          classId={classId}
          students={students}
          config={config}
          assignments={assignments}
          submissions={submissions}
          assessments={assessments}
          assessmentScores={assessmentScores}
          majorExams={majorExams}
          majorExamScores={majorExamScores}
          recitationLogs={recitationLogs}
        />
      )}

      {tab === "setup" && <SetupTab classId={classId} initialConfig={config} />}

      {tab === "assignments" && (
        <AssignmentsClient
          classId={classId}
          teacherId={teacherId}
          teacherClasses={teacherClasses}
          allStudents={allStudents}
          initialAssignments={assignments}
          usePrelims={config.use_prelims}
          showHeading={false}
          submissionCounts={submissionCounts}
        />
      )}

      {tab === "quiz" && (
        <AssessmentRoster
          classId={classId}
          category="quiz"
          categoryLabel="Quiz"
          students={students}
          initialAssessments={quizAssessments}
          initialScores={scoresFor(quizAssessments)}
          usePrelims={config.use_prelims}
        />
      )}

      {tab === "written" && (
        <AssessmentRoster
          classId={classId}
          category="written"
          categoryLabel="Written Activity"
          students={students}
          initialAssessments={writtenAssessments}
          initialScores={scoresFor(writtenAssessments)}
          usePrelims={config.use_prelims}
        />
      )}

      {tab === "laboratory" && (
        <AssessmentRoster
          classId={classId}
          category="laboratory"
          categoryLabel="Laboratory Activity"
          students={students}
          initialAssessments={labAssessments}
          initialScores={scoresFor(labAssessments)}
          usePrelims={config.use_prelims}
        />
      )}

      {tab === "major-exam" && (
        <MajorExamTab
          classId={classId}
          students={students}
          initialExams={majorExams}
          initialScores={majorExamScores}
          usePrelims={config.use_prelims}
        />
      )}

      {tab === "recitation" && (
        <RecitationTab
          students={students}
          initialLogs={recitationLogs}
          config={config}
        />
      )}
    </div>
  );
}
