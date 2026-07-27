"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BookOpen,
  CalendarClock,
  CircleStop,
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
import { CustomSelect } from "@/components/custom-select";
import { EmptyStateCta } from "@/components/empty-state-cta";
import {
  DateTimeField,
  type DateTimePickerPart,
} from "@/components/date-time-field";
import { PaginatedList } from "@/components/paginated-list";
import {
  cacheRemoteTimerState,
  getCachedRemoteTimerState,
} from "@/lib/client-cache";
import {
  fetchRemoteTimerState,
  deleteRemoteStudySession,
  saveRemoteSubjects,
  startRemoteStudySession,
  stopRemoteStudySession,
  subscribeToRemoteAppChanges,
  updateRemoteStudySession,
  type RemoteTimerState,
} from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  formatDuration,
  getElapsedSeconds,
  getLocalDateKey,
  groupSessionsBySubject,
  isLongSession,
  sumCompletedSeconds,
} from "@/lib/timer";
import { StartStudyDialog } from "@/components/study/start-study-dialog";
import { TransientToast } from "@/components/transient-toast";
import { getTeachingPeriodLabel, type UnitEnrollment } from "@/lib/units";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "mac-study-demo-state";
const UNLINKED_UNIT_VALUE = "__unlinked__";
const SUBJECT_COLOR_OPTIONS = [
  { label: "Yellow", swatchColor: "#FFE330", value: "#FFE330" },
  { label: "Blue", swatchColor: "#6CB6FF", value: "#6CB6FF" },
  { label: "Green", swatchColor: "#42D392", value: "#42D392" },
  { label: "Orange", swatchColor: "#FF8A65", value: "#FF8A65" },
  { label: "Purple", swatchColor: "#B388FF", value: "#B388FF" },
  { label: "Pink", swatchColor: "#F06292", value: "#F06292" },
] as const;
const SUBJECT_COLORS: string[] = SUBJECT_COLOR_OPTIONS.map(
  (option) => option.value,
);
const defaultStudySubjects: StudySubject[] = [];

type StudySubject = {
  id: string;
  name: string;
  color: string;
  canonicalCode?: string;
  unitOfferingId?: string | null;
};

type StoredSubject = Partial<StudySubject> & {
  code?: string;
};

type ActiveSession = {
  subjectId: string | null;
  groupId?: string | null;
  startedAt: string;
};

type StoredSession = {
  id: string;
  subjectId: string | null;
  groupId?: string | null;
  startedAt: string;
  endedAt: string;
  status: "completed" | "needs_confirmation";
  source: "manual_adjustment" | "timer";
};

type StoredState = {
  activeSession: ActiveSession | null;
  sessions: StoredSession[];
  subjects?: StoredSubject[];
};

type DataMode = "local" | "remote";

