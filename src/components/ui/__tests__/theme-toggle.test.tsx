import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeToggle } from "../theme-toggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("applies the stored theme on mount", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    render(<ThemeToggle />);

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });

    expect(screen.getByRole("button", { name: /dark mode/i })).toBeInTheDocument();
  });

  it("toggles to light mode and persists the preference", async () => {
    render(<ThemeToggle />);

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: /light mode/i }));

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});
