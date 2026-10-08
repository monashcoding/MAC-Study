// Onboarding preview replays the first sign-in flow for the current browser
// session. While it is on, onboarding state lives in namespaced
// sessionStorage keys, so the account's real progress is never touched.
const PREVIEW_FLAG_KEY = "mac-onboarding-preview";
const PREVIEW_KEY_PREFIX = "mac-onboarding-preview:";

export const isOnboardingPreviewAvailable =
  process.env.NODE_ENV !== "production";

export function isOnboardingPreview() {
  try {
    return window.sessionStorage.getItem(PREVIEW_FLAG_KEY) === "true";
  } catch {
    return false;
  }
}

export function startOnboardingPreview() {
  try {
    clearPreviewKeys();
    window.sessionStorage.setItem(PREVIEW_FLAG_KEY, "true");
  } catch {
    return;
  }

  // A full reload (not router.push) so the preview starts from clean state.
  window.location.assign(new URL("/app", window.location.origin).href);
}

export function endOnboardingPreview() {
  try {
    clearPreviewKeys();
    window.sessionStorage.removeItem(PREVIEW_FLAG_KEY);
  } catch {
    // Reloading still drops any in-memory preview state.
  }

  window.location.reload();
}

// Persistent onboarding state: localStorage normally, session-scoped in preview.
export const onboardingStorage = createOnboardingStorage(
  () => window.localStorage,
);

// Per-session onboarding state, kept apart from real state in preview.
export const onboardingSessionStorage = createOnboardingStorage(
  () => window.sessionStorage,
);

function createOnboardingStorage(getStorage: () => Storage) {
  return {
    get(key: string) {
      try {
        return isOnboardingPreview()
          ? window.sessionStorage.getItem(PREVIEW_KEY_PREFIX + key)
          : getStorage().getItem(key);
      } catch {
        return null;
      }
    },
    set(key: string, value: string) {
      try {
        if (isOnboardingPreview()) {
          window.sessionStorage.setItem(PREVIEW_KEY_PREFIX + key, value);
        } else {
          getStorage().setItem(key, value);
        }
      } catch {
        // Storage can be unavailable; onboarding then just shows again.
      }
    },
  };
}

function clearPreviewKeys() {
  const storage = window.sessionStorage;

  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith(PREVIEW_KEY_PREFIX)) storage.removeItem(key);
  }
}
