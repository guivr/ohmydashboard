import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatNumber,
  formatPercentage,
  formatDate,
  percentChange,
} from "../format";

describe("Format Utilities", () => {
  describe("formatCurrency", () => {
    it("should format USD currency", () => {
      expect(formatCurrency(1234.56, "USD")).toBe("$1,234.56");
    });

    it("should format currency with no decimals when whole number", () => {
      expect(formatCurrency(1000, "USD")).toBe("$1,000");
    });

    it("should format zero", () => {
      expect(formatCurrency(0, "USD")).toBe("$0");
    });

    it("should format large numbers", () => {
      expect(formatCurrency(1234567.89, "USD")).toBe("$1,234,567.89");
    });

    it("should default to USD", () => {
      expect(formatCurrency(100)).toBe("$100");
    });

    it("should format EUR currency", () => {
      const result = formatCurrency(100, "EUR");
      // EUR formatting may vary by locale, just check it contains the number
      expect(result).toContain("100");
    });
  });

  describe("formatNumber", () => {
    it("should format with commas", () => {
      expect(formatNumber(1234567)).toBe("1,234,567");
    });

    it("should format small numbers", () => {
      expect(formatNumber(42)).toBe("42");
    });

    it("should format zero", () => {
      expect(formatNumber(0)).toBe("0");
    });
  });

  describe("formatPercentage", () => {
    it("should format positive percentage with + sign", () => {
      expect(formatPercentage(12.5)).toBe("+12.5%");
    });

    it("should format negative percentage", () => {
      expect(formatPercentage(-5.3)).toBe("-5.3%");
    });

    it("should format zero", () => {
      expect(formatPercentage(0)).toBe("+0.0%");
    });
  });

  describe("formatDate", () => {
    it("should format date string to readable format", () => {
      const result = formatDate("2026-02-07");
      expect(result).toBe("Feb 7");
    });

    it("should format different months", () => {
      expect(formatDate("2026-01-15")).toBe("Jan 15");
      expect(formatDate("2026-12-25")).toBe("Dec 25");
    });
  });

  describe("percentChange", () => {
    it("should calculate positive change", () => {
      expect(percentChange(150, 100)).toBe(50);
    });

    it("should calculate negative change", () => {
      expect(percentChange(75, 100)).toBe(-25);
    });

    it("should handle zero previous value", () => {
      expect(percentChange(100, 0)).toBe(100);
    });

    it("should handle zero current and zero previous", () => {
      expect(percentChange(0, 0)).toBe(0);
    });

    it("should handle equal values", () => {
      expect(percentChange(100, 100)).toBe(0);
    });
  });
});
