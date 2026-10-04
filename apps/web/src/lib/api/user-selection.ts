const key = "astra-user";
const validId = (value: string | null): value is string =>
  !!value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );

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
  if (!validId(id)) throw new Error("Invalid user.");
  try {
    sessionStorage.setItem(key, id);
  } catch {
    throw new Error(
      "Browser storage is unavailable. Enable it to switch users.",
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
      "Browser storage is unavailable. Enable it to switch users.",
    );
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // The explicit tab selection takes precedence over the browser default.
  }
}
