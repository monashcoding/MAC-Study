"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import {
  fetchRemoteNotificationPreferences,
  subscribeToRemoteNudges,
  type RemoteNotificationPreferences,
  type RemoteNudgeNotification,
} from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function NudgeNotifications({ userId }: { userId: string }) {
  const [nudges, setNudges] = useState<RemoteNudgeNotification[]>([]);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;

    try {
      const supabase = createSupabaseBrowserClient();

      void fetchRemoteNotificationPreferences(supabase)
        .then((preferences) => {
          if (!cancelled) setEnabled(preferences.nudgeNotifications);
        })
        .catch(() => undefined);
    } catch {
      return;
    }

    function handlePreferenceChange(event: Event) {
      const preferences = (event as CustomEvent<RemoteNotificationPreferences>)
        .detail;
      setEnabled(preferences.nudgeNotifications);
      if (!preferences.nudgeNotifications) setNudges([]);
    }

    window.addEventListener(
      "mac-notification-preferences-changed",
      handlePreferenceChange,
    );

    return () => {
      cancelled = true;
      window.removeEventListener(
        "mac-notification-preferences-changed",
        handlePreferenceChange,
      );
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    try {
      const supabase = createSupabaseBrowserClient();
      return subscribeToRemoteNudges(supabase, userId, (nudge) => {
        setNudges((current) => [nudge, ...current].slice(0, 3));
      });
    } catch {
      return;
    }
  }, [enabled, userId]);

  if (!nudges.length) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-3 top-[calc(var(--safe-area-top)+0.75rem)] z-[80] mx-auto grid max-w-md gap-2">
      {nudges.map((nudge) => (
        <NudgeToast
          key={nudge.id}
          nudge={nudge}
          onDismiss={() =>
            setNudges((current) =>
              current.filter((item) => item.id !== nudge.id),
            )
          }
        />
      ))}
    </div>
  );
}

function NudgeToast({
  nudge,
  onDismiss,
}: {
  nudge: RemoteNudgeNotification;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 5200);

    return () => window.clearTimeout(timeout);
  }, [nudge.id, onDismiss]);

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-[rgb(255_227_48/0.35)] bg-[rgb(23_23_23/0.96)] px-3 py-2 text-sm shadow-[0_18px_42px_rgb(0_0_0/0.34)] backdrop-blur">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-mac-yellow)] text-[#141414]">
        <BellRing aria-hidden size={15} />
      </span>
      <p className="min-w-0 flex-1 truncate font-medium">
        {renderNudgeMessage(nudge.message)}
      </p>
      <button
        className="mac-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)]"
        onClick={onDismiss}
        type="button"
      >
        <X aria-hidden size={15} />
        <span className="sr-only">Dismiss nudge</span>
      </button>
    </div>
  );
}

function renderNudgeMessage(message: string) {
  const suffix = " woke you up!";

  if (!message.endsWith(suffix)) {
    return message;
  }

  return (
    <>
      <strong>{message.slice(0, -suffix.length)}</strong>
      {suffix}
    </>
  );
}
