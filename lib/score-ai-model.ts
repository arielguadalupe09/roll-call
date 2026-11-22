// Server-only: import from route handlers, never from a client component
// (it reads API keys).
//
// Encoding bot, model part. One model call transcribes the sheet; everything
// after (column choice, roster matching, validation) is code, so the provider
// can be swapped without touching the rest.
//
//   AI_READ_PROVIDER=groq       (default) free tier, reuses GROQ_API_KEY.
//                               Vision model is a Groq *preview* model -- Groq may
//                               retire it at short notice; override with
//                               AI_READ_GROQ_MODEL when that happens.
//   AI_READ_PROVIDER=anthropic  paid, needs ANTHROPIC_API_KEY. Better on messy
//                               handwriting; schema-enforced output.
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonObject, parseSheetReading, SHEET_READING_SCHEMA, type SheetReading } from "./score-ai-read";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";
const CLAUDE_MODEL = "claude-opus-5-5";

const SYSTEM = `You transcribe teachers' score sheets (class records, quiz score lists) for a Philippine university gradebook.
Return every student row and every score column exactly as written. Do not compute, correct, round, or invent anything.
- Names: copy as written, keeping the sheet's order (usually "Surname, Given name M.I."). Skip header, total, average, and signature rows.
- Columns: only score columns (quizzes, activities, exams, totals, etc.), not row numbers, IDs, sex, or remarks. Use the heading as written.
- Cells: copy the value as written ("15", "15/20", "AB", "INC", "-"). Use "" for a blank cell. Set uncertain=true whenever handwriting, a smudge, or a crossed-out value makes you less than sure.
- If a column states a maximum (a "/20" heading, a "perfect score" or "items" row), put it in max_score; otherwise null.
- If this is not a score sheet or is unreadable, set readable=false and explain briefly in problem.`;

// Groq's JSON mode doesn't enforce a schema, so the shape goes in the prompt
// (parseSheetReading validates whatever comes back either way).
const GROQ_FORMAT = `Reply with one compact JSON object only, no other text, in exactly this shape:
{"readable":true,"problem":"","columns":[{"header":"Q1","max_score":20}],"rows":[{"name":"Dela Cruz, Juan S.","cells":[{"value":"18","uncertain":false}]}]}
Each row's "cells" has one entry per column, in column order.`;

export type SheetInput =
  | { kind: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string }
  | { kind: "csv"; csv: string };

export class AiReadError extends Error {}

type Provider = "groq" | "anthropic";

function provider(): Provider {
  return process.env.AI_READ_PROVIDER === "anthropic" ? "anthropic" : "groq";
}

export function aiReadConfigured(): { ok: true } | { ok: false; missing: string } {
  const p = provider();
  const key = p === "anthropic" ? "ANTHROPIC_API_KEY" : "GROQ_API_KEY";
  return process.env[key] ? { ok: true } : { ok: false, missing: key };
}

export async function readScoreSheet(input: SheetInput, hint: string): Promise<SheetReading> {
  const prompt = input.kind === "image" ? `Transcribe this score sheet. ${hint}` : `Transcribe this spreadsheet (CSV, one line per row). ${hint}\n\n${input.csv}`;
  const json = provider() === "anthropic" ? await viaClaude(input, prompt) : await viaGroq(input, prompt);
  return parseSheetReading(json);
}

// --- Groq (free) --------------------------------------------------------------

type GroqResponse = { choices?: { message?: { content?: string }; finish_reason?: string }[] };

async function viaGroq(input: SheetInput, prompt: string): Promise<unknown> {
  const model = process.env.AI_READ_GROQ_MODEL || DEFAULT_GROQ_MODEL;
  const userContent =
    input.kind === "image"
      ? [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${input.mediaType};base64,${input.base64}` } },
        ]
      : prompt;

  let upstream: Response;
  try {
    upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 8192,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${SYSTEM}\n\n${GROQ_FORMAT}` },
          { role: "user", content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(100_000),
    });
  } catch {
    throw new AiReadError("Couldn't reach the AI service. Try again shortly.");
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error(`Groq AI read failed (${upstream.status}, model ${model}):`, detail.slice(0, 500));
    if (upstream.status === 429) throw new AiReadError("The free AI reader is at its limit right now. Wait a minute and try again.");
    if (upstream.status === 401) throw new AiReadError("The AI reader isn't set up correctly (API key). Tell your administrator.");
    if (upstream.status === 404 || /model.*(not found|decommission|does not exist)/i.test(detail))
      throw new AiReadError("The free AI model was retired by Groq. Ask your administrator to set AI_READ_GROQ_MODEL to a current vision model.");
    if (upstream.status === 413) throw new AiReadError("That photo is too large for the free AI reader. Try a smaller or cropped photo.");
    throw new AiReadError("The AI reader couldn't read that file. Try a clearer photo, or the original spreadsheet.");
  }

  const data = (await upstream.json().catch(() => null)) as GroqResponse | null;
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === "length") throw new AiReadError("This sheet is too large to read in one go. Split it into smaller photos or files.");
  try {
    return extractJsonObject(choice?.message?.content ?? "");
  } catch {
    throw new AiReadError("The AI reader returned something unexpected. Try again.");
  }
}

// --- Claude (paid) --------------------------------------------------------------

let client: Anthropic | null = null;

async function viaClaude(input: SheetInput, prompt: string): Promise<unknown> {
  client ??= new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] =
    input.kind === "image"
      ? [
          { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.base64 } },
          { type: "text", text: prompt },
        ]
      : [{ type: "text", text: prompt }];

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: SHEET_READING_SCHEMA } },
      // On a safety-classifier decline, the API re-runs the request on Anthropic's
      // recommended fallback model instead of returning a refusal.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new AiReadError("The AI reader is busy right now. Try again in a minute.");
    if (err instanceof Anthropic.AuthenticationError) throw new AiReadError("The AI reader isn't set up correctly (API key). Tell your administrator.");
    if (err instanceof Anthropic.BadRequestError) throw new AiReadError("The AI reader couldn't accept that file. Try a clearer photo or the original spreadsheet.");
    if (err instanceof Anthropic.APIError) throw new AiReadError("The AI reader is unavailable right now. Try again shortly.");
    throw err;
  }

  if (response.stop_reason === "refusal") throw new AiReadError("The AI reader declined this file. Enter the scores by hand.");
  if (response.stop_reason === "max_tokens") throw new AiReadError("This sheet is too large to read in one go. Split it into smaller photos or files.");
  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    throw new AiReadError("The AI reader returned something unexpected. Try again.");
  }
}
