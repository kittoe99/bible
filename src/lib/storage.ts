// Storage can be unavailable in private browsing or when the device is full.
export function readLocal<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function removeLocal(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* No persisted draft to remove. */
  }
}
