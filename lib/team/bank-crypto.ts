import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for bank account numbers. Stored as
// "v1:" + base64(iv[12] | authTag[16] | ciphertext). The key is 32 random
// bytes, base64-encoded, in the TEAM_ENCRYPTION_KEY env var (server only).
// Pure functions take the key so they can be tested; readKey() reads env.

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function parseKey(base64Key: string | undefined): Buffer {
  if (!base64Key) throw new Error("TEAM_ENCRYPTION_KEY is not set.");
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("TEAM_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return key;
}

export function readKey(): Buffer {
  return parseKey(process.env.TEAM_ENCRYPTION_KEY);
}

export function encryptText(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

export function decryptText(stored: string, key: Buffer): string {
  const [version, payload] = stored.split(":", 2);
  if (version !== VERSION || !payload) throw new Error("Unknown ciphertext format.");
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
}
