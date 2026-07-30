/**
 * Timing-safe comparison for shared secrets (SEC-18).
 *
 * Compares SHA-256 digests rather than the raw strings: the loop then always runs
 * over a fixed 32 bytes, so neither the secret's content nor its length is leaked
 * through timing. Digest comparison is the standard mitigation where a native
 * constant-time primitive isn't available.
 */

async function sha256Bytes(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return new Uint8Array(digest);
}

/** True when both strings are equal, in time independent of where they differ. */
export async function timingSafeEqualStrings(
  a: string,
  b: string,
): Promise<boolean> {
  const [digestA, digestB] = await Promise.all([sha256Bytes(a), sha256Bytes(b)]);

  let difference = 0;
  for (let i = 0; i < digestA.length; i += 1) {
    difference |= digestA[i]! ^ digestB[i]!;
  }

  return difference === 0;
}
