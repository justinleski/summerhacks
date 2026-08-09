import { randomBytes } from "node:crypto";
import { FRIEND_CODE_LENGTH } from "@summerhacks/shared";

/** Crockford Base32 alphabet (no I, L, O, U). */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateFriendCode(length = FRIEND_CODE_LENGTH): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export function normalizeFriendCode(code: string): string {
  return code.trim().toUpperCase().replace(/[ILOU]/g, "");
}
