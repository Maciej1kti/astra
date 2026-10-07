/**
 * Browser-local appearance, as the first load needs it: every choice is kept
 * under its own key and shown as an attribute of the root element. Settings
 * reads and changes the choices through appearance-choices.ts.
 */
export const choiceKeys = {
  theme: "local-projects-theme",
  hand: "astra-hand:v1",
  light: "astra-light:v1",
  dark: "astra-dark:v1",
  character: "astra-character:v1",
} as const;
export type Choice = keyof typeof choiceKeys;
/** The parts of a set: one palette for each scheme, and a character. */
export type SetPart = Exclude<Choice, "theme" | "hand">;

export function storedChoice(choice: Choice) {
  try {
    return localStorage.getItem(choiceKeys[choice]);
  } catch {
    return null;
  }
}

function show(choice: Choice) {
  const value = storedChoice(choice);
  if (value) document.documentElement.dataset[choice] = value;
  return value;
}
/**
 * Applies the stored appearance. A value no stylesheet knows changes nothing.
 * Every part of a set defaults to "astra", which styles/tokens.css carries;
 * any other needs the sets stylesheet, so the result settles once that loaded.
 */
export function restoreAppearance() {
  show("theme");
  show("hand");
  const parts: SetPart[] = ["light", "dark", "character"];
  return parts.filter((part) => (show(part) ?? "astra") !== "astra").length
    ? import("../../styles/appearance-sets.css")
    : Promise.resolve();
}
