"use client";

import { BookOpen, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type StudyChoiceSubject = {
  id: string;
  name: string;
  color: string;
};

export function StartStudyDialog({
  onClose,
  onStart,
  subjects,
  title = "Start a session",
}: {
  onClose: () => void;
  onStart: (subjectId: string | null) => void;
  subjects: StudyChoiceSubject[];
  title?: string;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-x-0 top-0 z-50 flex h-[var(--app-viewport-height)] items-center justify-center bg-black/58 px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-[calc(var(--safe-area-top)+0.75rem)] backdrop-blur-sm"
      role="dialog"
    >
      <div className="max-h-[min(88dvh,620px)] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-[var(--color-background)] p-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            className="mac-focus inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)]"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden size={18} />
            <span className="sr-only">Close start study options</span>
          </button>
        </div>

        <div className="grid gap-2 p-4">
          <button
            className="mac-focus grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-[rgb(255_255_255/0.045)] px-3 py-2.5 text-left transition active:scale-[0.99]"
            onClick={() => onStart(null)}
            type="button"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-mac-yellow)] text-[#141414]">
              <Play aria-hidden size={18} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">
                General study
              </span>
              <span className="block truncate text-sm text-[var(--color-text-muted)]">
                No subject
              </span>
            </span>
            <BookOpen
              aria-hidden
              className="text-[var(--color-text-muted)]"
              size={18}
            />
          </button>

          {subjects.map((subject) => (
            <button
              className="mac-focus grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-2.5 text-left transition active:scale-[0.99]"
              key={subject.id}
              onClick={() => onStart(subject.id)}
              type="button"
            >
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#141414]"
                style={{ backgroundColor: subject.color }}
              >
                <Play aria-hidden size={18} />
              </span>
              <span className="min-w-0 truncate font-semibold">
                {subject.name}
              </span>
              <span
                aria-hidden
                className={cn("h-2.5 w-2.5 rounded-full")}
                style={{ backgroundColor: subject.color }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
