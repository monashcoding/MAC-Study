import { Plus, Users } from "lucide-react";
import { groups } from "@/lib/demo-data";

export default function GroupsPage() {
  const activeNow = groups.reduce((total, group) => total + group.activeNow, 0);
  const memberCount = groups.reduce(
    (total, group) => total + group.memberCount,
    0,
  );

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-3 divide-x divide-[var(--color-border)] border-y border-[var(--color-border)] py-3">
        <SummaryStat label="Groups" value={`${groups.length}`} />
        <SummaryStat label="Active" value={`${activeNow}`} />
        <SummaryStat label="Members" value={`${memberCount}`} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Groups</h2>
            <p className="mt-1 text-sm font-medium text-[var(--color-text-muted)]">
              People studying together now.
            </p>
          </div>
          <button className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414]">
            <Plus aria-hidden size={19} />
            <span className="sr-only">Create group</span>
          </button>
        </div>

        <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
          {groups.map((group) => (
            <article
              className="grid grid-cols-[1fr_auto] items-center gap-4 py-4"
              key={group.id}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface)] text-[var(--color-mac-yellow)]">
                    <Users aria-hidden size={19} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold">
                      {group.name}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      {group.activeNow} active
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <p className="text-xl font-semibold tabular-nums">
                  {group.memberCount}
                </p>
                <p className="text-xs font-medium text-[var(--color-text-muted)]">
                  members
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 text-center">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </p>
    </div>
  );
}
