// Uppercase letters + digits, excluding ambiguous characters (0/O, 1/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateStudentCode(length = 7): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export function generateSessionToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
