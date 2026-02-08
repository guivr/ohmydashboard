import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { encrypt, decrypt, isEncrypted } from "../index";

// Use a fixed test key so tests are deterministic
const TEST_KEY = crypto.randomBytes(32);

describe("Credential Encryption", () => {
  describe("encrypt / decrypt", () => {
    it("should encrypt and decrypt a simple string", () => {
      const plaintext = "sk_live_abc123";
      const encrypted = encrypt(plaintext, TEST_KEY);
      const decrypted = decrypt(encrypted, TEST_KEY);

      expect(decrypted).toBe(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).not.toContain("sk_live");
    });

    it("should encrypt and decrypt JSON credentials", () => {
      const credentials = JSON.stringify({
        secret_key: "sk_live_longkeyvalue123456",
        webhook_secret: "whsec_testvalue",
      });

      const encrypted = encrypt(credentials, TEST_KEY);
      const decrypted = decrypt(encrypted, TEST_KEY);

      expect(JSON.parse(decrypted)).toEqual({
        secret_key: "sk_live_longkeyvalue123456",
        webhook_secret: "whsec_testvalue",
      });
    });

    it("should produce different ciphertext for same plaintext (random IV)", () => {
      const plaintext = "same_value";
      const encrypted1 = encrypt(plaintext, TEST_KEY);
      const encrypted2 = encrypt(plaintext, TEST_KEY);

      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      expect(decrypt(encrypted1, TEST_KEY)).toBe(plaintext);
      expect(decrypt(encrypted2, TEST_KEY)).toBe(plaintext);
    });

    it("should handle empty strings", () => {
      const encrypted = encrypt("", TEST_KEY);
      const decrypted = decrypt(encrypted, TEST_KEY);
      expect(decrypted).toBe("");
    });

    it("should handle unicode characters", () => {
      const plaintext = "key_with_unicode_\u00e9\u00e0\u00fc";
      const encrypted = encrypt(plaintext, TEST_KEY);
      const decrypted = decrypt(encrypted, TEST_KEY);
      expect(decrypted).toBe(plaintext);
    });

    it("should fail to decrypt with wrong key", () => {
      const encrypted = encrypt("secret", TEST_KEY);
      const wrongKey = crypto.randomBytes(32);

      expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });

    it("should fail to decrypt tampered ciphertext", () => {
      const encrypted = encrypt("secret", TEST_KEY);
      const parts = encrypted.split(":");

      // Tamper with the ciphertext
      const tampered = parts[0] + ":" + parts[1] + ":" + "ff" + parts[2].slice(2);

      expect(() => decrypt(tampered, TEST_KEY)).toThrow();
    });

    it("should fail to decrypt tampered auth tag", () => {
      const encrypted = encrypt("secret", TEST_KEY);
      const parts = encrypted.split(":");

      // Tamper with the auth tag
      const tampered = parts[0] + ":" + "00".repeat(16) + ":" + parts[2];

      expect(() => decrypt(tampered, TEST_KEY)).toThrow();
    });
  });

  describe("isEncrypted", () => {
    it("should return true for encrypted data", () => {
      const encrypted = encrypt("test", TEST_KEY);
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it("should return false for plain JSON", () => {
      expect(isEncrypted('{"key": "value"}')).toBe(false);
    });

    it("should return false for plain strings", () => {
      expect(isEncrypted("sk_live_abc123")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isEncrypted("")).toBe(false);
    });

    it("should return false for data with wrong segment lengths", () => {
      expect(isEncrypted("aabb:ccdd:eeff")).toBe(false);
    });

    it("should return false for non-hex data with colons", () => {
      expect(isEncrypted("not:hex:data")).toBe(false);
    });
  });

  describe("encrypted format", () => {
    it("should produce iv:authTag:ciphertext format", () => {
      const encrypted = encrypt("test", TEST_KEY);
      const parts = encrypted.split(":");

      expect(parts).toHaveLength(3);

      // IV = 12 bytes = 24 hex chars (NIST GCM recommended)
      expect(parts[0]).toHaveLength(24);
      // Auth tag = 16 bytes = 32 hex chars
      expect(parts[1]).toHaveLength(32);
      // Ciphertext length varies
      expect(parts[2].length).toBeGreaterThan(0);
    });
  });
});
