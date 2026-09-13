import { describe, expect, it } from "vitest";
import { gradeAnswer } from "./exam-grading";
import type { ExamOption, ExamQuestion } from "./types";

function mcQuestion(points = 1): ExamQuestion {
  return {
    id: "q1",
    exam_id: "e1",
    prompt: "2 + 2?",
    type: "multiple_choice",
    points,
    order_index: 0,
    correct_answer: null,
    created_at: "",
  };
}

function idQuestion(correctAnswer: string, points = 1): ExamQuestion {
  return {
    id: "q1",
    exam_id: "e1",
    prompt: "Capital of the Philippines?",
    type: "identification",
    points,
    order_index: 0,
    correct_answer: correctAnswer,
    created_at: "",
  };
}

function essayQuestion(points = 5): ExamQuestion {
  return {
    id: "q1",
    exam_id: "e1",
    prompt: "Explain the water cycle.",
    type: "essay",
    points,
    order_index: 0,
    correct_answer: null,
    created_at: "",
  };
}

function fileUploadQuestion(points = 10): ExamQuestion {
  return {
    id: "q1",
    exam_id: "e1",
    prompt: "Attach your lab report.",
    type: "file_upload",
    points,
    order_index: 0,
    correct_answer: null,
    created_at: "",
  };
}

const options: ExamOption[] = [
  { id: "a", question_id: "q1", label: "3", is_correct: false, order_index: 0 },
  { id: "b", question_id: "q1", label: "4", is_correct: true, order_index: 1 },
];

describe("gradeAnswer", () => {
  it("grades multiple choice correct by matching the flagged option", () => {
    const result = gradeAnswer(mcQuestion(5), options, {
      selectedOptionId: "b",
      answerText: null,
    });
    expect(result).toEqual({ isCorrect: true, pointsAwarded: 5 });
  });

  it("grades multiple choice incorrect and awards zero points", () => {
    const result = gradeAnswer(mcQuestion(5), options, {
      selectedOptionId: "a",
      answerText: null,
    });
    expect(result).toEqual({ isCorrect: false, pointsAwarded: 0 });
  });

  it("grades an unanswered multiple choice question as incorrect", () => {
    const result = gradeAnswer(mcQuestion(), options, {
      selectedOptionId: null,
      answerText: null,
    });
    expect(result.isCorrect).toBe(false);
  });

  it("matches identification answers case-insensitively and trimmed", () => {
    const question = idQuestion("Manila");
    expect(
      gradeAnswer(question, [], { selectedOptionId: null, answerText: "  manila  " }).isCorrect,
    ).toBe(true);
  });

  it("accepts any of several pipe-separated acceptable answers", () => {
    const question = idQuestion("manila|manila city");
    expect(
      gradeAnswer(question, [], { selectedOptionId: null, answerText: "Manila City" }).isCorrect,
    ).toBe(true);
  });

  it("rejects a blank identification answer even if correct_answer is also blank", () => {
    const question = idQuestion("");
    expect(
      gradeAnswer(question, [], { selectedOptionId: null, answerText: "" }).isCorrect,
    ).toBe(false);
  });

  it("leaves an answered essay question ungraded (pending teacher review)", () => {
    const result = gradeAnswer(essayQuestion(5), [], {
      selectedOptionId: null,
      answerText: "The sun heats water, it evaporates, condenses, and falls as rain.",
    });
    expect(result).toEqual({ isCorrect: null, pointsAwarded: null });
  });

  it("grades an unanswered essay question as zero immediately, no review needed", () => {
    const result = gradeAnswer(essayQuestion(5), [], { selectedOptionId: null, answerText: "" });
    expect(result).toEqual({ isCorrect: null, pointsAwarded: 0 });
  });

  it("treats a whitespace-only essay answer as unanswered", () => {
    const result = gradeAnswer(essayQuestion(5), [], { selectedOptionId: null, answerText: "   " });
    expect(result).toEqual({ isCorrect: null, pointsAwarded: 0 });
  });

  it("leaves a submitted file_upload question ungraded (pending teacher review)", () => {
    const result = gradeAnswer(fileUploadQuestion(10), [], {
      selectedOptionId: null,
      answerText: null,
      filePath: "class1/exam1/student1/q1/report.pdf",
    });
    expect(result).toEqual({ isCorrect: null, pointsAwarded: null });
  });

  it("grades a file_upload question with no submitted file as zero immediately", () => {
    const result = gradeAnswer(fileUploadQuestion(10), [], {
      selectedOptionId: null,
      answerText: null,
      filePath: null,
    });
    expect(result).toEqual({ isCorrect: null, pointsAwarded: 0 });
  });
});
