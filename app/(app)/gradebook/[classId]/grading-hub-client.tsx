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
}) {
  const [tab, setTab] = useState<Tab>("overview");

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
