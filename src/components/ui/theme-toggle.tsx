"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  applyThemeToRoot,
  normalizeTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
    setTheme(stored);
  }, []);

  useEffect(() => {
    applyThemeToRoot(document.documentElement, theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const isDark = theme === "dark";
  const label = isDark ? "Light mode" : "Dark mode";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("w-full justify-start gap-2", className)}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
    >
      {isDark ? (
        <Sun className="h-3.5 w-3.5" />
      ) : (
        <Moon className="h-3.5 w-3.5" />
      )}
      <span>{label}</span>
    </Button>
  );
}
