/** The appearance choices Settings offers, and how each is read and changed. */
import {
  choiceKeys,
  storedChoice,
  type Choice,
  type SetPart,
} from "./appearance.ts";

function apply(choice: Choice, value: string) {
  document.documentElement.dataset[choice] = value;
  try {
    localStorage.setItem(choiceKeys[choice], value);
  } catch {
    /* Appearance still applies without persistent browser storage. */
  }
}

export type Theme = "system" | "light" | "dark";
export function readTheme(): Theme {
  const value = storedChoice("theme");
  return value === "dark" || value === "light" ? value : "system";
}
export const applyTheme = (value: Theme) => apply("theme", value);

/** The side of the phone's add button: right for the right thumb, left for the left. */
export type Hand = "right" | "left";
export const readHand = (): Hand =>
  storedChoice("hand") === "left" ? "left" : "right";
export const applyHand = (value: Hand) => apply("hand", value);

type Option = { readonly id: string; readonly label: string };
/** One part of a set; styles/appearance-sets.css holds a block for each option. */
function part<const Options extends readonly [Option, ...Option[]]>(
  name: SetPart,
  options: Options,
) {
  type Id = Options[number]["id"];
  return {
    options,
    /** The stored option, or the default when nothing valid is stored. */
    read(): Id {
      const stored = storedChoice(name);
      return options.find(({ id }) => id === stored)?.id ?? options[0].id;
    },
    apply: (id: Id) => apply(name, id),
  };
}

/** The first option of each part is the default, named "astra". */
export const lightPalette = part("light", [
  { id: "astra", label: "Astra" },
  { id: "paper", label: "Papier" },
  { id: "sage", label: "Szałwia" },
  { id: "chalk", label: "Kreda" },
]);
/** Chosen separately from the light palette; the theme decides which shows. */
export const darkPalette = part("dark", [
  { id: "astra", label: "Astra" },
  { id: "ink", label: "Atrament" },
  { id: "cocoa", label: "Kakao" },
  { id: "black", label: "Czerń" },
]);
export const character = part("character", [
  { id: "astra", label: "Astra" },
  { id: "soft", label: "Miękki" },
  { id: "editorial", label: "Redakcyjny" },
  { id: "technical", label: "Techniczny" },
]);
