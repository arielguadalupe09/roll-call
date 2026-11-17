import { describe, expect, it } from "vitest";
import { matchEmailRows } from "./email-import";

const students = [
  { id: "1", name: "Abdon, Sabrina Krista R.", code: "PCFJ43A" },
  { id: "2", name: "Agana, Jun Ritchie A.", code: "57R4R8C" },
  { id: "3", name: "Cruz, Juan M.", code: "AAAA111" },
  { id: "4", name: "Dela Cruz, Juan P.", code: "BBBB222" },
  { id: "5", name: "Peña, José", code: "CCCC333" },
];

describe("matchEmailRows", () => {
  it("matches a Lastname, Firstname cell and skips header rows", () => {
    const r = matchEmailRows(
      [
        ["Name", "Email"],
        ["Abdon, Sabrina Krista R.", "Sabrina.Abdon@Gmail.com"],
      ],
      students,
    );
    expect(r.matches).toEqual([{ studentId: "1", studentName: "Abdon, Sabrina Krista R.", email: "sabrina.abdon@gmail.com" }]);
    expect(r.unmatched).toEqual([]);
  });

  it("matches split columns, first-name-first order and missing initials", () => {
    const r = matchEmailRows(
      [
        ["Agana", "Jun Ritchie", "A", "jun@x.com"],
        ["Sabrina Krista Abdon", "sab@x.com"],
      ],
      students,
    );
    expect(r.matches.map((m) => m.studentId)).toEqual(["2", "1"]);
  });

  it("matches by student code", () => {
    const r = matchEmailRows([["57r4r8c", "jr@x.com"]], students);
    expect(r.matches[0].studentId).toBe("2");
  });

  it("matches plain Word lines with the email in the same text", () => {
    const r = matchEmailRows([["1. Abdon, Sabrina Krista R. - <sabrina@x.com>"]], students);
    expect(r.matches[0]).toMatchObject({ studentId: "1", email: "sabrina@x.com" });
  });

  it("prefers the more specific name and ignores accents", () => {
    const r = matchEmailRows(
      [
        ["Dela Cruz, Juan", "dc@x.com"],
        ["Pena, Jose", "jp@x.com"],
      ],
      students,
    );
    expect(r.matches.map((m) => m.studentId)).toEqual(["4", "5"]);
  });

  it("reports unknown names and a student listed twice as unmatched", () => {
    const r = matchEmailRows(
      [
        ["Nobody, Here", "n@x.com"],
        ["Agana, Jun Ritchie", "a@x.com"],
        ["Agana, Jun Ritchie", "b@x.com"],
      ],
      students,
    );
    expect(r.matches).toHaveLength(1);
    expect(r.unmatched).toHaveLength(2);
  });
});
