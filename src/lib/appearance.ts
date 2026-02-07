export type Appearance = "rounded" | "modern" | "business";

export const APPEARANCE_STORAGE_KEY = "ohmydashboard.appearance";
const LEGACY_FONT_STORAGE_KEY = "ohmydashboard.font";

export const normalizeAppearance = (value?: string | null): Appearance => {
  if (value === "rounded" || value === "modern" || value === "business") {
    return value;
  }
  return "modern";
};

export const applyAppearanceToRoot = (root: HTMLElement, appearance: Appearance) => {
  root.classList.remove(
    "appearance-rounded",
    "appearance-modern",
    "appearance-business"
  );
  root.classList.add(`appearance-${appearance}`);
};

export const getAppearanceFromRoot = (root: HTMLElement): Appearance => {
  if (root.classList.contains("appearance-rounded")) return "rounded";
  if (root.classList.contains("appearance-business")) return "business";
  return "modern";
};

export const migrateLegacyFontPreference = () => {
  const storedAppearance = localStorage.getItem(APPEARANCE_STORAGE_KEY);
  if (storedAppearance) return;
  const legacy = localStorage.getItem(LEGACY_FONT_STORAGE_KEY);
  if (!legacy) return;
  const next = legacy === "open-runde" ? "rounded" : "modern";
  localStorage.setItem(APPEARANCE_STORAGE_KEY, next);
};

export const migrateLegacyTerminalPreference = () => {
  const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY);
  if (stored !== "terminal") return;
  localStorage.setItem(APPEARANCE_STORAGE_KEY, "modern");
};
