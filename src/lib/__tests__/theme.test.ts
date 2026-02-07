import { describe, it, expect } from "vitest";
import { normalizeTheme, applyThemeToRoot } from "../theme";

describe("theme helpers", () => {
  it("normalizes invalid theme values to dark", () => {
    expect(normalizeTheme("")).toBe("dark");
    expect(normalizeTheme("system")).toBe("dark");
  });

  it("keeps light and dark values", () => {
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("dark")).toBe("dark");
  });

  it("applies the dark class to root", () => {
    const root = document.createElement("html");
    applyThemeToRoot(root, "dark");
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("removes the dark class for light", () => {
    const root = document.createElement("html");
    root.classList.add("dark");
    applyThemeToRoot(root, "light");
    expect(root.classList.contains("dark")).toBe(false);
  });
});
