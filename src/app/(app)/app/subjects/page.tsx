import { BookOpen, Plus } from "lucide-react";
import { subjects } from "@/lib/demo-data";
import { formatDuration } from "@/lib/timer";

export default function SubjectsPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--color-mac-yellow)]">
            Subjects
          </p>
          <h1 className="text-2xl font-semibold">Study load</h1>
        </div>
        <button className="mac-focus inline-flex h-11 w-11 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414]">
          <Plus aria-hidden size={20} />
          <span className="sr-only">Add subject</span>
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {subjects.map((subject, index) => (
          <article className="mac-panel p-4" key={subject.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="h-10 w-10 rounded-md"
                  style={{ background: subject.color }}
                />
                <div>
                  <h2 className="font-semibold">{subject.code}</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {subject.name}
                  </p>
                </div>
              </div>
              <BookOpen
                aria-hidden
                className="text-[var(--color-text-muted)]"
                size={19}
              />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
              <Metric label="Today" value={formatDuration((index + 1) * 1800)} />
              <Metric label="Week" value={formatDuration((index + 2) * 5400)} />
              <Metric label="All time" value={`${18 + index * 7}h`} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[#262626] p-3">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}
