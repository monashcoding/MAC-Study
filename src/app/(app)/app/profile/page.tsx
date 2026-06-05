import { Bell, LogOut, ShieldCheck, UserRound } from "lucide-react";

export default function ProfilePage() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-[var(--color-mac-yellow)]">
          Profile
        </p>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      <section className="mac-panel p-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414]">
            <UserRound aria-hidden size={28} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">MAC member</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              @mac_study
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
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
          className="mac-panel mac-focus flex items-center justify-between gap-4 p-4"
          href="/auth/logout"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#262626] text-[var(--color-mac-yellow)]">
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
    <div className="mac-panel flex items-center justify-between gap-4 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#262626] text-[var(--color-mac-yellow)]">
          {icon}
        </span>
        <p className="font-medium">{title}</p>
      </div>
      <p className="text-sm text-[var(--color-text-muted)]">{value}</p>
    </div>
  );
}
