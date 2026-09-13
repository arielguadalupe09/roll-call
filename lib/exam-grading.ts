import type { ExamOption, ExamQuestion } from "./types";

// isCorrect/pointsAwarded are null for an answered essay question -- it
// can't be auto-graded, and stays null until a teacher scores it. An
// unanswered essay is graded immediately as 0, same as any other blank
// answer, since there's nothing for a teacher to review.
export type GradeResult = { isCorrect: boolean | null; pointsAwarded: number | null };

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

// Pure, server-side-only grading -- never called with data a student's
// browser could have supplied for is_correct/correct_answer, only with
// values already loaded from the database inside the submit route.
export function gradeAnswer(
  question: ExamQuestion,
  options: ExamOption[],
  submitted: { selectedOptionId: string | null; answerText: string | null; filePath?: string | null },
): GradeResult {
  if (question.type === "essay") {
    const answered = !!submitted.answerText && submitted.answerText.trim().length > 0;
    return { isCorrect: null, pointsAwarded: answered ? null : 0 };
  }

  if (question.type === "file_upload") {
    return { isCorrect: null, pointsAwarded: submitted.filePath ? null : 0 };
  }

  let isCorrect = false;

  if (question.type === "multiple_choice") {
    const correctOption = options.find((o) => o.is_correct);
    isCorrect = !!correctOption && submitted.selectedOptionId === correctOption.id;
  } else {
    const accepted = (question.correct_answer ?? "")
      .split("|")
      .map(normalize)
      .filter(Boolean);
    const answer = submitted.answerText ? normalize(submitted.answerText) : "";
    isCorrect = answer.length > 0 && accepted.includes(answer);
  }

  return { isCorrect, pointsAwarded: isCorrect ? question.points : 0 };
}
