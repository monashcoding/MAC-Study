import { Medal, Trophy } from "lucide-react";
import { demoLeaderboard } from "@/lib/demo-data";
import { formatDuration } from "@/lib/timer";

export default function LeaderboardsPage() {
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Your rank" value="#2" />
        <SummaryTile label="Top time" value="2h 20m" />
        <SummaryTile label="Active today" value="14" />
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {["Today", "Week", "FIT3159", "FIT3077"].map((filter, index) => (
          <button
            className={`mac-focus h-10 shrink-0 rounded-md border px-4 text-sm font-medium ${
              index === 0
                ? "border-[var(--color-mac-yellow)] bg-[var(--color-mac-yellow)] text-[#141414]"
                : "border-[var(--color-border)] text-[var(--color-text-muted)]"
            }`}
            key={filter}
          >
            {filter}
          </button>
        ))}
      </div>

      <section className="mac-panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] p-4">
          <div>
            <h2 className="font-semibold">Daily rankings</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Study time counted from confirmed sessions
            </p>
          </div>
          <Medal
            aria-hidden
            className="text-[var(--color-mac-yellow)]"
            size={20}
          />
        </div>

        {demoLeaderboard.map((row) => (
          <div
            className="flex items-center gap-3 border-b border-[var(--color-border)] p-4 last:border-b-0"
            key={row.name}
          >
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-md font-semibold ${
                row.rank === 1
                  ? "bg-[var(--color-mac-yellow)] text-[#141414]"
                  : "bg-[var(--color-surface-raised)] text-[var(--color-text)]"
              }`}
            >
              {row.rank === 1 ? <Trophy aria-hidden size={18} /> : row.rank}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{row.name}</p>
              <p className="text-sm text-[var(--color-text-muted)]">
                {row.subject}
              </p>
            </div>
            <p className="font-semibold tabular-nums">
              {formatDuration(row.seconds)}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="mac-panel p-4">
      <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
