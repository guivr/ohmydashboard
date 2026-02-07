import { describe, it, expect } from "vitest";
import { formatBackfillErrorDetails } from "../backfill-error";

describe("formatBackfillErrorDetails", () => {
  it("returns default lines when error is missing", () => {
    const lines = formatBackfillErrorDetails(null);
    expect(lines[0]).toContain("Unknown");
  });

  it("returns error text when provided", () => {
    const lines = formatBackfillErrorDetails("Rate limit");
    expect(lines[0]).toBe("Rate limit");
  });
});
