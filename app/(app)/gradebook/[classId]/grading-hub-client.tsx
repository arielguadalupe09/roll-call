"use client";

import { useState } from "react";
import type {
  Assessment,
  AssessmentScore,
  Assignment,
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

type Tab =
  | "overview"
  | "setup"
  | "assignments"
  | "quiz"
  | "written"
  | "laboratory"
  | "major-exam"
  | "recitation";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "setup", label: "Setup" },
  { key: "assignments", label: "Assignments" },
  { key: "quiz", label: "Quiz" },
  { key: "written", label: "Written Activity" },
  { key: "laboratory", label: "Laboratory Activity" },
  { key: "major-exam", label: "Major Exam" },
  { key: "recitation", label: "Recitation" },
];

export default function GradingHubClient({
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
  const [tab, setTab] = useState<Tab>("overview");

  const quizAssessments = assessments.filter((a) => a.category === "quiz");
  const writtenAssessments = assessments.filter((a) => a.category === "written");
  const labAssessments = assessments.filter((a) => a.category === "laboratory");

  const scoresFor = (items: Assessment[]) => {
    const ids = new Set(items.map((a) => a.id));
    return assessmentScores.filter((s) => ids.has(s.assessment_id));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-rule/60 pb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-sm px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition ${
              tab === t.key
                ? "bg-brass text-chalk font-semibold"
                : "text-ink/70 hover:bg-ink/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab
          students={students}
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
        <AssignmentsClient classId={classId} initialAssignments={assignments} />
      )}

      {tab === "quiz" && (
        <AssessmentRoster
          classId={classId}
          category="quiz"
          categoryLabel="Quiz"
          students={students}
          initialAssessments={quizAssessments}
          initialScores={scoresFor(quizAssessments)}
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
        />
      )}

      {tab === "major-exam" && (
        <MajorExamTab
          classId={classId}
          students={students}
          initialExams={majorExams}
          initialScores={majorExamScores}
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
