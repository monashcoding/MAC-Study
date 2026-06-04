import { Copy, Plus, Users } from "lucide-react";
import { groups } from "@/lib/demo-data";

export default function GroupsPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--color-mac-yellow)]">
            Groups
          </p>
          <h1 className="text-2xl font-semibold">Study crews</h1>
        </div>
        <button className="mac-focus inline-flex h-11 w-11 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414]">
          <Plus aria-hidden size={20} />
          <span className="sr-only">Create group</span>
        </button>
      </div>

      <div className="grid gap-3">
        {groups.map((group) => (
          <article className="mac-panel p-4" key={group.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{group.name}</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {group.description}
                </p>
              </div>
              <span className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)]">
                {group.inviteCode}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <GroupMetric label="Active" value={`${group.activeNow}`} />
              <GroupMetric label="Members" value={`${group.memberCount}`} />
              <GroupMetric label="Rank" value={`#${group.rank}`} />
            </div>

            <div className="mt-4 flex gap-2">
              <button className="mac-focus inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-3 text-sm font-semibold text-[#141414]">
                <Users aria-hidden size={17} />
                Open
              </button>
              <button className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text)]">
                <Copy aria-hidden size={17} />
                <span className="sr-only">Copy invite code</span>
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function GroupMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[#262626] p-3">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
