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

/** The side of the phone's add button: right for the right thumb, left for the left. */
export type Hand = "right" | "left";
export function readHand(): Hand {
  try {
    return localStorage.getItem("astra-hand:v1") === "left" ? "left" : "right";
  } catch {
    return "right";
  }
}
export function applyHand(value: Hand) {
  document.documentElement.dataset.hand = value;
  try {
    localStorage.setItem("astra-hand:v1", value);
  } catch {
    /* The side still applies without persistent browser storage. */
  }
}
