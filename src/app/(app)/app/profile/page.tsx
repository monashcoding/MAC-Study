import { Bell, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { getAppAuthState } from "@/lib/auth/app-auth";

export default async function ProfilePage() {
  const authState = await getAppAuthState("/app/profile");
  const profile = authState.mode === "authenticated" ? authState.profile : null;
  const displayName = profile?.display_name?.trim() || "MAC member";
  const handle = profile?.username ? `@${profile.username}` : "@set_username";
  const initials = getInitials(displayName);

  return (
    <div className="space-y-6">
      <section className="rounded-md bg-[rgb(255_255_255/0.035)] p-4">
        <div>
          <h2 className="font-semibold">Account</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Signed-in MAC study profile
          </p>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414]">
            {initials ? (
              <span className="text-lg font-semibold">{initials}</span>
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

      <section className="space-y-2">
        <div className="rounded-md bg-[rgb(255_255_255/0.035)] p-4">
          <h2 className="font-semibold">Settings</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            App access and notification defaults
          </p>
        </div>
        <SettingRow
          icon={<Bell aria-hidden size={19} />}
          title="Nudges"
          value="Group defaults"
        />
        <SettingRow
          icon={<ShieldCheck aria-hidden size={19} />}
          title="MAC access"
          value="Invite required"
        />
        <a
          className="mac-focus flex items-center justify-between gap-4 rounded-md bg-[rgb(255_255_255/0.035)] p-4"
          href="/auth/logout"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-surface-raised)] text-[var(--color-mac-yellow)]">
              <LogOut aria-hidden size={19} />
            </span>
            <span className="font-medium">Sign out</span>
          </span>
          <span className="text-sm text-[var(--color-text-muted)]">
            Current account
          </span>
        </a>
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
    <div className="flex items-center justify-between gap-4 rounded-md bg-[rgb(255_255_255/0.035)] p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-surface-raised)] text-[var(--color-mac-yellow)]">
          {icon}
        </span>
        <p className="font-medium">{title}</p>
      </div>
      <p className="text-sm text-[var(--color-text-muted)]">{value}</p>
    </div>
  );
}
