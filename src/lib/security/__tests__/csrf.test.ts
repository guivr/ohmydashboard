import { describe, it, expect } from "vitest";
import { validateCsrf } from "../csrf";

/**
 * Helper to create a minimal Request-like object for testing.
 */
function makeRequest(
  method: string,
  headers: Record<string, string> = {}
): Request {
  return new Request("http://localhost:3000/api/test", {
    method,
    headers,
  });
}

describe("CSRF Protection", () => {
  describe("safe methods", () => {
    it("should allow GET requests without any headers", () => {
      const result = validateCsrf(makeRequest("GET"));
      expect(result).toBeNull();
    });

    it("should allow HEAD requests without any headers", () => {
      const result = validateCsrf(makeRequest("HEAD"));
      expect(result).toBeNull();
    });

    it("should allow OPTIONS requests without any headers", () => {
      const result = validateCsrf(makeRequest("OPTIONS"));
      expect(result).toBeNull();
    });
  });

  describe("custom header validation", () => {
    it("should allow POST with x-omd-request header", () => {
      const result = validateCsrf(
        makeRequest("POST", { "x-omd-request": "1" })
      );
      expect(result).toBeNull();
    });

    it("should allow DELETE with x-omd-request header", () => {
      const result = validateCsrf(
        makeRequest("DELETE", { "x-omd-request": "1" })
      );
      expect(result).toBeNull();
    });

    it("should allow PATCH with x-omd-request header", () => {
      const result = validateCsrf(
        makeRequest("PATCH", { "x-omd-request": "1" })
      );
      expect(result).toBeNull();
    });

    it("should reject POST with wrong custom header value", () => {
      const result = validateCsrf(
        makeRequest("POST", {
          "x-omd-request": "wrong",
          origin: "https://evil.com",
        })
      );
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });
  });

  describe("Origin header validation", () => {
    it("should allow POST from localhost origin", () => {
      const result = validateCsrf(
        makeRequest("POST", { origin: "http://localhost:3000" })
      );
      expect(result).toBeNull();
    });

    it("should allow POST from 127.0.0.1 origin", () => {
      const result = validateCsrf(
        makeRequest("POST", { origin: "http://127.0.0.1:3000" })
      );
      expect(result).toBeNull();
    });

    it("should reject POST from external origin", () => {
      const result = validateCsrf(
        makeRequest("POST", { origin: "https://evil.com" })
      );
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it("should reject POST from subdomain of localhost", () => {
      const result = validateCsrf(
        makeRequest("POST", { origin: "https://localhost.evil.com" })
      );
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });
  });

  describe("Referer header validation", () => {
    it("should allow POST with localhost referer", () => {
      const result = validateCsrf(
        makeRequest("POST", { referer: "http://localhost:3000/settings" })
      );
      expect(result).toBeNull();
    });

    it("should allow POST with 127.0.0.1 referer", () => {
      const result = validateCsrf(
        makeRequest("POST", { referer: "http://127.0.0.1:3000/settings" })
      );
      expect(result).toBeNull();
    });

    it("should reject POST with external referer", () => {
      const result = validateCsrf(
        makeRequest("POST", { referer: "https://evil.com/attack" })
      );
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });
  });

  describe("no origin or referer", () => {
    it("should reject POST with no origin, referer, or custom header", () => {
      const result = validateCsrf(makeRequest("POST"));
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it("should reject DELETE with no origin, referer, or custom header", () => {
      const result = validateCsrf(makeRequest("DELETE"));
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it("should allow POST with custom header but no origin or referer (e.g. curl)", () => {
      const result = validateCsrf(
        makeRequest("POST", { "x-omd-request": "1" })
      );
      expect(result).toBeNull();
    });

    it("should allow DELETE with custom header but no origin or referer", () => {
      const result = validateCsrf(
        makeRequest("DELETE", { "x-omd-request": "1" })
      );
      expect(result).toBeNull();
    });
  });

  describe("error response format", () => {
    it("should return JSON error with correct message", async () => {
      const result = validateCsrf(
        makeRequest("POST", { origin: "https://evil.com" })
      );
      expect(result).not.toBeNull();
      const body = await result!.json();
      expect(body.error).toBe("Forbidden: cross-origin request blocked");
    });
  });
});
