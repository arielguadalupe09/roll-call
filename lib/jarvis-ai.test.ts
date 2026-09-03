import { describe, expect, it } from "vitest";
import { buildJarvisSystemPrompt } from "./jarvis-ai";

describe("buildJarvisSystemPrompt", () => {
  it("includes the provided data context", () => {
    const prompt = buildJarvisSystemPrompt("Web Development: 91% average attendance.");
    expect(prompt).toContain("Web Development: 91% average attendance.");
  });

  it("says plainly when no context is available", () => {
    const prompt = buildJarvisSystemPrompt("");
    expect(prompt).toContain("no class data available");
  });

  it("tells the model it can only answer, not act", () => {
    const prompt = buildJarvisSystemPrompt("");
    expect(prompt).toContain("cannot take any actions");
  });
});
