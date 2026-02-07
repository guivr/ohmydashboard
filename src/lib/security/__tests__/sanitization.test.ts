import { describe, it, expect } from "vitest";
import { generateSecureId, sanitizeErrorMessage } from "../index";

describe("Security Utilities", () => {
  describe("generateSecureId", () => {
    it("should return a string", () => {
      expect(typeof generateSecureId()).toBe("string");
    });

    it("should return a valid UUID v4 format", () => {
      const id = generateSecureId();
      // UUID v4: 8-4-4-4-12 hex characters
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });

    it("should generate unique IDs", () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateSecureId()));
      expect(ids.size).toBe(100);
    });
  });

  describe("sanitizeErrorMessage", () => {
    it("should pass through safe error messages", () => {
      expect(sanitizeErrorMessage("Something went wrong")).toBe(
        "Something went wrong"
      );
    });

    it("should redact Stripe live secret keys", () => {
      const msg = "Invalid API key: sk_live_abc123def456ghi789";
      const result = sanitizeErrorMessage(msg);
      expect(result).not.toContain("sk_live_abc123def456ghi789");
      expect(result).toContain("[REDACTED]");
    });

    it("should redact Stripe test secret keys", () => {
      const msg = "Error with sk_test_abc123def456ghi789";
      const result = sanitizeErrorMessage(msg);
      expect(result).not.toContain("sk_test_abc123def456ghi789");
      expect(result).toContain("[REDACTED]");
    });

    it("should redact Stripe restricted keys", () => {
      const msg = "Auth failed: rk_live_abc123def456ghi789";
      const result = sanitizeErrorMessage(msg);
      expect(result).not.toContain("rk_live_abc123def456ghi789");
      expect(result).toContain("[REDACTED]");
    });

    it("should redact Stripe webhook secrets", () => {
      const msg = "Webhook whsec_abc123def456ghi789 is invalid";
      const result = sanitizeErrorMessage(msg);
      expect(result).not.toContain("whsec_abc123def456ghi789");
      expect(result).toContain("[REDACTED]");
    });

    it("should redact Bearer tokens", () => {
      const msg = "Failed with Bearer eyJhbGciOiJIUzI1NiJ9.abc.def";
      const result = sanitizeErrorMessage(msg);
      expect(result).not.toContain("eyJhbGciOiJIUzI1NiJ9");
      expect(result).toContain("[REDACTED]");
    });

    it("should redact long hex strings (potential keys)", () => {
      const hex = "a".repeat(32);
      const msg = `Request failed with key ${hex}`;
      const result = sanitizeErrorMessage(msg);
      expect(result).not.toContain(hex);
      expect(result).toContain("[REDACTED]");
    });

    it("should not redact short hex strings", () => {
      const msg = "Error code: abcd1234";
      const result = sanitizeErrorMessage(msg);
      expect(result).toBe("Error code: abcd1234");
    });

    it("should handle multiple secrets in one message", () => {
      const msg =
        "Key sk_live_abc123def456ghi789 failed, also tried rk_live_xyz789abc123def456";
      const result = sanitizeErrorMessage(msg);
      expect(result).not.toContain("sk_live");
      expect(result).not.toContain("rk_live");
      expect((result.match(/\[REDACTED\]/g) || []).length).toBeGreaterThanOrEqual(2);
    });

    it("should truncate messages exceeding 500 characters", () => {
      const msg = "Error: " + "x".repeat(600);
      const result = sanitizeErrorMessage(msg);
      expect(result.length).toBeLessThanOrEqual(520); // 500 + "... (truncated)"
      expect(result).toContain("... (truncated)");
    });

    it("should not truncate messages at exactly 500 characters", () => {
      // Use non-hex characters so the hex-redaction pattern doesn't match
      const msg = "Error message: " + "x".repeat(485);
      const result = sanitizeErrorMessage(msg);
      expect(result).toBe(msg);
      expect(result).not.toContain("truncated");
    });

    it("should handle empty string", () => {
      expect(sanitizeErrorMessage("")).toBe("");
    });

    it("should redact generic API key patterns", () => {
      // The pattern matches: (api|key|token|secret|password|auth)[_-]?[a-zA-Z0-9]{20,}
      // "apiABCDEFGHIJKLMNOPQRSTUVWXYZ" matches "api" followed by 20+ alphanumeric
      const msg = "Failed: apiABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const result = sanitizeErrorMessage(msg);
      expect(result).toContain("[REDACTED]");
    });

    it("should redact token-prefixed strings", () => {
      const msg = "Auth token_abc123def456ghi789jkl012mno";
      const result = sanitizeErrorMessage(msg);
      expect(result).toContain("[REDACTED]");
    });
  });
});
