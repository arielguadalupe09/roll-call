import type { QuestionType } from "./types";

// Vercel's Serverless Functions reject any request body over 4.5MB at the
// platform edge, before it ever reaches this app's code -- the response is a
// plain-text 413 with no JSON body, which the upload UI can't distinguish
// from a generic parse failure. Kept intentionally below that hard limit
// (not just under our own former 8MB check) so client-side validation can
// catch this before spending time uploading, and the server route's own
// check (in case that limit ever changes) rejects with an accurate message.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type ParsedExamOption = { label: string; isCorrect: boolean };

export type ParsedExamQuestion = {
  prompt: string;
  type: QuestionType;
  points: number;
  options: ParsedExamOption[];
  correctAnswer: string | null;
};

const VALID_TYPES: QuestionType[] = ["multiple_choice", "true_false", "identification", "essay"];

export function buildExamParsePrompt(): string {
  return [
    "You extract exam questions and their answer key from raw text taken from a teacher's document.",
    "Respond with ONLY a JSON object, no prose, no markdown code fences, matching this shape exactly:",
    '{"questions":[{"prompt":string,"type":"multiple_choice"|"true_false"|"identification"|"essay","points":number,"options":[{"label":string,"isCorrect":boolean}],"correctAnswer":string|null}]}',
    "Rules:",
    '- type "multiple_choice": include every option in "options" (2 or more), exactly one with isCorrect true; correctAnswer is null.',
    '  "label" MUST be the option\'s actual answer text with any leading letter/number marker ("A)", "B.", "1)", etc.) stripped off -- never output just the bare letter or number as the label.',
    '  Example: source line "B) Manila" -> {"label":"Manila","isCorrect":true}, NOT {"label":"B","isCorrect":true}.',
    '- type "true_false": options is an empty array; correctAnswer is exactly "true" or "false".',
    '- type "identification": options is an empty array; correctAnswer is the accepted answer text (join alternates the source lists with "|"). Acronym-expansion questions (e.g. "What does HTTP stand for?") are identification, not essay.',
    '- type "essay": genuinely open-ended/long-answer questions with no single fixed answer (e.g. "Explain...", "Discuss...", "In your own words..."). options is an empty array; correctAnswer is null. Do NOT skip these -- include them so a teacher can grade them by hand later.',
    "- points: use the point value stated in the source if present, otherwise default to 1.",
    "- Use the answer key given in the text to decide correctness for multiple_choice/true_false/identification -- never guess an answer that isn't indicated in the source.",
    '- Some sources mark the correct multiple-choice option or true/false answer by bolding or underlining it in the original document instead of (or in addition to) a written answer key -- those spans are wrapped in "**" in the text you receive (e.g. "B) **Manila**"). Treat "**wrapped**" text as the correct answer when no separate answer key indicates otherwise.',
    '- The text may contain a section separately labeled "ANSWER KEY" (possibly from a second, separate document) listing answers by question number -- match those to questions by their number/order and use them the same way as an inline answer key.',
    "- Skip only text that isn't an actual question at all (instructions, section headers, point totals, etc.).",
    '- If nothing in the text looks like a question, return {"questions":[]}.',
  ].join("\n");
}

function extractJsonBlock(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return raw;
  return raw.slice(start, end + 1);
}

export function parseExamQuestionsResponse(raw: string): {
  questions: ParsedExamQuestion[];
  skipped: number;
} {
  let data: unknown;
  try {
    data = JSON.parse(extractJsonBlock(raw));
  } catch {
    return { questions: [], skipped: 0 };
  }

  const list =
    data && typeof data === "object" && Array.isArray((data as { questions?: unknown }).questions)
      ? (data as { questions: unknown[] }).questions
      : [];

  const questions: ParsedExamQuestion[] = [];
  let skipped = 0;

  for (const item of list) {
    const parsed = normalizeQuestion(item);
    if (parsed) questions.push(parsed);
    else skipped++;
  }

  return { questions, skipped };
}

function normalizeQuestion(item: unknown): ParsedExamQuestion | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;

  const prompt = typeof obj.prompt === "string" ? obj.prompt.trim() : "";
  const type =
    typeof obj.type === "string" && VALID_TYPES.includes(obj.type as QuestionType)
      ? (obj.type as QuestionType)
      : null;
  const points = typeof obj.points === "number" && obj.points > 0 ? obj.points : 1;

  if (!prompt || !type) return null;

  if (type === "multiple_choice") {
    const rawOptions = Array.isArray(obj.options) ? obj.options : [];
    const options: ParsedExamOption[] = rawOptions
      .map((o) => {
        if (!o || typeof o !== "object") return null;
        const oo = o as Record<string, unknown>;
        const label = typeof oo.label === "string" ? oo.label.trim() : "";
        if (!label) return null;
        return { label, isCorrect: oo.isCorrect === true };
      })
      .filter((o): o is ParsedExamOption => o !== null);

    if (options.length < 2 || options.filter((o) => o.isCorrect).length !== 1) return null;
    return { prompt, type, points, options, correctAnswer: null };
  }

  if (type === "essay") {
    return { prompt, type, points, options: [], correctAnswer: null };
  }

  if (type === "true_false") {
    const answer = typeof obj.correctAnswer === "string" ? obj.correctAnswer.trim().toLowerCase() : "";
    if (answer !== "true" && answer !== "false") return null;
    return { prompt, type, points, options: [], correctAnswer: answer };
  }

  const answer = typeof obj.correctAnswer === "string" ? obj.correctAnswer.trim() : "";
  if (!answer) return null;
  return { prompt, type, points, options: [], correctAnswer: answer };
}