export function TimerDashboard() {
  const [subjects, setSubjects] =
    useState<StudySubject[]>(defaultStudySubjects);
  const [draftSubjects, setDraftSubjects] =
    useState<StudySubject[]>(defaultStudySubjects);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(
    null,
  );
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [unitEnrollments, setUnitEnrollments] = useState<UnitEnrollment[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [isLoaded, setIsLoaded] = useState(false);
  const [isEditingSubjects, setIsEditingSubjects] = useState(false);
  const [isChoosingStudy, setIsChoosingStudy] = useState(false);
  const [initialEditingSubjectId, setInitialEditingSubjectId] = useState<
    string | null
  >(null);
  const [dataMode, setDataMode] = useState<DataMode>("local");
  const [remoteClient, setRemoteClient] = useState<SupabaseClient | null>(null);
  const [subjectSaveError, setSubjectSaveError] = useState<string | null>(null);
  const [subjectToastMessage, setSubjectToastMessage] = useState<string | null>(
    null,
  );
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [isSessionHistoryOpen, setIsSessionHistoryOpen] = useState(false);
  const [returnToSessionHistory, setReturnToSessionHistory] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const isSavingSubjectsRef = useRef(false);
  const isSessionMutationInFlightRef = useRef(false);

  const applyRemoteTimerState = useCallback((remoteState: RemoteTimerState) => {
    setSubjects(remoteState.subjects);
    setDraftSubjects(remoteState.subjects);
    setUnitEnrollments(remoteState.unitEnrollments ?? []);
    setActiveSession(remoteState.activeSession);
    setSessions(remoteState.sessions);
  }, []);

  const loadLocalTimerState = useCallback(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);

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
        setSessions([]);
      }
    } else {
      setSessions([]);
    }
  }, []);

  const refreshRemoteTimer = useCallback(
    async (supabase: SupabaseClient) => {
      const remoteState = await fetchRemoteTimerState(supabase);

      if (remoteState) {
        cacheRemoteTimerState(remoteState);
        applyRemoteTimerState(remoteState);
      }
    },
    [applyRemoteTimerState],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadInitialState() {
      const cachedRemoteState = getCachedRemoteTimerState();

      if (cachedRemoteState) {
        applyRemoteTimerState(cachedRemoteState);
        setDataMode("remote");
        setIsLoaded(true);
      }

      try {
        const supabase = createSupabaseBrowserClient();
        if (!cancelled) {
          setRemoteClient(supabase);
        }
        const remoteState = await fetchRemoteTimerState(supabase);

        if (!cancelled && remoteState) {
          cacheRemoteTimerState(remoteState);
          applyRemoteTimerState(remoteState);
          setDataMode("remote");
          setIsLoaded(true);
          return;
        }
      } catch {
        // Fall through to local demo mode.
      }

      if (cachedRemoteState) {
        return;
      }

      if (!cancelled) {
        loadLocalTimerState();
        setDataMode("local");
        setIsLoaded(true);
      }
    }

    void loadInitialState();

    return () => {
      cancelled = true;
    };
  }, [applyRemoteTimerState, loadLocalTimerState]);

  useEffect(() => {
    if (!isLoaded || dataMode !== "local") {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeSession, sessions, subjects }),
    );
  }, [activeSession, dataMode, isLoaded, sessions, subjects]);

  useEffect(() => {
    if (!remoteClient) {
      return;
    }

    return subscribeToRemoteAppChanges(remoteClient, () => {
      if (
        isSavingSubjectsRef.current ||
        isSessionMutationInFlightRef.current
      ) {
        return;
      }
      void refreshRemoteTimer(remoteClient);
    });
  }, [refreshRemoteTimer, remoteClient]);

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
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (first, second) =>
          new Date(second.startedAt).getTime() -
          new Date(first.startedAt).getTime(),
      ),
    [sessions],
  );
  const editingSession =
    sessions.find((session) => session.id === editingSessionId) ?? null;

  async function startStudy(
    subjectId: string | null,
    groupId: string | null = null,
  ) {
    if (activeSession || isSessionMutationInFlightRef.current) {
      return;
    }

    setIsChoosingStudy(false);
    const optimisticSession: ActiveSession = {
      subjectId,
      groupId,
      startedAt: new Date().toISOString(),
    };
    setActiveSession(optimisticSession);
    setNow(new Date());

    if (dataMode === "remote" && remoteClient) {
      isSessionMutationInFlightRef.current = true;
      try {
        await startRemoteStudySession({
          groupId,
          startedAt: optimisticSession.startedAt,
          subjectId,
          supabase: remoteClient,
        });
        await refreshRemoteTimer(remoteClient).catch(() => undefined);
      } catch {
        setActiveSession((current) =>
          current?.startedAt === optimisticSession.startedAt ? null : current,
        );
        await refreshRemoteTimer(remoteClient).catch(() => undefined);
        setSubjectToastMessage("Session could not be started");
      } finally {
        isSessionMutationInFlightRef.current = false;
      }

      return;
    }
  }

  async function stopStudy() {
    if (!activeSession || isSessionMutationInFlightRef.current) {
      return;
    }

    const stoppingSession = activeSession;
    const previousSessions = sessions;
    const endedAt = new Date();
    const sessionId = crypto.randomUUID();
    const needsConfirmation = isLongSession(stoppingSession.startedAt, endedAt);
    const optimisticCompletedSession: StoredSession = {
      id: sessionId,
      subjectId: stoppingSession.subjectId,
      groupId: stoppingSession.groupId ?? null,
      startedAt: stoppingSession.startedAt,
      endedAt: endedAt.toISOString(),
      status: needsConfirmation ? "needs_confirmation" : "completed",
      source: "timer",
    };

    setSessions((current) => [optimisticCompletedSession, ...current]);
    setActiveSession(null);

    if (dataMode === "remote" && remoteClient) {
      isSessionMutationInFlightRef.current = true;
      try {
        const stopped = await stopRemoteStudySession(remoteClient);

        if (stopped) {
          setSessions((current) =>
            current.map((session) =>
              session.id === sessionId
                ? {
                    ...session,
                    endedAt: stopped.endedAt,
                    id: stopped.id,
                    status: stopped.status,
                  }
                : session,
            ),
          );

          if (stopped.status === "needs_confirmation") {
            setReturnToSessionHistory(false);
            setEditingSessionId(stopped.id);
          }
        }

        await refreshRemoteTimer(remoteClient).catch(() => undefined);
      } catch {
        setSessions(previousSessions);
        setActiveSession(stoppingSession);
        setSubjectToastMessage("Session could not be stopped");
      } finally {
        isSessionMutationInFlightRef.current = false;
      }

      return;
    }

    if (needsConfirmation) {
      setReturnToSessionHistory(false);
      setEditingSessionId(sessionId);
    }
  }

  async function saveSessionEdit({
    endedAt,
    sessionId,
    startedAt,
    subjectId,
  }: {
    endedAt: string;
    sessionId: string;
    startedAt: string;
    subjectId: string | null;
  }) {
    const previousSessions = sessions;
    setSessionBusy(true);
    setSessionError(null);
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              endedAt,
              source: "manual_adjustment",
              startedAt,
              status: "completed",
              subjectId,
            }
          : session,
      ),
    );

    try {
      if (dataMode === "remote" && remoteClient) {
        await updateRemoteStudySession({
          endedAt,
          sessionId,
          startedAt,
          subjectId,
          supabase: remoteClient,
        });
        await refreshRemoteTimer(remoteClient);
      }
      setEditingSessionId(null);
      setReturnToSessionHistory(false);
      if (returnToSessionHistory) setIsSessionHistoryOpen(true);
      setSubjectToastMessage("Session updated");
    } catch {
      setSessions(previousSessions);
      setSessionError("Session could not be updated.");
    } finally {
      setSessionBusy(false);
    }
  }

  async function deleteSession(sessionId: string) {
    const previousSessions = sessions;
    setSessionBusy(true);
    setSessionError(null);
    setSessions((current) =>
      current.filter((session) => session.id !== sessionId),
    );

    try {
      if (dataMode === "remote" && remoteClient) {
        await deleteRemoteStudySession({
          sessionId,
          supabase: remoteClient,
        });
        await refreshRemoteTimer(remoteClient);
      }
      setEditingSessionId(null);
      setReturnToSessionHistory(false);
      if (returnToSessionHistory) setIsSessionHistoryOpen(true);
      setSubjectToastMessage("Session deleted");
    } catch {
      setSessions(previousSessions);
      setSessionError("Session could not be deleted.");
    } finally {
      setSessionBusy(false);
    }
  }

  function openSubjectEditor(subjectId: string) {
    setDraftSubjects(subjects);
    setSubjectSaveError(null);
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

  function openNewSubjectEditor() {
    const subjectId = makeSubjectId();
    const nextSubject: StudySubject = {
      id: subjectId,
      name: `Subject ${subjects.length + 1}`,
      color: SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length],
    };

    setDraftSubjects([...subjects, nextSubject]);
    setSubjectSaveError(null);
    setInitialEditingSubjectId(subjectId);
    setIsEditingSubjects(true);
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
    setDraftSubjects((current) =>
      current.filter((subject) => subject.id !== subjectId),
    );
  }

  function restoreDraftSubject(subject: StudySubject, index: number) {
    setDraftSubjects((current) => {
      if (current.some((item) => item.id === subject.id)) return current;

      const next = [...current];
      next.splice(Math.min(index, next.length), 0, subject);
      return next;
    });
  }

  function saveSubjects() {
    const cleanedSubjects = normalizeSubjects(draftSubjects);
    const subjectIds = new Set(cleanedSubjects.map((subject) => subject.id));
    const previousSubjects = subjects;
    const previousActiveSession = activeSession;
    const removedActiveSubject = Boolean(
      activeSession?.subjectId && !subjectIds.has(activeSession.subjectId),
    );

    setSubjects(cleanedSubjects);
    setDraftSubjects(cleanedSubjects);
    setSubjectSaveError(null);
    setSubjectToastMessage("Changes saved");

    if (removedActiveSubject) {
      setActiveSession(null);
    }

    setIsEditingSubjects(false);
    setInitialEditingSubjectId(null);

    if (dataMode !== "remote" || !remoteClient) return;

    isSavingSubjectsRef.current = true;
    void saveRemoteSubjects({
      subjects: cleanedSubjects,
      supabase: remoteClient,
    })
      .then((savedSubjects) => {
        setSubjects(savedSubjects);
        setDraftSubjects(savedSubjects);
      })
      .catch(() => {
        setSubjects(previousSubjects);
        setDraftSubjects(cleanedSubjects);
        if (removedActiveSubject) setActiveSession(previousActiveSession);
        setSubjectToastMessage(null);
        setSubjectSaveError("Changes could not be saved. Try again.");
        setIsEditingSubjects(true);
      })
      .finally(() => {
        isSavingSubjectsRef.current = false;
      });
  }

  return (
    <div className="space-y-5 pt-1 lg:pt-0 xl:grid xl:grid-cols-[minmax(0,0.9fr)_minmax(25rem,1.1fr)] xl:items-stretch xl:gap-6 xl:space-y-0">
      <section className="py-5 text-center lg:flex lg:min-h-[24rem] lg:flex-col lg:items-center lg:justify-center lg:rounded-lg lg:border lg:border-[rgb(255_255_255/0.08)] lg:bg-[rgb(18_18_18/0.52)] lg:px-6 lg:py-10 xl:min-h-[30rem]">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[var(--color-mac-yellow)]">
          Studied today
        </p>
        <p className="mt-4 font-mono text-6xl font-semibold leading-none tabular-nums sm:text-7xl lg:text-[5.4rem] xl:text-[clamp(4rem,5vw,6rem)]">
          {formatDuration(totalToday)}
        </p>
        <button
          className={cn(
            "mac-focus mt-6 inline-flex h-11 min-w-36 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition hover:brightness-105 active:scale-[0.99] lg:h-12 lg:min-w-44",
            activeSession
              ? "bg-[var(--color-danger)] text-white"
              : "bg-[var(--color-mac-yellow)] text-[#141414]",
          )}
          onClick={() =>
            void (activeSession ? stopStudy() : setIsChoosingStudy(true))
          }
          type="button"
        >
          {activeSession ? (
            <CircleStop aria-hidden size={18} />
          ) : (
            <Play aria-hidden size={18} />
          )}
          {activeSession ? "Stop session" : "Start session"}
        </button>
      </section>

      <section className="space-y-3 lg:rounded-lg lg:border lg:border-[rgb(255_255_255/0.08)] lg:bg-[rgb(18_18_18/0.36)] lg:p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 text-xl font-semibold">Subjects</h2>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="mac-focus inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 text-xs font-semibold text-[var(--color-text)] transition hover:bg-[rgb(255_255_255/0.04)]"
              onClick={() => setIsSessionHistoryOpen(true)}
              type="button"
            >
              <CalendarClock aria-hidden size={15} />
              Session history
            </button>
            {subjects.length ? (
              <button
                className="mac-focus inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)] transition hover:bg-[rgb(255_255_255/0.04)] sm:w-auto sm:px-3"
                onClick={() => {
                  setDraftSubjects(subjects);
                  setSubjectSaveError(null);
                  setInitialEditingSubjectId(null);
                  setIsEditingSubjects(true);
                }}
                type="button"
              >
                <Pencil aria-hidden size={16} />
                <span className="hidden sm:inline">Edit</span>
                <span className="sr-only sm:hidden">Edit subjects</span>
              </button>
            ) : null}
          </div>
        </div>

        {subjects.length ? (
          <PaginatedList
            className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)] lg:mt-4 lg:rounded-md lg:border lg:bg-[rgb(255_255_255/0.02)] lg:px-3"
            items={subjects}
            pageSize={12}
            renderItem={(subject) => {
            const isActive = activeSession?.subjectId === subject.id;
            const subjectSeconds =
              (subjectTotals[subject.id] ?? 0) +
              (isActive ? elapsedSeconds : 0);

            return (
              <div
                className="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 py-2.5 lg:min-h-16"
                key={subject.id}
              >
                <button
                  className={cn(
                    "mac-focus inline-flex h-10 w-10 items-center justify-center rounded-full font-semibold text-[#141414] shadow-[0_10px_24px_rgb(0_0_0/0.22)] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-35",
                    isActive ? "bg-[var(--color-danger)] text-white" : "",
                  )}
                  disabled={Boolean(activeSession) && !isActive}
                  onClick={() =>
                    void (isActive ? stopStudy() : startStudy(subject.id))
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
                  className="mac-focus inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)]"
                  onClick={() => openSubjectEditor(subject.id)}
                  type="button"
                >
                  <Pencil aria-hidden size={17} />
                  <span className="sr-only">Edit {subject.name}</span>
                </button>
              </div>
            );
            }}
            resetKey="timer-subjects"
          />
        ) : (
          <EmptyStateCta
            action={
              <button
                className="mac-focus inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414] sm:w-auto"
                onClick={openNewSubjectEditor}
                type="button"
              >
                <Plus aria-hidden size={17} />
                Add subject
              </button>
            }
            description="Create one to track where your study time goes."
            icon={<BookOpen aria-hidden size={18} />}
            title="Add your first subject"
          />
        )}
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
          onRestore={restoreDraftSubject}
          onSave={saveSubjects}
          onUpdate={updateDraftSubject}
          saveError={subjectSaveError}
          unitEnrollments={unitEnrollments}
        />
      ) : null}

      {isChoosingStudy ? (
        <StartStudyDialog
          onClose={() => setIsChoosingStudy(false)}
          onStart={(subjectId) => void startStudy(subjectId)}
          subjects={subjects}
        />
      ) : null}

      {isSessionHistoryOpen ? (
        <SessionHistoryDialog
          onClose={() => setIsSessionHistoryOpen(false)}
          onEdit={(sessionId) => {
            setSessionError(null);
            setReturnToSessionHistory(true);
            setIsSessionHistoryOpen(false);
            setEditingSessionId(sessionId);
          }}
          sessions={sortedSessions}
          subjects={subjects}
        />
      ) : null}

      {editingSession ? (
        <SessionEditor
          busy={sessionBusy}
          error={sessionError}
          key={editingSession.id}
          onClose={() => {
            setEditingSessionId(null);
            setSessionError(null);
            if (returnToSessionHistory) setIsSessionHistoryOpen(true);
            setReturnToSessionHistory(false);
          }}
          onDelete={() => void deleteSession(editingSession.id)}
          onSave={(input) =>
            void saveSessionEdit({
              ...input,
              sessionId: editingSession.id,
            })
          }
          session={editingSession}
          subjects={subjects}
        />
      ) : null}

      <TransientToast
        message={subjectToastMessage}
        onDismiss={() => setSubjectToastMessage(null)}
      />
    </div>
  );
}

