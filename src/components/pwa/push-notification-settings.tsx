"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PushState = "checking" | "enabled" | "blocked" | "ready" | "unsupported";
type PushStatus = {
  message: string;
  state: PushState;
};

export function PushNotificationSettings() {
  const [pushStatus, setPushStatus] = useState<PushStatus>({
    message: "Checking…",
    state: "checking",
  });
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const { message, state: pushState } = pushStatus;

  useEffect(() => {
    let cancelled = false;

    async function checkPushStatus() {
      await Promise.resolve();

      if (!supportsPush()) {
        if (!cancelled) {
          setPushStatus({
            message: "Unavailable here",
            state: "unsupported",
          });
        }
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) {
          setPushStatus({
            message: "Blocked by browser",
            state: "blocked",
          });
        }
        return;
      }

      try {
        const keyResponse = await fetch("/api/push/public-key", {
          cache: "no-store",
        });

        if (!keyResponse.ok) {
          throw new Error("Push key unavailable.");
        }

        const keyBody = (await keyResponse.json()) as { publicKey?: string };

        if (!keyBody.publicKey) {
          throw new Error("Push key unavailable.");
        }

        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = registration
          ? await registration.pushManager.getSubscription()
          : null;

        if (cancelled) {
          return;
        }

        setVapidPublicKey(keyBody.publicKey);

        if (
          subscription &&
          pushSubscriptionUsesKey(subscription, keyBody.publicKey)
        ) {
          setPushStatus({
            message: "On for this device",
            state: "enabled",
          });
          return;
        }

        setPushStatus({
          message: subscription
            ? "Reconnect this device"
            : "Off on this device",
          state: "ready",
        });
      } catch {
        if (!cancelled) {
          setPushStatus({
            message: "Unavailable here",
            state: "unsupported",
          });
        }
      }
    }

    void checkPushStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  async function enablePush() {
    if (!supportsPush() || !vapidPublicKey) {
      return;
    }

    setPushStatus({ message: "Waiting for permission…", state: "checking" });

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      setPushStatus({
        message:
          permission === "denied"
            ? "Blocked by browser"
            : "Permission not granted",
        state: permission === "denied" ? "blocked" : "ready",
      });
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      let existingSubscription =
        await registration.pushManager.getSubscription();

      if (
        existingSubscription &&
        !pushSubscriptionUsesKey(existingSubscription, vapidPublicKey)
      ) {
        await existingSubscription.unsubscribe();
        existingSubscription = null;
      }

      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          userVisibleOnly: true,
        }));

      const response = await fetch("/api/push/subscribe", {
        body: JSON.stringify(subscription.toJSON()),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Could not save subscription.");
      }

      setPushStatus({
        message: "On for this device",
        state: "enabled",
      });
    } catch {
      setPushStatus({
        message: "Couldn’t enable alerts",
        state: "ready",
      });
    }
  }

  const enabled = pushState === "enabled";

  return (
    <div className="flex items-center justify-between gap-4 rounded-md px-3 py-4 transition hover:bg-[rgb(255_255_255/0.04)]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(255_255_255/0.045)] text-[var(--color-mac-yellow)]">
          {enabled ? (
            <CheckCircle2 aria-hidden size={19} />
          ) : (
            <Bell aria-hidden size={19} />
          )}
        </span>
        <div className="min-w-0">
          <p className="font-medium">Nudge alerts</p>
          <p className="truncate text-sm text-[var(--color-text-muted)]">
            {message}
          </p>
        </div>
      </div>

      <button
        className={cn(
          "mac-focus inline-flex h-9 shrink-0 items-center justify-center rounded-full px-3.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
          enabled
            ? "bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]"
            : "bg-[var(--color-mac-yellow)] text-[#141414]",
        )}
        disabled={
          enabled || pushState === "blocked" || pushState === "unsupported"
        }
        onClick={() => void enablePush()}
        type="button"
      >
        {enabled ? "Enabled" : "Enable"}
      </button>
    </div>
  );
}

function supportsPush() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
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

  if (!subscriptionKey) {
    return false;
  }

  const expectedKey = urlBase64ToUint8Array(publicKey);
  const currentKey = new Uint8Array(subscriptionKey);

  return (
    currentKey.length === expectedKey.length &&
    currentKey.every((value, index) => value === expectedKey[index])
  );
}
