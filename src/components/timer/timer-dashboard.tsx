"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CircleStop,
  Pencil,
  Play,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { subjects as defaultSubjects } from "@/lib/demo-data";
import {
  formatDuration,
  getElapsedSeconds,
  getLocalDateKey,
  groupSessionsBySubject,
  isLongSession,
  sumCompletedSeconds,
} from "@/lib/timer";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "mac-study-demo-state";
const SUBJECT_COLORS = [
  "#FFE330",
  "#6CB6FF",
  "#42D392",
  "#FF8A65",
  "#B388FF",
  "#F06292",
];
const defaultStudySubjects = defaultSubjects.map((subject) => ({
  id: subject.id,
  name: subject.code,
  color: subject.color,
})) satisfies StudySubject[];

type StudySubject = {
  id: string;
  name: string;
  color: string;
};

type StoredSubject = Partial<StudySubject> & {
  code?: string;
};

type ActiveSession = {
  subjectId: string;
  groupId?: string | null;
  startedAt: string;
};

type StoredSession = {
  id: string;
  subjectId: string;
  groupId?: string | null;
  startedAt: string;
  endedAt: string;
  status: "completed" | "needs_confirmation";
  source: "timer";
};

type StoredState = {
  activeSession: ActiveSession | null;
  sessions: StoredSession[];
  subjects?: StoredSubject[];
};

