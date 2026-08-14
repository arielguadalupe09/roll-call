import { describe, expect, it } from "vitest";
import { namesFromImportRows, parseStudentName, toLastNameFirst } from "./name-format";

describe("toLastNameFirst", () => {
  it("moves a trailing surname to the front", () => {
    expect(toLastNameFirst("Juan Reyes Cruz")).toBe("Cruz, Juan Reyes");
  });

  it("keeps a compound surname prefix attached", () => {
    expect(toLastNameFirst("Juan Dela Cruz")).toBe("Dela Cruz, Juan");
    expect(toLastNameFirst("Juan De La Cruz")).toBe("De La Cruz, Juan");
  });

  it("leaves an already-formatted name untouched", () => {
    expect(toLastNameFirst("Cruz, Juan")).toBe("Cruz, Juan");
  });
});

describe("namesFromImportRows", () => {
  it("combines separate Last Name / First Name / M.I. columns", () => {
    const rows = [
      { "Last Name": "Andaya", "First Name": "Juan", "M.I.": "R" },
      { "Last Name": "Bautista", "First Name": "Maria", "M.I.": "" },
    ];
    expect(namesFromImportRows(rows)).toEqual(["Andaya, Juan R.", "Bautista, Maria"]);
  });

  it("abbreviates a spelled-out middle name to an initial", () => {
    const rows = [{ "Last Name": "Cruz", "First Name": "Ana", "Middle Name": "Reyes" }];
    expect(namesFromImportRows(rows)).toEqual(["Cruz, Ana R."]);
  });

  it("matches split-name headers regardless of case/spacing/punctuation", () => {
    const rows = [{ SURNAME: "Cruz", "given_name": "Ana" }];
    expect(namesFromImportRows(rows)).toEqual(["Cruz, Ana"]);
  });

  it("skips fully blank rows but keeps a last-name-only row", () => {
    const rows = [
      { "Last Name": "Cruz", "First Name": "Ana" },
      { "Last Name": "", "First Name": "" },
      { "Last Name": "Reyes", "First Name": "" },
    ];
    expect(namesFromImportRows(rows)).toEqual(["Cruz, Ana", "Reyes"]);
  });

  it("falls back to a single Name column when there's no split last/first pair", () => {
    const rows = [{ Name: "Juan Dela Cruz" }, { Name: "Cruz, Ana" }];
    expect(namesFromImportRows(rows)).toEqual(["Dela Cruz, Juan", "Cruz, Ana"]);
  });

  it("falls back to the first column when no recognizable name header exists", () => {
    const rows = [{ "Student": "Juan Cruz" }];
    expect(namesFromImportRows(rows)).toEqual(["Cruz, Juan"]);
  });

  it("returns an empty list for an empty sheet", () => {
    expect(namesFromImportRows([])).toEqual([]);
  });
});

describe("parseStudentName", () => {
  it("splits lastname, firstname, and a trailing middle initial", () => {
    expect(parseStudentName("Cruz, Juan R.")).toEqual({
      lastName: "Cruz",
      firstName: "Juan",
      mi: "R.",
    });
  });

  it("treats the whole remainder as first name when there's no trailing initial", () => {
    expect(parseStudentName("Cruz, Juan Reyes")).toEqual({
      lastName: "Cruz",
      firstName: "Juan Reyes",
      mi: "",
    });
  });
});
