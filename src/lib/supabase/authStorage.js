const PERSISTENCE_KEY = "alaga.auth.remember";

function getBrowserStorage(name) {
  if (typeof window === "undefined") return null;
  return window[name];
}

function isRemembered() {
  return getBrowserStorage("localStorage")?.getItem(PERSISTENCE_KEY) === "1";
}

function storagePair() {
  const local = getBrowserStorage("localStorage");
  const session = getBrowserStorage("sessionStorage");
  return isRemembered() ? [local, session] : [session, local];
}

export const authStorage = {
  getItem(key) {
    const [primary, fallback] = storagePair();
    return primary?.getItem(key) ?? fallback?.getItem(key) ?? null;
  },
  setItem(key, value) {
    const [target, stale] = storagePair();
    target?.setItem(key, value);
    stale?.removeItem(key);
  },
  removeItem(key) {
    getBrowserStorage("localStorage")?.removeItem(key);
    getBrowserStorage("sessionStorage")?.removeItem(key);
  },
};

export function setAuthPersistence(remember) {
  const local = getBrowserStorage("localStorage");
  if (remember) local?.setItem(PERSISTENCE_KEY, "1");
  else local?.removeItem(PERSISTENCE_KEY);
}

export function clearAuthStorage() {
  for (const storageName of ["localStorage", "sessionStorage"]) {
    const storage = getBrowserStorage(storageName);
    if (!storage) continue;

    const authKeys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith("sb-") && key.includes("-auth-token")) {
        authKeys.push(key);
      }
    }
    authKeys.forEach((key) => storage.removeItem(key));
  }

  getBrowserStorage("localStorage")?.removeItem(PERSISTENCE_KEY);
}
