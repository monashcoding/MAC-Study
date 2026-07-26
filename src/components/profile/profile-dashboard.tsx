import {
  ChevronRight,
  LogOut,
  PencilLine,
  ShieldCheck,
  UserRound,
} from "lucide-react";
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
        <span className="inline-flex rounded-full border border-[rgb(255_227_48/0.24)] bg-[rgb(255_227_48/0.08)] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-mac-yellow)]">
          Account
        </span>
        <div className="mt-4 flex items-center gap-3 lg:mt-6 lg:flex-col lg:items-start">
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
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-[rgb(255_255_255/0.07)] bg-[rgb(255_255_255/0.022)]">
        <div className="px-5 pb-3 pt-5">
          <h2 className="text-lg font-semibold">Settings</h2>
        </div>
        <div className="divide-y divide-[rgb(255_255_255/0.07)] px-2 pb-2">
          <a
            className="mac-focus flex items-center justify-between gap-4 rounded-md px-3 py-4 transition hover:bg-[rgb(255_255_255/0.04)]"
            href="/auth/profile?edit=1&next=/app/profile"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgb(255_255_255/0.045)] text-[var(--color-mac-yellow)]">
                <PencilLine aria-hidden size={19} />
              </span>
              <span className="font-medium">Edit profile</span>
            </span>
            <ChevronRight
              aria-hidden
              className="text-[var(--color-text-muted)]"
              size={18}
            />
          </a>
          <PushNotificationSettings />
          <SettingRow
            icon={<ShieldCheck aria-hidden size={19} />}
            title="Account access"
            value="Invite only"
          />
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

function SettingRow({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgb(255_255_255/0.045)] text-[var(--color-mac-yellow)]">
          {icon}
        </span>
        <p className="font-medium">{title}</p>
      </div>
      <p className="text-sm text-[var(--color-text-muted)]">{value}</p>
    </div>
  );
}
