"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Hand,
  MessagesSquare,
  UserRoundPlus,
} from "lucide-react";
import {
  fetchRemoteNotificationPreferences,
  updateRemoteNotificationPreferences,
  type RemoteNotificationPreferences,
} from "@/lib/supabase/app-data";
import {
  enablePushNotifications,
  getPushStatus,
  type PushStatus,
} from "@/lib/push/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const defaultPreferences: RemoteNotificationPreferences = {
  friendNotifications: true,
  nudgeNotifications: true,
  otherNotifications: true,
};

export function PushNotificationSettings() {
  const [pushStatus, setPushStatus] = useState<PushStatus>({
    message: "Checking…",
    publicKey: null,
    state: "checking",
  });
  const [preferences, setPreferences] =
    useState<RemoteNotificationPreferences>(defaultPreferences);
  const [savingKey, setSavingKey] = useState<
    keyof RemoteNotificationPreferences | null
  >(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refreshStatus() {
      const status = await getPushStatus();
      if (!cancelled) setPushStatus(status);
    }

    async function load() {
      await refreshStatus();
      try {
        const supabase = createSupabaseBrowserClient();
        const nextPreferences =
          await fetchRemoteNotificationPreferences(supabase);
        if (!cancelled) setPreferences(nextPreferences);
      } catch {
        // Keep safe defaults for demo mode or before the migration is applied.
      }
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refreshStatus();
    }

    void load();
    window.addEventListener("focus", refreshStatus);
    window.addEventListener("pageshow", refreshStatus);
    window.addEventListener("mac-push-status-changed", refreshStatus);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshStatus);
      window.removeEventListener("pageshow", refreshStatus);
      window.removeEventListener("mac-push-status-changed", refreshStatus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  async function enablePush() {
    setFeedback(null);
    setPushStatus((current) => ({
      ...current,
      message: "Waiting for permission…",
      state: "checking",
    }));

    try {
      await enablePushNotifications(pushStatus.publicKey);
      setPushStatus({
        message: "On for this device",
        publicKey: pushStatus.publicKey,
        state: "enabled",
      });
    } catch (error) {
      setFeedback(getNotificationErrorMessage(error));
      setPushStatus(await getPushStatus());
    }
  }

  function handleDeviceAction() {
    if (pushStatus.state === "blocked") {
      setFeedback(
        "Open this site in your browser settings, allow Notifications, then reload.",
      );
      return;
    }

    if (pushStatus.state === "unsupported") {
      setFeedback(
        "Push alerts need a supported browser or the installed mobile app.",
      );
      return;
    }

    void enablePush();
  }

  async function togglePreference(key: keyof RemoteNotificationPreferences) {
    const previous = preferences;
    const next = { ...previous, [key]: !previous[key] };
    setPreferences(next);
    setSavingKey(key);
    setFeedback(null);

    try {
      const supabase = createSupabaseBrowserClient();
      await updateRemoteNotificationPreferences({
        preferences: next,
        supabase,
      });
      window.dispatchEvent(
        new CustomEvent("mac-notification-preferences-changed", {
          detail: next,
        }),
      );
    } catch {
      setPreferences(previous);
      setFeedback("Could not save notification settings.");
    } finally {
      setSavingKey(null);
    }
  }

  const enabled = pushStatus.state === "enabled";

  return (
    <div className="px-3 py-4">
      <div className="mb-3">
        <p className="font-semibold">Notifications</p>
      </div>

      <div>
        <div className="flex items-center justify-between gap-4 py-2">
          <SettingIcon>
            {enabled ? (
              <CheckCircle2 aria-hidden size={18} />
            ) : (
              <Bell aria-hidden size={18} />
            )}
          </SettingIcon>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Device alerts</p>
            <p className="text-sm leading-5 text-[var(--color-text-muted)]">
              {pushStatus.message}
            </p>
          </div>
          <button
            aria-busy={pushStatus.state === "checking"}
            className={cn(
              "mac-focus inline-flex h-11 shrink-0 items-center justify-center rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
              enabled
                ? "bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]"
                : "bg-[var(--color-mac-yellow)] text-[#141414]",
            )}
            disabled={enabled || pushStatus.state === "checking"}
            onClick={handleDeviceAction}
            type="button"
          >
            {getDeviceActionLabel(pushStatus.state)}
          </button>
        </div>

        {enabled ? (
          <div className="mt-2 border-t border-[var(--color-border)]">
            <PreferenceRow
              checked={preferences.friendNotifications}
              disabled={savingKey !== null}
              icon={<UserRoundPlus aria-hidden size={18} />}
              label="Friend requests"
              onChange={() => void togglePreference("friendNotifications")}
            />
            <PreferenceRow
              checked={preferences.nudgeNotifications}
              disabled={savingKey !== null}
              icon={<Hand aria-hidden size={18} />}
              label="Nudges"
              onChange={() => void togglePreference("nudgeNotifications")}
            />
            <PreferenceRow
              checked={preferences.otherNotifications}
              disabled={savingKey !== null}
              icon={<MessagesSquare aria-hidden size={18} />}
              label="Group messages & invites"
              onChange={() => void togglePreference("otherNotifications")}
            />
          </div>
        ) : null}
      </div>

      {feedback ? (
        <p className="mt-2 text-sm text-[var(--color-danger)]" role="status">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}

function PreferenceRow({
  checked,
  disabled,
  icon,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onChange: () => void;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-[var(--color-border)] px-3 last:border-b-0">
      <SettingIcon>{icon}</SettingIcon>
      <span className="min-w-0 flex-1 font-medium">{label}</span>
      <button
        aria-checked={checked}
        aria-label={`${label} notifications`}
        className={cn(
          "mac-focus relative h-8 w-14 shrink-0 rounded-full border transition disabled:opacity-50",
          checked
            ? "border-[var(--color-mac-yellow)] bg-[var(--color-mac-yellow)]"
            : "border-[var(--color-border)] bg-[var(--color-surface-raised)]",
        )}
        disabled={disabled}
        onClick={onChange}
        role="switch"
        type="button"
      >
        <span
          className={cn(
            "absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-6" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

function SettingIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(255_255_255/0.045)] text-[var(--color-mac-yellow)]">
      {children}
    </span>
  );
}

function getDeviceActionLabel(state: PushStatus["state"]) {
  if (state === "enabled") return "Enabled";
  if (state === "blocked") return "Fix";
  if (state === "unsupported") return "Why?";
  if (state === "checking") return "Checking…";

  return "Enable";
}

function getNotificationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/service worker|pushmanager|subscribe/i.test(message)) {
    return "Notifications are not ready yet. Reload the app and try again.";
  }

  if (/blocked|denied/i.test(message)) {
    return "Notifications are blocked. Allow them in your browser settings.";
  }

  return "Could not enable notifications. Try again.";
}
