"use client";

import { useEffect } from "react";
import {
  applyAppearanceToRoot,
  APPEARANCE_STORAGE_KEY,
  getAppearanceFromRoot,
  migrateLegacyFontPreference,
  migrateLegacyTerminalPreference,
  normalizeAppearance,
} from "@/lib/appearance";

export function AppearanceInit() {
  useEffect(() => {
    migrateLegacyFontPreference();
    migrateLegacyTerminalPreference();
    const storedRaw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    const stored = storedRaw
      ? normalizeAppearance(storedRaw)
      : getAppearanceFromRoot(document.documentElement);
    applyAppearanceToRoot(document.documentElement, stored);
  }, []);

  return null;
}
