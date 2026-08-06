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
