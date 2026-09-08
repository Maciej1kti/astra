export type Theme = "system" | "light" | "dark";
export function readTheme(): Theme {
  try {
    const value = localStorage.getItem("local-projects-theme");
    return value === "dark" || value === "light" ? value : "system";
  } catch {
    return "system";
  }
}
export function applyTheme(value: Theme) {
  document.documentElement.dataset.theme = value;
  try {
    localStorage.setItem("local-projects-theme", value);
  } catch {
    /* Appearance still applies without persistent browser storage. */
  }
}
