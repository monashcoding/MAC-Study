export type PushState =
  | "blocked"
  | "checking"
  | "enabled"
  | "ready"
  | "unsupported";

export type PushStatus = {
  message: string;
  publicKey: string | null;
  state: PushState;
};

export function supportsPushNotifications() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!supportsPushNotifications()) {
    return {
      message: "Unavailable on this device",
      publicKey: null,
      state: "unsupported",
    };
  }

  if (Notification.permission === "denied") {
    return {
      message: "Blocked in browser settings",
      publicKey: null,
      state: "blocked",
    };
  }

  try {
    const response = await fetch("/api/push/public-key", {
      cache: "no-store",
    });

    if (!response.ok) throw new Error("Push key unavailable.");

    const body = (await response.json()) as { publicKey?: string };
    if (!body.publicKey) throw new Error("Push key unavailable.");

    const registrations = await navigator.serviceWorker.getRegistrations();
    let subscription: PushSubscription | null = null;

    for (const registration of registrations) {
      subscription = await registration.pushManager.getSubscription();
      if (subscription) break;
    }

    if (!subscription && Notification.permission === "granted") {
      const registration = await navigator.serviceWorker.register("/sw.js");
      subscription = await registration.pushManager.getSubscription();
    }

    const enabled =
      Boolean(subscription) &&
      pushSubscriptionUsesKey(subscription!, body.publicKey);

    return {
      message: enabled ? "On for this device" : "Off on this device",
      publicKey: body.publicKey,
      state: enabled ? "enabled" : "ready",
    };
  } catch {
    return {
      message: "Unavailable on this device",
      publicKey: null,
      state: "unsupported",
    };
  }
}

export async function enablePushNotifications(publicKey?: string | null) {
  if (!supportsPushNotifications()) {
    throw new Error("Notifications are unavailable on this device.");
  }

  const resolvedKey = publicKey ?? (await getPushStatus()).publicKey;
  if (!resolvedKey) throw new Error("Notifications are unavailable right now.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked in browser settings."
        : "Notification permission was not granted.",
    );
  }

  await navigator.serviceWorker.register("/sw.js");
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (subscription && !pushSubscriptionUsesKey(subscription, resolvedKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }

  subscription ??= await registration.pushManager.subscribe({
    applicationServerKey: urlBase64ToUint8Array(resolvedKey),
    userVisibleOnly: true,
  });

  const response = await fetch("/api/push/subscribe", {
    body: JSON.stringify(subscription.toJSON()),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) throw new Error("Could not save this device.");

  window.dispatchEvent(new Event("mac-push-status-changed"));
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);

  return Uint8Array.from(
    [...rawData].map((character) => character.charCodeAt(0)),
  );
}

function pushSubscriptionUsesKey(
  subscription: PushSubscription,
  publicKey: string,
) {
  const subscriptionKey = subscription.options.applicationServerKey;
  if (!subscriptionKey) return true;

  const expectedKey = urlBase64ToUint8Array(publicKey);
  const currentKey = new Uint8Array(subscriptionKey);

  return (
    currentKey.length === expectedKey.length &&
    currentKey.every((value, index) => value === expectedKey[index])
  );
}
