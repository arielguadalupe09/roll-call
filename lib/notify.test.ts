import { describe, expect, it } from "vitest";
import { firstNameOf, normalizeEmail, renderGradeReleaseEmail } from "./notify";

describe("normalizeEmail", () => {
  it("trims and lowercases a valid address", () => {
    expect(normalizeEmail("  Juan.Cruz@Gmail.com ")).toBe("juan.cruz@gmail.com");
  });
  it("treats empty input as clearing the email", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
  it("rejects malformed addresses", () => {
    expect(normalizeEmail("juan")).toBeUndefined();
    expect(normalizeEmail("juan@gmail")).toBeUndefined();
    expect(normalizeEmail("a b@gmail.com")).toBeUndefined();
    expect(normalizeEmail(42)).toBeUndefined();
  });
});

describe("firstNameOf", () => {
  it("takes the given name and drops the middle initial", () => {
    expect(firstNameOf("Dela Cruz, Juan M.")).toBe("Juan");
    expect(firstNameOf("Santos, Maria Clara B.")).toBe("Maria Clara");
    expect(firstNameOf("Reyes, Ana")).toBe("Ana");
  });
  it("falls back to the whole name without a comma", () => {
    expect(firstNameOf("Juan")).toBe("Juan");
  });
});

describe("renderGradeReleaseEmail", () => {
  it("names the term and class, links the portal, and never includes a grade", () => {
    const { subject, body } = renderGradeReleaseEmail({
      studentName: "Dela Cruz, Juan M.",
      className: "BSIT 2A - Programming 2",
      period: "midterm",
      portalUrl: "https://gains.example.com/",
    });
    expect(subject).toBe("Your Midterm grade is posted: BSIT 2A - Programming 2");
    expect(body).toContain("Hello Juan,");
    expect(body).toContain("https://gains.example.com/student");
    expect(body).not.toMatch(/\d+\.\d\d/);
  });
});
