// Reformats a freely-typed "Firstname Middle Lastname" style name into
// "Lastname, Firstname Middle" for the class roster. Recognizes common
// Filipino/Spanish compound surname prefixes (e.g. "Dela Cruz", "De Guzman",
// "San Juan") so they aren't split apart from their surname. Leaves anything
// that already contains a comma untouched, since that's assumed to already
// be in "Lastname, Firstname" order.
const TWO_WORD_PREFIXES = new Set(["de la", "de los", "de las"]);
const ONE_WORD_PREFIXES = new Set([
  "dela",
  "delos",
  "delas",
  "de",
  "del",
  "san",
  "santa",
  "santo",
  "mc",
  "mac",
  "van",
  "von",
  "st",
  "st.",
]);

export function toLastNameFirst(rawName: string): string {
  const trimmed = rawName.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.includes(",")) return trimmed;

  const words = trimmed.split(" ");
  if (words.length < 2) return trimmed;

  let surnameStartIndex = words.length - 1;

  if (words.length >= 3) {
    const lastTwoLower = words.slice(-3, -1).join(" ").toLowerCase();
    if (TWO_WORD_PREFIXES.has(lastTwoLower)) {
      surnameStartIndex = words.length - 3;
    }
  }

  if (surnameStartIndex === words.length - 1) {
    const precedingWord = words[words.length - 2]
      .toLowerCase()
      .replace(/\.$/, "");
    if (ONE_WORD_PREFIXES.has(precedingWord)) {
      surnameStartIndex = words.length - 2;
    }
  }

  const surname = words.slice(surnameStartIndex).join(" ");
  const givenNames = words.slice(0, surnameStartIndex).join(" ");
  return givenNames ? `${surname}, ${givenNames}` : surname;
}

const normalizeHeader = (k: string) => k.trim().toLowerCase().replace(/[^a-z]/g, "");

const LAST_NAME_HEADERS = new Set(["lastname", "surname", "familyname"]);
const FIRST_NAME_HEADERS = new Set(["firstname", "givenname"]);
const MIDDLE_NAME_HEADERS = new Set([
  "middlename",
  "middleinitial",
  "mi",
  "middle",
]);
const FULL_NAME_HEADERS = new Set(["name", "fullname", "studentname"]);

// Builds "Lastname, Firstname M.I." roster names from an imported
// spreadsheet's rows. Many school class-list templates (including this
// app's own DHVSU export) use separate Last Name / First Name / M.I.
// columns rather than one combined "Name" column -- picking up only the
// first column in that case silently drops every student's first and
// middle name, so this checks for the split-column shape first and only
// falls back to a single free-text name column when it isn't present.
export function namesFromImportRows(rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];
  const keys = Object.keys(rows[0]);

  const lastNameKey = keys.find((k) => LAST_NAME_HEADERS.has(normalizeHeader(k)));
  const firstNameKey = keys.find((k) => FIRST_NAME_HEADERS.has(normalizeHeader(k)));

  if (lastNameKey && firstNameKey) {
    const middleNameKey = keys.find((k) => MIDDLE_NAME_HEADERS.has(normalizeHeader(k)));
    return rows
      .map((r) => {
        const last = String(r[lastNameKey] ?? "").trim();
        const first = String(r[firstNameKey] ?? "").trim();
        const middleRaw = middleNameKey ? String(r[middleNameKey] ?? "").trim() : "";
        const mi = middleRaw ? `${middleRaw[0].toUpperCase()}.` : "";
        if (!last && !first) return "";
        return [last, [first, mi].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      })
      .filter((n) => n.length > 0);
  }

  const nameKey = keys.find((k) => FULL_NAME_HEADERS.has(normalizeHeader(k))) ?? keys[0];
  return rows
    .map((r) => String(r[nameKey] ?? "").trim())
    .filter((n) => n.length > 0)
    .map((n) => toLastNameFirst(n));
}

// Splits a "Lastname, Firstname M.I." roster name back into parts for
// printable forms (e.g. the Student Individual Record Card's separate
// FIRST NAME / LAST NAME / M.I cells). The trailing token is treated as a
// middle initial only if it looks like one ("L." or similar).
export function parseStudentName(name: string): {
  lastName: string;
  firstName: string;
  mi: string;
} {
  const commaIndex = name.indexOf(",");
  if (commaIndex === -1) return { lastName: name.trim(), firstName: "", mi: "" };

  const lastName = name.slice(0, commaIndex).trim();
  const rest = name.slice(commaIndex + 1).trim();
  const parts = rest.split(/\s+/).filter(Boolean);

  if (parts.length === 0) return { lastName, firstName: "", mi: "" };

  const last = parts[parts.length - 1];
  const looksLikeMiddleInitial = /^[A-Za-z]{1,3}\.?$/.test(last);

  if (parts.length > 1 && looksLikeMiddleInitial) {
    return { lastName, firstName: parts.slice(0, -1).join(" "), mi: last };
  }
  return { lastName, firstName: rest, mi: "" };
}
