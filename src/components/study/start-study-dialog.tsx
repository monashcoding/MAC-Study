"use client";

import { BookOpen, Play } from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
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
    <AppDialog
      bodyClassName="grid gap-2"
      closeLabel="Close start study options"
      onClose={onClose}
      title={title}
    >
      <button
        className="mac-focus grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-[rgb(255_255_255/0.045)] px-3 py-2.5 text-left transition active:scale-[0.99]"
        data-dialog-autofocus
        onClick={() => onStart(null)}
        type="button"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-mac-yellow)] text-[#141414]">
          <Play aria-hidden size={18} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">General study</span>
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
          <span className="min-w-0 truncate font-semibold">{subject.name}</span>
          <span
            aria-hidden
            className={cn("h-2.5 w-2.5 rounded-full")}
            style={{ backgroundColor: subject.color }}
          />
        </button>
      ))}
    </AppDialog>
  );
}
