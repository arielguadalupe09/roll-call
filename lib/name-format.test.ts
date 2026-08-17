import { describe, expect, it } from "vitest";
import {
  namesFromImportMatrix,
  namesFromImportRows,
  parseStudentName,
  toLastNameFirst,
} from "./name-format";

describe("toLastNameFirst", () => {
  it("moves a trailing surname to the front and abbreviates the middle name", () => {
    expect(toLastNameFirst("Juan Reyes Cruz")).toBe("Cruz, Juan R.");
  });

  it("keeps a compound surname prefix attached", () => {
    expect(toLastNameFirst("Juan Dela Cruz")).toBe("Dela Cruz, Juan");
    expect(toLastNameFirst("Juan De La Cruz")).toBe("De La Cruz, Juan");
  });

  it("leaves a name with a single given name untouched", () => {
    expect(toLastNameFirst("Cruz, Juan")).toBe("Cruz, Juan");
  });

  it("abbreviates a full middle name even when the input already has a comma", () => {
    // The bug this covers: a teacher typing "Lastname, Firstname Middlename"
    // by hand (matching the app's own placeholder order) skipped
    // reformatting entirely just because a comma was already present.
    expect(toLastNameFirst("Bautista, Raymond Catacutan")).toBe("Bautista, Raymond C.");
    expect(toLastNameFirst("Collado, Lei Ann Rivera")).toBe("Collado, Lei Ann R.");
  });

  it("normalizes an already-abbreviated middle initial instead of re-abbreviating it", () => {
    expect(toLastNameFirst("Badiable, Natalie M.")).toBe("Badiable, Natalie M.");
    expect(toLastNameFirst("Badiable, Natalie M")).toBe("Badiable, Natalie M.");
  });

  it("returns just the surname when nothing follows the comma", () => {
    expect(toLastNameFirst("Cruz,")).toBe("Cruz");
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

  it("punctuates a trailing initial embedded in First Name when there's no separate Middle Name column", () => {
    const rows = [{ "Last Name": "Aguas", "First Name": "Christian D" }];
    expect(namesFromImportRows(rows)).toEqual(["Aguas, Christian D."]);
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

  it("treats an 'N/A' middle name as no middle name, not a literal initial", () => {
    const rows = [{ "Last Name": "Bondoc", "First Name": "Vincent", "Middle Name": "N/A" }];
    expect(namesFromImportRows(rows)).toEqual(["Bondoc, Vincent"]);
  });

  it("returns an empty list for an empty sheet", () => {
    expect(namesFromImportRows([])).toEqual([]);
  });
});

describe("namesFromImportMatrix", () => {
  it("treats row 1 as the header row when it already looks like one", () => {
    const matrix = [
      ["Last Name", "First Name", "M.I."],
      ["Andaya", "Juan", "R"],
      ["Bautista", "Maria", ""],
    ];
    expect(namesFromImportMatrix(matrix)).toEqual(["Andaya, Juan R.", "Bautista, Maria"]);
  });

  it("skips a letterhead/title block and finds the real header row further down", () => {
    // The shape that broke: an official class-list export with a
    // school-name/course/section block above the actual column headers.
    const matrix = [
      ["Pampanga State University"],
      ["College of Computing Studies"],
      ["CWTS BSHM 1B", "", "", "Official Class List"],
      [],
      ["No.", "Last Name", "First Name", "M.I.", "Student No."],
      [1, "Andaya", "Juan", "R", "2023-00001"],
      [2, "Bautista", "Maria", "", "2023-00002"],
    ];
    expect(namesFromImportMatrix(matrix)).toEqual(["Andaya, Juan R.", "Bautista, Maria"]);
  });

  it("treats every row as a bare name when nothing looks like a header row", () => {
    const matrix = [
      ["Juan Dela Cruz"],
      ["Cruz, Ana"],
    ];
    expect(namesFromImportMatrix(matrix)).toEqual(["Dela Cruz, Juan", "Cruz, Ana"]);
  });

  it("assumes Last/First/Middle column order for a bare no-header multi-column sheet", () => {
    // The actual shape reported broken: no header row at all, just three
    // bare columns (Last Name, First Name, Middle Name), "N/A" standing in
    // for an absent middle name.
    const matrix = [
      ["ALQUIROZ", "SHIELLA MAE", "PINEDA"],
      ["ANDAYA", "SLYTHY CHAYSE", "DIZON"],
      ["BONDOC", "VINCENT", "N/A"],
    ];
    expect(namesFromImportMatrix(matrix)).toEqual([
      "ALQUIROZ, SHIELLA MAE P.",
      "ANDAYA, SLYTHY CHAYSE D.",
      "BONDOC, VINCENT",
    ]);
  });

  it("returns an empty list for an empty sheet", () => {
    expect(namesFromImportMatrix([])).toEqual([]);
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
