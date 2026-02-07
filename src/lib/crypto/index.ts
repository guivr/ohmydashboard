import crypto from "crypto";
import fs from "fs";
import path from "path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

const KEY_DIR = path.join(process.cwd(), ".ohmydashboard");
const KEY_PATH = path.join(KEY_DIR, ".encryption_key");

/**
 * Get or create the encryption key.
 *
 * The key is a 256-bit random value stored in `.ohmydashboard/.encryption_key`.
 * This file should never be committed to version control.
 *
 * For testing, a key can be passed directly.
 */
export function getEncryptionKey(keyOverride?: Buffer): Buffer {
  if (keyOverride) return keyOverride;

  if (!fs.existsSync(KEY_DIR)) {
    fs.mkdirSync(KEY_DIR, { recursive: true });
  }

  if (fs.existsSync(KEY_PATH)) {
    const stored = fs.readFileSync(KEY_PATH);
    if (stored.length === KEY_LENGTH) return stored;
  }

  // Generate a new key
  const key = crypto.randomBytes(KEY_LENGTH);
  fs.writeFileSync(KEY_PATH, key, { mode: 0o600 }); // Owner read/write only
  return key;
}

/**
 * Encrypt a plaintext string.
 *
 * Returns a hex-encoded string in the format: iv:authTag:ciphertext
 * All three components are hex-encoded.
 */
export function encrypt(plaintext: string, keyOverride?: Buffer): string {
  const key = getEncryptionKey(keyOverride);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt an encrypted string.
 *
 * Expects the format produced by `encrypt()`: iv:authTag:ciphertext
 */
export function decrypt(encryptedData: string, keyOverride?: Buffer): string {
  const key = getEncryptionKey(keyOverride);

  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const ciphertext = parts[2];

  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid IV length");
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid auth tag length");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Check if a string looks like it was encrypted by our encrypt() function.
 * Uses format detection (hex:hex:hex with correct lengths).
 */
export function isEncrypted(data: string): boolean {
  const parts = data.split(":");
  if (parts.length !== 3) return false;

  // IV should be 32 hex chars (16 bytes), auth tag 32 hex chars (16 bytes)
  if (parts[0].length !== IV_LENGTH * 2) return false;
  if (parts[1].length !== AUTH_TAG_LENGTH * 2) return false;

  // All parts should be valid hex
  return /^[0-9a-f]+$/.test(parts[0] + parts[1] + parts[2]);
}
