import { describe, expect, it } from "vitest";
import { parseExamQuestionsResponse } from "./exam-ai-parse";

describe("parseExamQuestionsResponse", () => {
  it("parses a well-formed multiple choice question", () => {
    const raw = JSON.stringify({
      questions: [
        {
          prompt: "2 + 2?",
          type: "multiple_choice",
          points: 2,
          options: [
            { label: "3", isCorrect: false },
            { label: "4", isCorrect: true },
          ],
          correctAnswer: null,
        },
      ],
    });
    const result = parseExamQuestionsResponse(raw);
    expect(result.skipped).toBe(0);
    expect(result.questions).toEqual([
      {
        prompt: "2 + 2?",
        type: "multiple_choice",
        points: 2,
        options: [
          { label: "3", isCorrect: false },
          { label: "4", isCorrect: true },
        ],
        correctAnswer: null,
      },
    ]);
  });

  it("parses true_false and identification questions", () => {
    const raw = JSON.stringify({
      questions: [
        { prompt: "The sky is blue.", type: "true_false", points: 1, options: [], correctAnswer: "TRUE" },
        {
          prompt: "Capital of the Philippines?",
          type: "identification",
          points: 1,
          options: [],
          correctAnswer: "Manila|Manila City",
        },
      ],
    });
    const result = parseExamQuestionsResponse(raw);
    expect(result.questions.map((q) => q.correctAnswer)).toEqual(["true", "Manila|Manila City"]);
  });

  it("defaults missing/invalid points to 1", () => {
    const raw = JSON.stringify({
      questions: [
        {
          prompt: "The sky is blue.",
          type: "true_false",
          options: [],
          correctAnswer: "true",
        },
      ],
    });
    const result = parseExamQuestionsResponse(raw).questions;
    expect(result[0].points).toBe(1);
  });

  it("skips a multiple choice question with no correct option marked", () => {
    const raw = JSON.stringify({
      questions: [
        {
          prompt: "2 + 2?",
          type: "multiple_choice",
          points: 1,
          options: [
            { label: "3", isCorrect: false },
            { label: "4", isCorrect: false },
          ],
        },
      ],
    });
    const result = parseExamQuestionsResponse(raw);
    expect(result.questions).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("skips a multiple choice question with more than one correct option", () => {
    const raw = JSON.stringify({
      questions: [
        {
          prompt: "2 + 2?",
          type: "multiple_choice",
          points: 1,
          options: [
            { label: "3", isCorrect: true },
            { label: "4", isCorrect: true },
          ],
        },
      ],
    });
    expect(parseExamQuestionsResponse(raw).questions).toHaveLength(0);
  });

  it("skips a multiple choice question with fewer than two options", () => {
    const raw = JSON.stringify({
      questions: [
        { prompt: "2 + 2?", type: "multiple_choice", points: 1, options: [{ label: "4", isCorrect: true }] },
      ],
    });
    expect(parseExamQuestionsResponse(raw).questions).toHaveLength(0);
  });

  it("skips a true_false question with an unrecognized answer", () => {
    const raw = JSON.stringify({
      questions: [{ prompt: "The sky is blue.", type: "true_false", options: [], correctAnswer: "maybe" }],
    });
    expect(parseExamQuestionsResponse(raw).questions).toHaveLength(0);
  });

  it("skips an identification question with a blank answer", () => {
    const raw = JSON.stringify({
      questions: [{ prompt: "Capital?", type: "identification", options: [], correctAnswer: "" }],
    });
    expect(parseExamQuestionsResponse(raw).questions).toHaveLength(0);
  });

  it("skips a question with an unrecognized type", () => {
    const raw = JSON.stringify({
      questions: [{ prompt: "Some question", type: "fill_in_the_blank", options: [], correctAnswer: null }],
    });
    expect(parseExamQuestionsResponse(raw).questions).toHaveLength(0);
  });

  it("parses an essay question with no correct answer required", () => {
    const raw = JSON.stringify({
      questions: [
        { prompt: "Explain the water cycle.", type: "essay", points: 10, options: [], correctAnswer: null },
      ],
    });
    const result = parseExamQuestionsResponse(raw);
    expect(result.skipped).toBe(0);
    expect(result.questions).toEqual([
      { prompt: "Explain the water cycle.", type: "essay", points: 10, options: [], correctAnswer: null },
    ]);
  });

  it("skips a question with a blank prompt", () => {
    const raw = JSON.stringify({
      questions: [{ prompt: "  ", type: "true_false", options: [], correctAnswer: "true" }],
    });
    expect(parseExamQuestionsResponse(raw).questions).toHaveLength(0);
  });

  it("tolerates prose wrapped around the JSON object", () => {
    const raw = `Here you go:\n${JSON.stringify({
      questions: [{ prompt: "The sky is blue.", type: "true_false", options: [], correctAnswer: "true" }],
    })}\nHope that helps!`;
    expect(parseExamQuestionsResponse(raw).questions).toHaveLength(1);
  });

  it("returns an empty result for unparsable content", () => {
    expect(parseExamQuestionsResponse("not json at all")).toEqual({ questions: [], skipped: 0 });
  });

  it("returns an empty result when the questions field is missing", () => {
    expect(parseExamQuestionsResponse(JSON.stringify({ foo: "bar" }))).toEqual({
      questions: [],
      skipped: 0,
    });
  });
});
