import type { GradingConfig, Period } from "./types";
import type { GridEntry, RecordCardStudentData } from "./record-card-data";

export type FinalGrade = {
  prelim: number | null;
  midterm: number | null;
  finals: number | null;
  final: number | null;
};

function categoryPercentage(entries: GridEntry[], period: Period): number | null {
  const graded = entries.filter((e) => e.period === period && e.score != null);
  if (graded.length === 0) return null;
  const total = graded.reduce((sum, e) => sum + (e.score as number) / e.maxScore, 0);
  return (total / graded.length) * 100;
}

function majorExamPercentage(data: RecordCardStudentData, period: Period): number | null {
  const score =
    period === "prelim"
      ? data.majorExam.prelimScore
      : period === "midterm"
        ? data.majorExam.midtermScore
        : data.majorExam.finalsScore;
  const max =
    period === "prelim"
      ? data.majorExam.prelimMax
      : period === "midterm"
        ? data.majorExam.midtermMax
        : data.majorExam.finalsMax;
  if (score == null || !max) return null;
  return (score / max) * 100;
}

// Weighted average over whatever categories/periods actually have graded
// data, renormalized over their weights — so an ungraded category (or an
// unstarted period) simply doesn't count yet instead of dragging the grade
// toward zero. Returns null only when nothing has been graded at all.
function weightedAverage(entries: { percentage: number | null; weight: number }[]): number | null {
  const available = entries.filter((e) => e.percentage != null && e.weight > 0);
  const totalWeight = available.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight === 0) return null;
  const weightedSum = available.reduce(
    (sum, e) => sum + (e.percentage as number) * e.weight,
    0,
  );
  return weightedSum / totalWeight;
}

function periodGrade(
  data: RecordCardStudentData,
  config: GradingConfig,
  period: Period,
): number | null {
  return weightedAverage([
    { percentage: categoryPercentage(data.assignmentEntries, period), weight: config.weight_assignment },
    { percentage: categoryPercentage(data.recitationEntries, period), weight: config.weight_recitation },
    { percentage: categoryPercentage(data.quizEntries, period), weight: config.weight_quiz },
    { percentage: categoryPercentage(data.writtenEntries, period), weight: config.weight_written },
    { percentage: categoryPercentage(data.labEntries, period), weight: config.weight_laboratory },
    { percentage: majorExamPercentage(data, period), weight: config.weight_major_exam },
  ]);
}

export function computeFinalGrade(
  data: RecordCardStudentData,
  config: GradingConfig,
): FinalGrade {
  const prelim = config.use_prelims ? periodGrade(data, config, "prelim") : null;
  const midterm = periodGrade(data, config, "midterm");
  const finals = periodGrade(data, config, "finals");
  const final = weightedAverage([
    { percentage: prelim, weight: config.use_prelims ? config.prelim_weight : 0 },
    { percentage: midterm, weight: config.midterm_weight },
    { percentage: finals, weight: config.finals_weight },
  ]);

  return { prelim, midterm, finals, final };
}
