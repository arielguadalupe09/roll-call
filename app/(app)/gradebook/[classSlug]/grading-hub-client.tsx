"use client";

import { useEffect, useState } from "react";
import { useGradebookTab } from "@/app/_components/gradebook-tab-context";
import type {
  Assessment,
  AssessmentScore,
  Assignment,
  Attendance,
  ClassRow,
  GradeAdjustment,
  GradeRelease,
  Exam,
  GradingConfig,
  MajorExam,
  MajorExamScore,
  ParticipationLog,
  Student,
  Submission,
} from "@/lib/types";
import AssignmentsClient from "../../assignments/[classSlug]/assignments-client";
import AssessmentRoster from "./assessment-roster";
import SetupTab from "./setup-tab";
import MajorExamTab from "./major-exam-tab";
import OverviewTab from "./overview-tab";
import OnlineExamPanel from "./online-exam-panel";
import GroupedNav, { type NavItem } from "@/app/_components/grouped-nav";
import { CLASS_STANDING_SLOTS, criterionLabel, isCriterionActive, type CriterionKey } from "@/lib/grading-criteria";

type Tab =
  | "overview"
  | "setup"
  | "assignments"
  | "quiz"
  | "written"
  | "laboratory"
  | "major-exam"
  | "recitation"
  | "other";

const TABS: Tab[] = [
  "overview",
  "setup",
  "assignments",
  "quiz",
  "written",
  "laboratory",
  "major-exam",
  "recitation",
  "other",
];

