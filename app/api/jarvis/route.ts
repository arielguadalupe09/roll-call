import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildJarvisSystemPrompt } from "@/lib/jarvis-ai";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b";

type GroqResponse = {
  choices?: { message?: { content?: string } }[];
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Jarvis AI isn't configured." }, { status: 503 });
  }

  let body: { message?: unknown; context?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const context = typeof body.context === "string" ? body.context : "";
  if (!message) {
    return NextResponse.json({ error: "Missing message." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          { role: "system", content: buildJarvisSystemPrompt(context) },
          { role: "user", content: message },
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
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    return NextResponse.json({ error: "The AI service returned an empty reply." }, { status: 502 });
  }

  return NextResponse.json({ reply });
}
