export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "ohmydashboard.theme";

export const normalizeTheme = (value?: string | null): Theme => {
  return value === "light" ? "light" : "dark";
};

export const applyThemeToRoot = (root: HTMLElement, theme: Theme) => {
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  root.style.colorScheme = theme;
};
