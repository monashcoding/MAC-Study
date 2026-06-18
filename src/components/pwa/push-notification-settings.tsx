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
    message: "Checking this device",
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
            message: "Not available on this browser",
            state: "unsupported",
          });
        }
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) {
          setPushStatus({
            message: "Blocked in browser settings",
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
            message: "Lock-screen nudges enabled",
            state: "enabled",
          });
          return;
        }

        setPushStatus({
          message: subscription
            ? "Push key changed - enable again"
            : "Enable lock-screen nudges",
          state: "ready",
        });
      } catch {
        if (!cancelled) {
          setPushStatus({
            message: "Push keys are not configured",
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

    setPushStatus({ message: "Opening permission prompt", state: "checking" });

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      setPushStatus({
        message:
          permission === "denied"
            ? "Blocked in browser settings"
            : "Permission not enabled",
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
        message: "Lock-screen nudges enabled",
        state: "enabled",
      });
    } catch {
      setPushStatus({
        message: "Could not enable on this device",
        state: "ready",
      });
    }
  }

  const enabled = pushState === "enabled";

  return (
    <div className="flex items-center justify-between gap-4 rounded-md bg-[rgb(255_255_255/0.035)] p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface-raised)] text-[var(--color-mac-yellow)]">
          {enabled ? (
            <CheckCircle2 aria-hidden size={19} />
          ) : (
            <Bell aria-hidden size={19} />
          )}
        </span>
        <div className="min-w-0">
          <p className="font-medium">Nudges</p>
          <p className="truncate text-sm text-[var(--color-text-muted)]">
            {message}
          </p>
        </div>
      </div>

      <button
        className={cn(
          "mac-focus inline-flex h-9 shrink-0 items-center justify-center rounded-md px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
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
