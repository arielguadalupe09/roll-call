import { describe, expect, it } from "vitest";
import { htmlToEmphasisText } from "./file-text-extract";

describe("htmlToEmphasisText", () => {
  it("wraps bold runs in ** markers", () => {
    expect(htmlToEmphasisText("<p>B) <strong>Manila</strong></p>")).toBe("B) **Manila**\n");
  });

  it("wraps underline runs in ** markers", () => {
    expect(htmlToEmphasisText("<p>B) <u>Manila</u></p>")).toBe("B) **Manila**\n");
  });

  it("wraps <b> the same as <strong>", () => {
    expect(htmlToEmphasisText("<p><b>Manila</b></p>")).toBe("**Manila**\n");
  });

  it("converts paragraph and line breaks to newlines", () => {
    expect(htmlToEmphasisText("<p>Line one</p><p>Line two<br>Line three</p>")).toBe(
      "Line one\nLine two\nLine three\n",
    );
  });

  it("strips remaining tags and decodes common entities", () => {
    expect(htmlToEmphasisText("<p>Cats &amp; dogs<span> are great</span></p>")).toBe(
      "Cats & dogs are great\n",
    );
  });

  it("leaves plain text with no formatting unchanged aside from paragraph breaks", () => {
    expect(htmlToEmphasisText("<p>What is 2 + 2?</p>")).toBe("What is 2 + 2?\n");
  });
});
