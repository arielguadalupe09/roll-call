import { describe, expect, it } from "vitest";
import { isValidScore, parseScoreColumn } from "./score-paste";

describe("parseScoreColumn", () => {
  it("reads one value per line and ignores the trailing newline", () => {
    expect(parseScoreColumn("8\n10\n7.5\n")).toEqual(["8", "10", "7.5"]);
  });
  it("handles Windows line endings and surrounding spaces", () => {
    expect(parseScoreColumn(" 8 \r\n9\r\n")).toEqual(["8", "9"]);
  });
  it("uses the last column when name and score are copied together", () => {
    expect(parseScoreColumn("Cruz, Juan\t8\nReyes, Ana\t10")).toEqual(["8", "10"]);
  });
  it("keeps blank cells in the middle so rows stay aligned", () => {
    expect(parseScoreColumn("8\n\n9")).toEqual(["8", "", "9"]);
  });
  it("returns a single value for plain text", () => {
    expect(parseScoreColumn("12")).toEqual(["12"]);
  });
});

describe("isValidScore", () => {
  it("accepts blanks and numbers within range", () => {
    expect(isValidScore("", 10)).toBe(true);
    expect(isValidScore("0", 10)).toBe(true);
    expect(isValidScore("10", 10)).toBe(true);
    expect(isValidScore("7.5", 10)).toBe(true);
  });
  it("rejects out-of-range, negative and non-numeric values", () => {
    expect(isValidScore("11", 10)).toBe(false);
    expect(isValidScore("-1", 10)).toBe(false);
    expect(isValidScore("abc", 10)).toBe(false);
    expect(isValidScore("8/10", 10)).toBe(false);
  });
});
