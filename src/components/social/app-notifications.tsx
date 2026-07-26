"use client";

import { useEffect, useState } from "react";
import { UserRoundPlus, Users, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  markRemoteAppNotificationRead,
  subscribeToRemoteAppNotifications,
  type RemoteAppNotification,
} from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AppNotifications({ userId }: { userId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [notifications, setNotifications] = useState<RemoteAppNotification[]>(
    [],
  );

  useEffect(() => {
    try {
      const supabase = createSupabaseBrowserClient();

      return subscribeToRemoteAppNotifications(
        supabase,
        userId,
        (notification) => {
          setNotifications((current) => [notification, ...current].slice(0, 3));
        },
      );
    } catch {
      return;
    }
  }, [userId]);

  function openNotification(notification: RemoteAppNotification) {
    setNotifications((current) =>
      current.filter((item) => item.id !== notification.id),
    );

    try {
      const supabase = createSupabaseBrowserClient();
      void markRemoteAppNotificationRead({
        notificationId: notification.id,
        supabase,
      });
    } catch {
      // The destination should still open if marking as read fails.
    }

    if (pathname === "/app/friends" && notification.type === "friend_request") {
      window.dispatchEvent(new Event("mac-open-friend-requests"));
      return;
    }

    if (
      pathname === "/app/groups" &&
      notification.title === "Group invitation"
    ) {
      window.dispatchEvent(new Event("mac-open-group-requests"));
      return;
    }

    router.push(
      notification.title === "Group invitation"
        ? "/app/groups?tab=requests"
        : notification.type === "friend_request"
          ? "/app/friends?tab=requests"
          : "/app/friends",
    );
  }

  if (!notifications.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 top-[calc(var(--safe-area-top)+0.75rem)] z-[81] mx-auto grid max-w-md gap-2">
      {notifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onDismiss={() =>
            setNotifications((current) =>
              current.filter((item) => item.id !== notification.id),
            )
          }
          onOpen={() => openNotification(notification)}
        />
      ))}
    </div>
  );
}

function NotificationToast({
  notification,
  onDismiss,
  onOpen,
}: {
  notification: RemoteAppNotification;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 6500);
    return () => window.clearTimeout(timeout);
  }, [notification.id, onDismiss]);

  return (
    <div className="pointer-events-auto grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[rgb(255_227_48/0.28)] bg-[rgb(23_23_23/0.97)] p-3 shadow-[0_18px_42px_rgb(0_0_0/0.38)] backdrop-blur">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-mac-yellow)] text-[#141414]">
        {notification.title === "Group invitation" ? (
          <Users aria-hidden size={18} />
        ) : (
          <UserRoundPlus aria-hidden size={18} />
        )}
      </span>
      <button className="min-w-0 text-left" onClick={onOpen} type="button">
        <span className="block truncate text-sm font-semibold">
          {notification.title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-[var(--color-text-muted)]">
          {notification.body}
        </span>
      </button>
      <button
        className="mac-focus inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-text-muted)]"
        onClick={onDismiss}
        type="button"
      >
        <X aria-hidden size={15} />
        <span className="sr-only">Dismiss notification</span>
      </button>
    </div>
  );
}
