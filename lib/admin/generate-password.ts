import "server-only";
import { randomInt } from "node:crypto";

const LOWER = "abcdefghijkmnpqrstuvwxyz"; // no l/o — easy to misread aloud
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O
const DIGITS = "23456789"; // no 0/1
const SYMBOLS = "!@#$%^&*-_=+";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;
const LENGTH = 20;

function randomChar(charset: string): string {
  return charset[randomInt(charset.length)];
}

// Cryptographically random, 20 chars, guaranteed at least one of each
// character class — handed to auth.admin.createUser() and returned once
// in the API response. Never logged, never persisted.
export function generateTemporaryPassword(): string {
  const required = [
    randomChar(LOWER),
    randomChar(UPPER),
    randomChar(DIGITS),
    randomChar(SYMBOLS),
  ];
  const rest = Array.from({ length: LENGTH - required.length }, () =>
    randomChar(ALL),
  );
  const chars = [...required, ...rest];

  // Fisher-Yates using the same CSPRNG, so the guaranteed characters
  // aren't always in the first four positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
