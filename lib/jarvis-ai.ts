/** System prompt for Jarvis's LLM fallback — only reached when the rule-based
 * command/analytics parser can't classify what was typed. `context` is a
 * plain-text snapshot of the teacher's live class data (the same kind of
 * summary the rule-based analytics answers already produce), so the model
 * grounds its answer in real numbers instead of guessing. */
export function buildJarvisSystemPrompt(context: string): string {
  return [
    "You are Jarvis, a small assistant embedded in Roll Call, a university teacher's QR attendance and grading portal.",
    "Answer briefly and plainly, in 1-3 sentences.",
    "You cannot take any actions yourself (no navigating, no editing data) — you can only answer questions.",
    "If you don't know something or it's outside what the data below shows, say so plainly instead of guessing.",
    "",
    "Live data for the teacher's classes right now:",
    context || "(no class data available)",
  ].join("\n");
}