const GENERAL_SESSION_SUBJECT = "__general__";

function SessionHistoryDialog({
  onClose,
  onEdit,
  sessions,
  subjects,
}: {
  onClose: () => void;
  onEdit: (sessionId: string) => void;
  sessions: StoredSession[];
  subjects: StudySubject[];
}) {
  return (
    <AppDialog
      bodyClassName="p-0"
      closeLabel="Close session history"
      maxWidthClassName="max-w-lg"
      onClose={onClose}
      title="Session history"
    >
      {sessions.length ? (
        <PaginatedList
          className="divide-y divide-[var(--color-border)] px-4"
          items={sessions}
          pageSize={10}
          renderItem={(session) => {
            const subject = subjects.find(
              (item) => item.id === session.subjectId,
            );
            const durationSeconds = Math.max(
              0,
              Math.floor(
                (new Date(session.endedAt).getTime() -
                  new Date(session.startedAt).getTime()) /
                  1000,
              ),
            );

            return (
              <div
                className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3"
                key={session.id}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-semibold">
                      {subject?.name ?? "General study"}
                    </p>
                    {session.status === "needs_confirmation" ? (
                      <span className="shrink-0 rounded bg-[rgb(255_227_48/0.1)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-mac-yellow)]">
                        Review
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
                    {formatSessionDate(session.startedAt)} ·{" "}
                    {formatSessionTime(session.startedAt)} ·{" "}
                    {formatDuration(durationSeconds)}
                  </p>
                </div>
                <button
                  className="mac-focus inline-flex h-11 items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-xs font-semibold"
                  onClick={() => onEdit(session.id)}
                  type="button"
                >
                  {session.status === "needs_confirmation" ? "Review" : "Edit"}
                </button>
              </div>
            );
          }}
          resetKey="session-history-dialog"
        />
      ) : (
        <p className="p-5 text-sm text-[var(--color-text-muted)]">
          Completed sessions will appear here.
        </p>
      )}
    </AppDialog>
  );
}

function SessionEditor({
  busy,
  error,
  onClose,
  onDelete,
  onSave,
  session,
  subjects,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onDelete: () => void;
  onSave: (input: {
    endedAt: string;
    startedAt: string;
    subjectId: string | null;
  }) => void;
  session: StoredSession;
  subjects: StudySubject[];
}) {
  const [subjectId, setSubjectId] = useState(
    session.subjectId ?? GENERAL_SESSION_SUBJECT,
  );
  const [startedAt, setStartedAt] = useState(() =>
    toDateTimeLocal(session.startedAt),
  );
  const [endedAt, setEndedAt] = useState(() =>
    toDateTimeLocal(session.endedAt),
  );
  const [activePicker, setActivePicker] = useState<{
    field: "ended" | "started";
    part: DateTimePickerPart;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const startedDate = new Date(startedAt);
  const endedDate = new Date(endedAt);
  const valid =
    !Number.isNaN(startedDate.getTime()) &&
    !Number.isNaN(endedDate.getTime()) &&
    endedDate.getTime() > startedDate.getTime();
  const isDirty =
    subjectId !== (session.subjectId ?? GENERAL_SESSION_SUBJECT) ||
    startedAt !== toDateTimeLocal(session.startedAt) ||
    endedAt !== toDateTimeLocal(session.endedAt);

  return (
    <>
      <AppDialog
        bodyClassName="space-y-4"
        closeLabel="Close session editor"
        footer={
          <button
            className="mac-focus inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] text-sm font-semibold text-[#141414] disabled:opacity-45"
            disabled={!valid || busy}
            onClick={() =>
              onSave({
                endedAt: endedDate.toISOString(),
                startedAt: startedDate.toISOString(),
                subjectId:
                  subjectId === GENERAL_SESSION_SUBJECT ? null : subjectId,
              })
            }
            type="button"
          >
            {busy ? (
              <>
                <LoaderCircle aria-hidden className="animate-spin" size={16} />
                Saving…
              </>
            ) : session.status === "needs_confirmation" ? (
              "Confirm session"
            ) : (
              "Save changes"
            )}
          </button>
        }
        isDirty={isDirty}
        maxWidthClassName="max-w-md"
        onClose={onClose}
        title={
          session.status === "needs_confirmation"
            ? "Review long session"
            : "Edit session"
        }
      >
        {session.status === "needs_confirmation" ? (
          <p className="rounded-md bg-[rgb(255_227_48/0.08)] p-3 text-sm text-[var(--color-text-muted)]">
            This timer ran for over six hours. Check the times before confirming.
          </p>
        ) : null}

        <div className="text-sm font-medium">
          <p className="mb-2">Subject</p>
          <CustomSelect
            ariaLabel="Session subject"
            onChange={setSubjectId}
            options={[
              { label: "General study", value: GENERAL_SESSION_SUBJECT },
              ...subjects.map((subject) => ({
                label: subject.name,
                swatchColor: subject.color,
                value: subject.id,
              })),
            ]}
            value={subjectId}
          />
        </div>

        <DateTimeField
          activePart={
            activePicker?.field === "started" ? activePicker.part : null
          }
          label="Started"
          onChange={setStartedAt}
          onPartChange={(part) =>
            setActivePicker(part ? { field: "started", part } : null)
          }
          value={startedAt}
        />

        <DateTimeField
          activePart={
            activePicker?.field === "ended" ? activePicker.part : null
          }
          label="Ended"
          onChange={setEndedAt}
          onPartChange={(part) =>
            setActivePicker(part ? { field: "ended", part } : null)
          }
          value={endedAt}
        />

        {!valid ? (
          <p className="text-sm text-[var(--color-danger)]">
            End time must be after start time.
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-[var(--color-danger)]" role="status">
            {error}
          </p>
        ) : null}

        <button
          className="mac-focus h-11 rounded-md border border-[rgb(255_107_107/0.45)] px-4 text-sm font-semibold text-[var(--color-danger)]"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
          type="button"
        >
          Delete session
        </button>
      </AppDialog>

      {confirmDelete ? (
        <AppDialog
          closeLabel="Close delete session confirmation"
          footer={
            <div className="grid grid-cols-2 gap-2">
              <button
                className="mac-focus h-11 rounded-md border border-[var(--color-border)] text-sm font-semibold"
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="mac-focus inline-flex h-11 items-center justify-center rounded-md border border-[rgb(255_107_107/0.45)] text-sm font-semibold text-[var(--color-danger)] disabled:opacity-45"
                disabled={busy}
                onClick={onDelete}
                type="button"
              >
                {busy ? (
                  <LoaderCircle
                    aria-hidden
                    className="animate-spin"
                    size={16}
                  />
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          }
          maxWidthClassName="max-w-sm"
          onClose={() => setConfirmDelete(false)}
          title="Delete session?"
          variant="confirmation"
        >
          <p className="text-sm text-[var(--color-text-muted)]">
            This session will be removed from your totals.
          </p>
        </AppDialog>
      ) : null}
    </>
  );
}

function SubjectEditor({
  draftSubjects,
  initialSubjectId,
  onAdd,
  onClose,
  onDelete,
  onRestore,
  onSave,
  onUpdate,
  saveError,
  unitEnrollments,
}: {
  draftSubjects: StudySubject[];
  initialSubjectId: string | null;
  onAdd: () => string;
  onClose: () => void;
  onDelete: (subjectId: string) => void;
  onRestore: (subject: StudySubject, index: number) => void;
  onSave: () => void;
  onUpdate: (subjectId: string, updates: Partial<StudySubject>) => void;
  saveError: string | null;
  unitEnrollments: UnitEnrollment[];
}) {
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(
    initialSubjectId,
  );
  const [deletedSubjects, setDeletedSubjects] = useState<
    { index: number; subject: StudySubject }[]
  >([]);
  const [initialSubjectsJson] = useState(() => JSON.stringify(draftSubjects));
  const [initialSubjectIds] = useState(
    () => new Set(draftSubjects.map((subject) => subject.id)),
  );
  const editingSubject =
    draftSubjects.find((subject) => subject.id === editingSubjectId) ?? null;
  const isCreatingSubject = Boolean(
    editingSubject && !initialSubjectIds.has(editingSubject.id),
  );
  const linkedByOtherSubjects = new Set(
    draftSubjects
      .filter((subject) => subject.id !== editingSubjectId)
      .map((subject) => subject.unitOfferingId)
      .filter((offeringId): offeringId is string => Boolean(offeringId)),
  );
  const availableUnitEnrollments = unitEnrollments.filter(
    (enrollment) =>
      !linkedByOtherSubjects.has(enrollment.offeringId) ||
      enrollment.offeringId === editingSubject?.unitOfferingId,
  );
  const lastDeleted = deletedSubjects.at(-1) ?? null;
  const isDirty = JSON.stringify(draftSubjects) !== initialSubjectsJson;

  function addAndEditSubject() {
    setEditingSubjectId(onAdd());
  }

  function deleteSubject(subjectId: string) {
    onDelete(subjectId);
    setEditingSubjectId(null);
  }

  function quickDeleteSubject(subject: StudySubject) {
    const index = draftSubjects.findIndex((item) => item.id === subject.id);
    if (index < 0) return;

    setDeletedSubjects((current) => [...current, { index, subject }]);
    onDelete(subject.id);
  }

  function undoLastDelete() {
    if (!lastDeleted) return;

    onRestore(lastDeleted.subject, lastDeleted.index);
    setDeletedSubjects((current) => current.slice(0, -1));
  }

  return (
    <>
      <AppDialog
        bodyClassName={editingSubject ? "space-y-6 p-5" : "p-0"}
        closeLabel="Close subject editor"
        confirmDiscard={!isCreatingSubject}
        footer={
          <div
            className={cn(
              "flex flex-col gap-2 sm:flex-row",
              editingSubject ? "sm:justify-end" : "sm:justify-between",
            )}
          >
            {editingSubject ? null : (
              <button
                className="mac-focus inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-text)]"
                onClick={addAndEditSubject}
                type="button"
              >
                <Plus aria-hidden size={17} />
                Add subject
              </button>
            )}
            <button
              className="mac-focus inline-flex h-11 items-center justify-center rounded-xl bg-[var(--color-mac-yellow)] px-5 text-sm font-semibold text-[#141414] transition hover:brightness-105 active:scale-[0.99]"
              onClick={onSave}
              type="button"
            >
              Save changes
            </button>
          </div>
        }
        isDirty={isDirty}
        maxWidthClassName="max-w-lg"
        onClose={onClose}
        title={editingSubject ? "Subject details" : "Edit subjects"}
      >
        {saveError ? (
          <p
            className="rounded-lg border border-[rgb(255_107_107/0.3)] bg-[rgb(255_107_107/0.07)] px-3 py-2 text-sm font-medium text-[var(--color-danger)]"
            role="alert"
          >
            {saveError}
          </p>
        ) : null}

        {editingSubject ? (
          <>
            <label className="block text-sm font-medium">
              {editingSubject.unitOfferingId ? "Personal name" : "Name"}
              <input
                className="mac-focus mt-2 h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 font-semibold text-[var(--color-text)] transition hover:border-[rgb(255_255_255/0.15)]"
                data-dialog-autofocus
                maxLength={60}
                onChange={(event) =>
                  onUpdate(editingSubject.id, { name: event.target.value })
                }
                value={editingSubject.name}
              />
            </label>

            <div>
              <p className="mb-2 text-sm font-medium">Linked unit</p>
              <CustomSelect
                ariaLabel={`Linked unit for ${editingSubject.name}`}
                onChange={(offeringId) => {
                  const enrollment = availableUnitEnrollments.find(
                    (item) => item.offeringId === offeringId,
                  );

                  onUpdate(editingSubject.id, {
                    canonicalCode: enrollment?.code,
                    unitOfferingId:
                      offeringId === UNLINKED_UNIT_VALUE ? null : offeringId,
                  });
                }}
                options={[
                  { label: "Not linked", value: UNLINKED_UNIT_VALUE },
                  ...availableUnitEnrollments.map((enrollment) => ({
                    label: `${enrollment.code} · ${enrollment.year} ${getTeachingPeriodLabel(enrollment.period)}`,
                    value: enrollment.offeringId,
                  })),
                ]}
                value={editingSubject.unitOfferingId ?? UNLINKED_UNIT_VALUE}
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Play colour</p>
              <CustomSelect
                ariaLabel={`Play colour for ${editingSubject.name}`}
                onChange={(color) =>
                  onUpdate(editingSubject.id, { color: String(color) })
                }
                options={SUBJECT_COLOR_OPTIONS}
                value={editingSubject.color}
              />
            </div>

            <button
              className="mac-focus inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[rgb(255_107_107/0.35)] bg-[rgb(255_107_107/0.035)] px-3 text-sm font-semibold text-[var(--color-danger)] transition hover:bg-[rgb(255_107_107/0.08)] disabled:opacity-35"
              onClick={() => deleteSubject(editingSubject.id)}
              type="button"
            >
              Delete subject
            </button>
          </>
        ) : (
          <PaginatedList
            className="divide-y divide-[var(--color-border)]"
            items={draftSubjects}
            pageSize={10}
            renderItem={(subject) => (
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
                <div className="flex items-center gap-2">
                  <button
                    className="mac-focus inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.045)] hover:text-[var(--color-text)]"
                    onClick={() => setEditingSubjectId(subject.id)}
                    type="button"
                  >
                    <Pencil aria-hidden size={16} />
                    <span className="sr-only">Edit {subject.name}</span>
                  </button>
                  <button
                    className="mac-focus inline-flex h-11 w-11 items-center justify-center rounded-md border border-[rgb(255_107_107/0.35)] text-[var(--color-danger)] transition hover:bg-[rgb(255_107_107/0.08)] disabled:cursor-not-allowed disabled:opacity-30"
                    onClick={() => quickDeleteSubject(subject)}
                    type="button"
                  >
                    <Trash2 aria-hidden size={16} />
                    <span className="sr-only">Delete {subject.name}</span>
                  </button>
                </div>
              </div>
            )}
            resetKey="subject-editor"
          />
        )}
      </AppDialog>

      {lastDeleted ? (
        <TransientToast
          actionLabel="Undo"
          durationMs={6000}
          key={lastDeleted.subject.id}
          message={`${lastDeleted.subject.name} removed`}
          onAction={undoLastDelete}
          onDismiss={() => setDeletedSubjects([])}
        />
      ) : null}
    </>
  );
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60 * 1000,
  );
  return localDate.toISOString().slice(0, 16);
}

function formatSessionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatSessionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
  }).format(date);
}

function normalizeSubjects(subjects: StoredSubject[] | undefined) {
  const source: StoredSubject[] = subjects?.length
    ? subjects
    : defaultStudySubjects;
  const cleaned = source
    .map((subject, index) => ({
      ...subject,
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

function makeSubjectId() {
  return `subject-${crypto.randomUUID()}`;
}
