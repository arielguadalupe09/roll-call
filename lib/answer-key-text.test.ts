import { describe, expect, it } from "vitest";
import { answerKeyFromText, matrixToText } from "./answer-key-text";

describe("answerKeyFromText", () => {
  it("reads numbered answers in many styles", () => {
    const r = answerKeyFromText("1. A\n2) b\n3 - C\n4:D\n5E\n6 | (a)");
    expect(r?.format).toBe("numbered");
    expect(r?.letters).toEqual(["A", "B", "C", "D", "E", "A"]);
  });

  it("places numbered answers by item number, leaving gaps blank", () => {
    const r = answerKeyFromText("3. C   1. A   5. B");
    expect(r?.letters).toEqual(["A", "", "C", "", "B"]);
  });

  it("reads an Item | Answer table from a spreadsheet", () => {
    const text = matrixToText([
      ["Answer Key - Final Exam", ""],
      ["Item", "Answer"],
      [1, "B"],
      [2, "c"],
      [3, "A"],
    ]);
    expect(answerKeyFromText(text)?.letters).toEqual(["B", "C", "A"]);
  });

  it("reports items given two different answers", () => {
    const r = answerKeyFromText("1. A\n2. B\n2. C");
    expect(r?.letters).toEqual(["A", "C"]);
    expect(r?.conflicts).toEqual([2]);
  });

  it("does not read words starting with A-E as answers", () => {
    expect(answerKeyFromText("Chapter 1 Basics, 2 Data types")).toBeNull();
  });

  it("does not read decimals as item numbers", () => {
    expect(answerKeyFromText("1. A\n2. B\nPassing is 7.5 E")?.letters).toEqual(["A", "B"]);
  });

  it("reads a plain sequence of letters", () => {
    expect(answerKeyFromText("abdca BCD-A")?.letters).toEqual(["A", "B", "D", "C", "A", "B", "C", "D", "", "A"]);
    expect(answerKeyFromText("A\nB\nC")?.format).toBe("sequence");
    expect(answerKeyFromText(matrixToText([["A"], ["B"], ["D"]]))?.letters).toEqual(["A", "B", "D"]);
  });

  it("rejects text that is not an answer key", () => {
    expect(answerKeyFromText("")).toBeNull();
    expect(answerKeyFromText("Please bring a pencil.")).toBeNull();
    expect(answerKeyFromText("A")).toBeNull();
  });
});