export function TimerDashboard() {
  const [subjects, setSubjects] =
    useState<StudySubject[]>(defaultStudySubjects);
  const [draftSubjects, setDraftSubjects] =
    useState<StudySubject[]>(defaultStudySubjects);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(
    null,
  );
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [isLoaded, setIsLoaded] = useState(false);
  const [isEditingSubjects, setIsEditingSubjects] = useState(false);
  const [initialEditingSubjectId, setInitialEditingSubjectId] = useState<
    string | null
  >(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);

    /* eslint-disable react-hooks/set-state-in-effect --
     * The demo timer hydrates from localStorage after mount so the server
     * render stays deterministic while active sessions still survive reloads.
     */
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as StoredState;
        const savedSubjects = normalizeSubjects(parsed.subjects);

        setSubjects(savedSubjects);
        setDraftSubjects(savedSubjects);
        setActiveSession(parsed.activeSession);
        setSessions(parsed.sessions ?? []);
      } catch {
        setSubjects(defaultStudySubjects);
        setDraftSubjects(defaultStudySubjects);
        setSessions(makeSeedSessions());
      }
    } else {
      setSessions(makeSeedSessions());
    }

    setIsLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeSession, sessions, subjects }),
    );
  }, [activeSession, isLoaded, sessions, subjects]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const elapsedSeconds = activeSession
    ? getElapsedSeconds(activeSession.startedAt, now)
    : 0;
  const todayKey = getLocalDateKey(now);

  const todaySessions = useMemo(
    () =>
      sessions.filter(
        (session) => getLocalDateKey(new Date(session.endedAt)) === todayKey,
      ),
    [sessions, todayKey],
  );
  const subjectTotals = groupSessionsBySubject(todaySessions);
  const completedToday = sumCompletedSeconds(todaySessions);
  const totalToday = completedToday + elapsedSeconds;

  function startStudy(subjectId: string) {
    if (activeSession) {
      return;
    }

    setActiveSession({
      subjectId,
      groupId: null,
      startedAt: new Date().toISOString(),
    });
  }

  function stopStudy() {
    if (!activeSession) {
      return;
    }

    const endedAt = new Date();

    setSessions((current) => [
      {
        id: crypto.randomUUID(),
        subjectId: activeSession.subjectId,
        groupId: activeSession.groupId ?? null,
        startedAt: activeSession.startedAt,
        endedAt: endedAt.toISOString(),
        status: isLongSession(activeSession.startedAt, endedAt)
          ? "needs_confirmation"
          : "completed",
        source: "timer",
      },
      ...current,
    ]);
    setActiveSession(null);
  }

  function openSubjectEditor(subjectId: string) {
    setDraftSubjects(subjects);
    setInitialEditingSubjectId(subjectId);
    setIsEditingSubjects(true);
  }

  function addDraftSubject() {
    const subjectId = makeSubjectId();

    setDraftSubjects((current) => [
      ...current,
      {
        id: subjectId,
        name: `Subject ${current.length + 1}`,
        color: SUBJECT_COLORS[current.length % SUBJECT_COLORS.length],
      },
    ]);

    return subjectId;
  }

  function updateDraftSubject(
    subjectId: string,
    updates: Partial<StudySubject>,
  ) {
    setDraftSubjects((current) =>
      current.map((subject) =>
        subject.id === subjectId ? { ...subject, ...updates } : subject,
      ),
    );
  }

  function deleteDraftSubject(subjectId: string) {
    setDraftSubjects((current) => {
      if (current.length <= 1) {
        return current;
      }

      return current.filter((subject) => subject.id !== subjectId);
    });
  }

  function saveSubjects() {
    const cleanedSubjects = normalizeSubjects(draftSubjects);
    const subjectIds = new Set(cleanedSubjects.map((subject) => subject.id));

    setSubjects(cleanedSubjects);

    if (activeSession && !subjectIds.has(activeSession.subjectId)) {
      setActiveSession(null);
    }

    setIsEditingSubjects(false);
    setInitialEditingSubjectId(null);
  }

  return (
    <div className="space-y-5 pt-1">
      <section className="py-5 text-center">
        <p className="font-mono text-6xl font-semibold leading-none tabular-nums sm:text-7xl lg:text-8xl">
          {formatDuration(totalToday)}
        </p>
      </section>

      <section className="space-y-3">
        <button
          className="mac-focus inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414]"
          onClick={() => {
            setDraftSubjects(subjects);
            setInitialEditingSubjectId(null);
            setIsEditingSubjects(true);
          }}
          type="button"
        >
          <Pencil aria-hidden size={16} />
          Edit subjects
        </button>

        <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
          {subjects.map((subject) => {
            const isActive = activeSession?.subjectId === subject.id;
            const subjectSeconds =
              (subjectTotals[subject.id] ?? 0) +
              (isActive ? elapsedSeconds : 0);

            return (
              <div
                className="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 py-2.5"
                key={subject.id}
              >
                <button
                  className={cn(
                    "mac-focus inline-flex h-10 w-10 items-center justify-center rounded-full font-semibold text-[#141414] shadow-[0_10px_24px_rgb(0_0_0/0.22)] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-35",
                    isActive ? "bg-[var(--color-danger)] text-white" : "",
                  )}
                  disabled={Boolean(activeSession) && !isActive}
                  onClick={() =>
                    isActive ? stopStudy() : startStudy(subject.id)
                  }
                  style={
                    !isActive ? { backgroundColor: subject.color } : undefined
                  }
                  type="button"
                >
                  {isActive ? (
                    <CircleStop aria-hidden size={19} />
                  ) : (
                    <Play aria-hidden size={19} />
                  )}
                  <span className="sr-only">
                    {isActive ? "Stop study session" : `Start ${subject.name}`}
                  </span>
                </button>

                <h3 className="min-w-0 truncate text-sm font-semibold sm:text-base">
                  {subject.name}
                </h3>

                <p className="shrink-0 pl-1 text-right font-mono text-sm font-semibold tabular-nums text-[var(--color-text-muted)]">
                  {formatDuration(subjectSeconds)}
                </p>

                <button
                  className="mac-focus inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)]"
                  onClick={() => openSubjectEditor(subject.id)}
                  type="button"
                >
                  <Pencil aria-hidden size={17} />
                  <span className="sr-only">Edit {subject.name}</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {isEditingSubjects ? (
        <SubjectEditor
          draftSubjects={draftSubjects}
          initialSubjectId={initialEditingSubjectId}
          onAdd={addDraftSubject}
          onClose={() => {
            setIsEditingSubjects(false);
            setInitialEditingSubjectId(null);
          }}
          onDelete={deleteDraftSubject}
          onSave={saveSubjects}
          onUpdate={updateDraftSubject}
        />
      ) : null}
    </div>
  );
}

function SubjectEditor({
  draftSubjects,
  initialSubjectId,
  onAdd,
  onClose,
  onDelete,
  onSave,
  onUpdate,
}: {
  draftSubjects: StudySubject[];
  initialSubjectId: string | null;
  onAdd: () => string;
  onClose: () => void;
  onDelete: (subjectId: string) => void;
  onSave: () => void;
  onUpdate: (subjectId: string, updates: Partial<StudySubject>) => void;
}) {
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(
    initialSubjectId,
  );
  const editingSubject =
    draftSubjects.find((subject) => subject.id === editingSubjectId) ?? null;

  function addAndEditSubject() {
    setEditingSubjectId(onAdd());
  }

  function deleteSubject(subjectId: string) {
    onDelete(subjectId);
    setEditingSubjectId(null);
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-black/58 px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-[calc(var(--safe-area-top)+0.75rem)] backdrop-blur-sm sm:items-center sm:justify-center"
      role="dialog"
    >
      <div className="max-h-[min(88dvh,720px)] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-background)] p-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">
              {editingSubject ? "Subject details" : "Edit subjects"}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {editingSubject
                ? "Update the name and play colour."
                : "Choose a subject to edit, or add a new one."}
            </p>
          </div>
          <button
            className="mac-focus inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)]"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden size={18} />
            <span className="sr-only">Close subject editor</span>
          </button>
        </div>

        {editingSubject ? (
          <div className="space-y-5 p-4">
            <button
              className="mac-focus inline-flex h-10 items-center gap-2 rounded-md text-sm font-semibold text-[var(--color-text-muted)]"
              onClick={() => setEditingSubjectId(null)}
              type="button"
            >
              <ArrowLeft aria-hidden size={17} />
              Subjects
            </button>

            <label className="block text-sm font-medium">
              Name
              <input
                className="mac-focus mt-2 h-12 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]"
                onChange={(event) =>
                  onUpdate(editingSubject.id, { name: event.target.value })
                }
                value={editingSubject.name}
              />
            </label>

            <div>
              <p className="text-sm font-medium">Play colour</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {SUBJECT_COLORS.map((color) => {
                  const selected = color === editingSubject.color;

                  return (
                    <button
                      aria-label={`Use colour ${color}`}
                      className={cn(
                        "mac-focus h-10 w-10 rounded-full border transition",
                        selected
                          ? "border-white ring-2 ring-[var(--color-mac-yellow)] ring-offset-2 ring-offset-[var(--color-background)]"
                          : "border-[var(--color-border)]",
                      )}
                      key={color}
                      onClick={() => onUpdate(editingSubject.id, { color })}
                      style={{ backgroundColor: color }}
                      type="button"
                    />
                  );
                })}
              </div>
            </div>

            <button
              className="mac-focus inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[rgb(255_107_107/0.45)] px-4 text-sm font-semibold text-[var(--color-danger)] disabled:opacity-35"
              disabled={draftSubjects.length <= 1}
              onClick={() => deleteSubject(editingSubject.id)}
              type="button"
            >
              <Trash2 aria-hidden size={16} />
              Delete subject
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {draftSubjects.map((subject) => (
              <div
                className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3"
                key={subject.id}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className="h-3.5 w-3.5 shrink-0 rounded-full"
                    style={{ backgroundColor: subject.color }}
                  />
                  <p className="truncate font-semibold">{subject.name}</p>
                </div>
                <button
                  className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)]"
                  onClick={() => setEditingSubjectId(subject.id)}
                  type="button"
                >
                  <Pencil aria-hidden size={16} />
                  <span className="sr-only">Edit {subject.name}</span>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-[var(--color-border)] bg-[var(--color-background)] p-4 sm:flex-row sm:justify-between">
          <button
            className="mac-focus inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-4 font-semibold text-[var(--color-text)]"
            onClick={addAndEditSubject}
            type="button"
          >
            <Plus aria-hidden size={17} />
            Add subject
          </button>
          <button
            className="mac-focus inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 font-semibold text-[#141414]"
            onClick={onSave}
            type="button"
          >
            <Save aria-hidden size={17} />
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function normalizeSubjects(subjects: StoredSubject[] | undefined) {
  const source: StoredSubject[] = subjects?.length
    ? subjects
    : defaultStudySubjects;
  const cleaned = source
    .map((subject, index) => ({
      id: subject.id || makeSubjectId(),
      name:
        subject.name?.trim() ||
        subject.code?.trim().toUpperCase() ||
        `Subject ${index + 1}`,
      color: SUBJECT_COLORS.includes(subject.color ?? "")
        ? (subject.color ?? SUBJECT_COLORS[index % SUBJECT_COLORS.length])
        : SUBJECT_COLORS[index % SUBJECT_COLORS.length],
    }))
    .filter((subject) => subject.name);

  return cleaned.length ? cleaned : defaultStudySubjects;
}

function makeSeedSessions(): StoredSession[] {
  const now = new Date();
  const base = new Date(now);
  base.setHours(9, 10, 0, 0);

  return [
    {
      id: "seed-fit3159",
      subjectId: "fit3159",
      groupId: "exam-sprint",
      startedAt: base.toISOString(),
      endedAt: new Date(base.getTime() + 42 * 60 * 1000).toISOString(),
      status: "completed",
      source: "timer",
    },
    {
      id: "seed-fit3077",
      subjectId: "fit3077",
      groupId: null,
      startedAt: new Date(base.getTime() + 60 * 60 * 1000).toISOString(),
      endedAt: new Date(base.getTime() + 102 * 60 * 1000).toISOString(),
      status: "completed",
      source: "timer",
    },
  ];
}

function makeSubjectId() {
  return `subject-${crypto.randomUUID()}`;
}
