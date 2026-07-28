import { LogOut, PencilLine, UserRound } from "lucide-react";
import { PushNotificationSettings } from "@/components/pwa/push-notification-settings";

export function ProfileDashboard({
  displayName,
  username,
}: {
  displayName: string;
  username: string | null;
}) {
  const handle = username ? `@${username}` : "@set_username";
  const initials = getInitials(displayName);

  return (
    <div className="space-y-6 lg:grid lg:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.28fr)] lg:items-start lg:gap-6 lg:space-y-0">
      <section className="overflow-hidden rounded-lg border border-[rgb(255_255_255/0.07)] bg-[radial-gradient(circle_at_top_right,rgb(255_227_48/0.11),transparent_45%),rgb(255_255_255/0.025)] p-4 lg:p-5">
        <div className="flex items-center gap-3 lg:items-start">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-mac-yellow)] text-[#141414] lg:h-16 lg:w-16">
            {initials ? (
              <span className="font-semibold lg:text-xl">{initials}</span>
            ) : (
              <UserRound aria-hidden size={28} />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{displayName}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{handle}</p>
          </div>
          <a
            className="mac-focus ml-auto inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-text-muted)] transition hover:border-[rgb(255_255_255/0.2)] hover:bg-[rgb(255_255_255/0.04)] hover:text-[var(--color-text)]"
            href="/auth/profile?edit=1&next=/app/profile"
          >
            <PencilLine aria-hidden size={16} />
            <span>Edit profile</span>
          </a>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-[rgb(255_255_255/0.07)] bg-[rgb(255_255_255/0.022)]">
        <div className="px-5 pb-3 pt-5">
          <h2 className="text-lg font-semibold">Settings</h2>
        </div>
        <div className="divide-y divide-[rgb(255_255_255/0.07)] px-2 pb-2">
          <PushNotificationSettings />
          <a
            className="mac-focus flex items-center justify-between gap-4 rounded-md px-3 py-4 transition hover:bg-[rgb(255_255_255/0.04)]"
            href="/auth/logout"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgb(255_255_255/0.045)] text-[var(--color-mac-yellow)]">
                <LogOut aria-hidden size={19} />
              </span>
              <span className="font-medium">Sign out</span>
            </span>
          </a>
        </div>
      </section>
    </div>
  );
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
