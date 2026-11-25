import { describe, expect, it } from "vitest";
import { sameSubjectReason, type ClassForShare } from "./answer-key-share";

const cls = (name: string, subject: string | null = null, course_code: string | null = null): ClassForShare => ({
  id: name,
  name,
  subject,
  course_code,
});

describe("sameSubjectReason", () => {
  it("matches the Subject field, ignoring case and spacing", () => {
    expect(sameSubjectReason(cls("BSFIL 1A", "NSTP  CWTS 1"), cls("BSED 1B", "nstp cwts 1"))).toBe("same subject");
  });

  it("matches the course code", () => {
    expect(sameSubjectReason(cls("A", null, "CWTS 101"), cls("B", "Other", "cwts 101"))).toBe("same course code");
  });

  it("matches the first word of the class name", () => {
    expect(sameSubjectReason(cls("CWTS BSFIL 1A"), cls("CWTS BSED 1B"))).toBe("same name");
    expect(sameSubjectReason(cls("CSS-11 Grade 11"), cls("CSS 12 ICT"))).toBe("same name");
  });

  it("does not link different subjects or bare section codes", () => {
    expect(sameSubjectReason(cls("CWTS BSFIL 1A"), cls("CSS BSFIL 1A"))).toBeNull();
    expect(sameSubjectReason(cls("1A Morning"), cls("1A Afternoon"))).toBeNull();
    expect(sameSubjectReason(cls("X", ""), cls("Y", ""))).toBeNull();
  });
});
