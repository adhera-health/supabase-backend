/**
 * Cryptographically secure password generation for provisioned accounts.
 */

const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const SPECIAL = "!@#$%^&*-_=+";
const ALL_CHARS = UPPERCASE + LOWERCASE + DIGITS + SPECIAL;

const DEFAULT_LENGTH = 18;
const MIN_LENGTH = 16;
const MAX_LENGTH = 20;

const BYTE_RANGE = 256;

/**
 * Uniform random integer in [0, max) without modulo bias.
 * Rejects values in the high remainder bucket so every outcome is equally likely.
 */
function randomIndexBelow(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > BYTE_RANGE) {
    throw new RangeError(`max must be an integer between 1 and ${BYTE_RANGE}`);
  }

  const limit = Math.floor(BYTE_RANGE / max) * max;
  const bytes = new Uint8Array(1);

  while (true) {
    crypto.getRandomValues(bytes);
    const value = bytes[0]!;

    if (value < limit) {
      return value % max;
    }
  }
}

function pickChar(charset: string): string {
  return charset[randomIndexBelow(charset.length)]!;
}

function shuffleInPlace(chars: string[]): void {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndexBelow(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
}

function clampLength(length: number): number {
  if (!Number.isFinite(length)) {
    return DEFAULT_LENGTH;
  }

  return Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.trunc(length)));
}

/** Generates a password meeting complexity requirements (16–20 chars). */
export function generateSecurePassword(length = DEFAULT_LENGTH): string {
  const targetLength = clampLength(length);

  const passwordChars = [
    pickChar(UPPERCASE),
    pickChar(LOWERCASE),
    pickChar(DIGITS),
    pickChar(SPECIAL),
  ];

  while (passwordChars.length < targetLength) {
    passwordChars.push(pickChar(ALL_CHARS));
  }

  shuffleInPlace(passwordChars);

  return passwordChars.join("");
}
