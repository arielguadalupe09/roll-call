import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractTextFromFile } from "@/lib/file-text-extract";
import { buildExamParsePrompt, parseExamQuestionsResponse, MAX_UPLOAD_BYTES } from "@/lib/exam-ai-parse";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b";
const MAX_TEXT_CHARS = 24000;

type GroqResponse = {
  choices?: { message?: { content?: string } }[];
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Question upload isn't configured." }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const answerKeyFile = form?.get("answerKey");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  const totalBytes = file.size + (answerKeyFile instanceof File ? answerKeyFile.size : 0);
  if (totalBytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "That file (or file + answer key combined) is too large -- max 4MB total." },
      { status: 400 },
    );
  }

  let text: string;
  let answerKeyText = "";
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    text = (await extractTextFromFile(buffer, file.name, file.type)).trim();
    if (answerKeyFile instanceof File) {
      const answerKeyBuffer = Buffer.from(await answerKeyFile.arrayBuffer());
      answerKeyText = (
        await extractTextFromFile(answerKeyBuffer, answerKeyFile.name, answerKeyFile.type)
      ).trim();
    }
  } catch {
    return NextResponse.json({ error: "Could not read that file." }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: "No readable text found in that file." }, { status: 400 });
  }
  let truncated = text.length > MAX_TEXT_CHARS;
  if (truncated) text = text.slice(0, MAX_TEXT_CHARS);
  if (answerKeyText.length > MAX_TEXT_CHARS) {
    truncated = true;
    answerKeyText = answerKeyText.slice(0, MAX_TEXT_CHARS);
  }

  const userContent = answerKeyText
    ? `QUESTIONS DOCUMENT:\n${text}\n\nANSWER KEY DOCUMENT (separate from the questions above):\n${answerKeyText}`
    : text;

  let upstream: Response;
  try {
    upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 6000,
        messages: [
          { role: "system", content: buildExamParsePrompt() },
          { role: "user", content: userContent },
        ],
      }),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the AI service." }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "The AI service returned an error." }, { status: 502 });
  }

  const data = (await upstream.json()) as GroqResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return NextResponse.json({ error: "The AI service returned an empty reply." }, { status: 502 });
  }

  const { questions, skipped } = parseExamQuestionsResponse(content);
  if (questions.length === 0) {
    return NextResponse.json(
      { error: "Couldn't find any gradeable questions in that file." },
      { status: 422 },
    );
  }

  return NextResponse.json({ questions, skipped, truncated });
}