export default function GradingHubClient({
  classId,
  classSlug,
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
  attendance,
  adjustments,
  releases,
  programType,
  courseType,
  exams,
  initialTab,
}: {
  classId: string;
  // Only used to build links into /exams/[classSlug]/... and
  // /assignments/[classSlug]/... -- classId (the real uuid) is what every
  // data query/mutation uses.
  classSlug: string;
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
  attendance: Attendance[];
  adjustments: GradeAdjustment[];
  releases: (GradeRelease & { seenCount: number })[];
  programType: string | null;
  courseType: string | null;
  exams: Exam[];
  // Lets the top nav's Gradebook dropdown deep-link straight to a tab (e.g.
  // Quiz/Written Activity/Laboratory Activity), which otherwise are only
  // reachable by first landing on Overview and clicking through. Computed
  // server-side from the URL's ?tab= and passed down as a normal prop, so
  // the very first render already shows the right tab -- no flash, no
  // hydration mismatch.
  initialTab?: string;
}) {
  const [tab, setTabState] = useState<Tab>(
    (TABS as string[]).includes(initialTab ?? "") ? (initialTab as Tab) : "overview",
  );
  const { tab: sharedTab, setTab: setSharedTab } = useGradebookTab();

  function setTab(next: Tab) {
    setTabState(next);
    setSharedTab(next);
  }

  // Seed the shared context on a real page load (mount only) so ClassSubNav
  // highlights the right tab immediately, without waiting for a click.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setSharedTab(tab), []);

  // ClassSubNav flips this shared value directly instead of navigating when
  // the user is already on this page -- pick that up without a remount.
  // Adjusted during render (tracking the previous value) rather than in an
  // effect, so it doesn't cost an extra render pass.
  const [prevSharedTab, setPrevSharedTab] = useState(sharedTab);
  if (sharedTab !== prevSharedTab) {
    setPrevSharedTab(sharedTab);
    if (sharedTab && sharedTab !== tab && (TABS as string[]).includes(sharedTab)) {
      setTabState(sharedTab as Tab);
    }
  }

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
  const recitationAssessments = assessments.filter((a) => a.category === "recitation");
  const otherAssessments = assessments.filter((a) => a.category === "other");
  // Each Class Standing criterion's tab is named after it (Setup).
  const label = (key: CriterionKey) => criterionLabel(config, key);

  const quizExams = exams.filter((e) => e.kind === "quiz");
  const writtenExams = exams.filter((e) => e.kind === "written");
  const labExams = exams.filter((e) => e.kind === "laboratory");
  const majorOnlineExams = exams.filter((e) => e.kind === "major_exam");

  const scoresFor = (items: Assessment[]) => {
    const ids = new Set(items.map((a) => a.id));
    return assessmentScores.filter((s) => ids.has(s.assessment_id));
  };

  const navItems: NavItem[] = [
    { kind: "tool", label: "Overview", active: tab === "overview", onClick: () => setTab("overview") },
    { kind: "tool", label: "Setup", active: tab === "setup", onClick: () => setTab("setup") },
    {
      kind: "group",
      label: "Class Standing",
      tools: CLASS_STANDING_SLOTS.filter((s) => isCriterionActive(config, s.key)).map((s) => ({
        label: label(s.key),
        active: tab === s.key,
        onClick: () => setTab(s.key),
      })),
    },
    { kind: "tool", label: "Major Exam", active: tab === "major-exam", onClick: () => setTab("major-exam") },
    { kind: "tool", label: "Assignments", active: tab === "assignments", onClick: () => setTab("assignments") },
  ];

  return (
    <div>
      <GroupedNav items={navItems} />

      {tab === "overview" && (
        <OverviewTab
          classId={classId}
          classSlug={classSlug}
          students={students}
          config={config}
          assignments={assignments}
          submissions={submissions}
          assessments={assessments}
          assessmentScores={assessmentScores}
          majorExams={majorExams}
          majorExamScores={majorExamScores}
          recitationLogs={recitationLogs}
          attendance={attendance}
          adjustments={adjustments}
          releases={releases}
          programType={programType}
        />
      )}

      {tab === "setup" && (
        <SetupTab
          classId={classId}
          initialConfig={config}
          initialProgramType={programType}
          initialCourseType={courseType}
        />
      )}

      {tab === "assignments" && (
        <AssignmentsClient
          classId={classId}
          classSlug={classSlug}
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
        <>
          <AssessmentRoster
            classId={classId}
            category="quiz"
            categoryLabel={label("quiz")}
            students={students}
            initialAssessments={quizAssessments}
            initialScores={scoresFor(quizAssessments)}
            usePrelims={config.use_prelims}
          />
          <div className="mt-6">
            <OnlineExamPanel
              classId={classId}
              classSlug={classSlug}
              kind="quiz"
              initialExams={quizExams}
              usePrelims={config.use_prelims}
            />
          </div>
        </>
      )}

      {tab === "written" && (
        <>
          <AssessmentRoster
            classId={classId}
            category="written"
            categoryLabel={label("written")}
            students={students}
            initialAssessments={writtenAssessments}
            initialScores={scoresFor(writtenAssessments)}
            usePrelims={config.use_prelims}
          />
          <div className="mt-6">
            <OnlineExamPanel
              classId={classId}
              classSlug={classSlug}
              kind="written"
              initialExams={writtenExams}
              usePrelims={config.use_prelims}
            />
          </div>
        </>
      )}

      {tab === "laboratory" && (
        <>
          <AssessmentRoster
            classId={classId}
            category="laboratory"
            categoryLabel={label("laboratory")}
            students={students}
            initialAssessments={labAssessments}
            initialScores={scoresFor(labAssessments)}
            usePrelims={config.use_prelims}
          />
          <div className="mt-6">
            <OnlineExamPanel
              classId={classId}
              classSlug={classSlug}
              kind="laboratory"
              initialExams={labExams}
              usePrelims={config.use_prelims}
            />
          </div>
        </>
      )}

      {tab === "major-exam" && (
        <>
          <MajorExamTab
            classId={classId}
            students={students}
            initialExams={majorExams}
            initialScores={majorExamScores}
            usePrelims={config.use_prelims}
          />
          <div className="mt-6">
            <OnlineExamPanel
              classId={classId}
              classSlug={classSlug}
              kind="major_exam"
              initialExams={majorOnlineExams}
              usePrelims={config.use_prelims}
            />
          </div>
        </>
      )}

      {tab === "recitation" && (
        <AssessmentRoster
          classId={classId}
          category="recitation"
          categoryLabel={label("recitation")}
          students={students}
          initialAssessments={recitationAssessments}
          initialScores={scoresFor(recitationAssessments)}
          usePrelims={config.use_prelims}
        />
      )}

      {tab === "other" && (
        <AssessmentRoster
          classId={classId}
          category="other"
          categoryLabel={label("other")}
          students={students}
          initialAssessments={otherAssessments}
          initialScores={scoresFor(otherAssessments)}
          usePrelims={config.use_prelims}
        />
      )}
    </div>
  );
}
