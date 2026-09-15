import { describe, expect, it } from "vitest";
import { toSentenceCase } from "./text-format";

describe("toSentenceCase", () => {
  it("converts an all-caps title to sentence case", () => {
    expect(toSentenceCase("TEST LECTURE")).toBe("Test lecture");
  });

  it("leaves already mixed-case titles unchanged", () => {
    expect(toSentenceCase("Intro to CSS")).toBe("Intro to CSS");
  });

  it("leaves already-lowercase titles unchanged", () => {
    expect(toSentenceCase("test lecture")).toBe("test lecture");
  });

  it("handles all-caps titles starting with a non-letter", () => {
    expect(toSentenceCase("1. INTRODUCTION")).toBe("1. Introduction");
  });
});
