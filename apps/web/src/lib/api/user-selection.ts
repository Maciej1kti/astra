import { isUuid } from "./uuid.ts";

const key = "astra-user";
const validId = (value: string | null): value is string => isUuid(value, 4);

function storedUser(): string {
  try {
    const tab = sessionStorage.getItem(key);
    if (tab === "") return "";
    if (validId(tab)) return tab;
    const browser = localStorage.getItem(key);
    if (validId(browser)) return browser;
  } catch {
    // Storage may be unavailable; the existing default workspace still opens.
  }
  return "";
}

// A tab keeps its own user until explicitly reloaded. Another tab's selection
// must never redirect a draft, queued read or command to a different workspace.
const initialUser = storedUser();
export function selectedUserId() {
  return initialUser;
}

export function pinUserToTab(id: string) {
  if (!validId(id)) return;
  try {
    sessionStorage.setItem(key, id);
  } catch {
    // The loaded tab still has an immutable request scope without storage.
  }
}

export function rememberUser(id: string) {
  if (!validId(id)) throw new Error("Nieprawidłowy użytkownik.");
  try {
    sessionStorage.setItem(key, id);
  } catch {
    throw new Error(
      "Pamięć przeglądarki jest niedostępna. Włącz ją, aby zmieniać użytkowników.",
    );
  }
  try {
    localStorage.setItem(key, id);
  } catch {
    // Tab storage is sufficient for switching and reloading this workspace.
  }
}

export function rememberDefaultUser() {
  try {
    sessionStorage.setItem(key, "");
  } catch {
    throw new Error(
      "Pamięć przeglądarki jest niedostępna. Włącz ją, aby zmieniać użytkowników.",
    );
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // The explicit tab selection takes precedence over the browser default.
  }
}
