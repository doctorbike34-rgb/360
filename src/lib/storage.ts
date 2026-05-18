/**
 * Safe localStorage wrapper — prevents crashes in iOS Safari private mode
 * and other environments where storage APIs may be blocked.
 */

const PREFIX = 'db360_v1_';

function getStorage(): Storage | null {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return localStorage;
  } catch {
    return null;
  }
}

const storage = getStorage();

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return storage?.getItem(PREFIX + key) ?? null;
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      storage?.setItem(PREFIX + key, value);
    } catch {
      // Silently fail — storage unavailable or quota exceeded
    }
  },

  removeItem(key: string): void {
    try {
      storage?.removeItem(PREFIX + key);
    } catch {
      // Silently fail
    }
  },

  /** Direct access to raw storage for migrations — use sparingly */
  raw: storage,
};
