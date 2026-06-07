import { BookOpen, Clock3, Plus, TrendingUp } from "lucide-react";
import { subjects } from "@/lib/demo-data";
import { formatDuration } from "@/lib/timer";

export default function SubjectsPage() {
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          icon={<Clock3 aria-hidden size={18} />}
          label="Today"
          value="2h 06m"
        />
        <SummaryTile
          icon={<TrendingUp aria-hidden size={18} />}
          label="Week"
          value="11h 40m"
        />
        <SummaryTile
          icon={<BookOpen aria-hidden size={18} />}
          label="Subjects"
          value={`${subjects.length}`}
        />
      </section>

      <section className="mac-panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] p-4">
          <div>
            <h2 className="font-semibold">Subject breakdown</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Time tracked by unit
            </p>
          </div>
          <button className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414]">
            <Plus aria-hidden size={19} />
            <span className="sr-only">Add subject</span>
          </button>
        </div>

        <div className="divide-y divide-[var(--color-border)]">
          {subjects.map((subject, index) => (
            <article className="p-4" key={subject.id}>
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="h-11 w-11 shrink-0 rounded-md"
                  style={{ background: subject.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{subject.code}</h3>
                      <p className="truncate text-sm text-[var(--color-text-muted)]">
                        {subject.name}
                      </p>
                    </div>
                    <BookOpen
                      aria-hidden
                      className="shrink-0 text-[var(--color-text-muted)]"
                      size={18}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                    <Metric
                      label="Today"
                      value={formatDuration((index + 1) * 1800)}
                    />
                    <Metric
                      label="Week"
                      value={formatDuration((index + 2) * 5400)}
                    />
                    <Metric label="All time" value={`${18 + index * 7}h`} />
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="mac-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
        <span className="text-[var(--color-mac-yellow)]">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}
