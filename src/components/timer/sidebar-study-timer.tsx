"use client";

import { useEffect, useRef, useState } from "react";
import { Square } from "lucide-react";
import {
  cacheRemoteTimerState,
  dedupeRemoteRequest,
  getCachedRemoteTimerState,
  subscribeToRemoteTableChanges,
} from "@/lib/client-cache";
import {
  fetchRemoteTimerState,
  stopRemoteStudySession,
  type RemoteTimerState,
} from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  emitStudySessionChange,
  onStudySessionChange,
  type OptimisticStudySession,
} from "@/lib/study-session-events";
import {
  addDateKeyDays,
  formatDuration,
  getAustralianDateStart,
  getElapsedSeconds,
  getIntervalOverlapSeconds,
  getLocalDateKey,
} from "@/lib/timer";

const TIMER_TABLES = new Set(["study_sessions", "subjects"]);

// Desktop sidebar mini-timer: only renders while a session is running.
export function SidebarStudyTimer({ userId }: { userId: string }) {
  const [timerState, setTimerState] = useState<RemoteTimerState | null>(() =>
    getCachedRemoteTimerState(userId),
  );
  // A local start/stop that the server has not confirmed yet.
  // `undefined` means no pending change: trust the server state.
  const [pendingSession, setPendingSession] = useState<
    OptimisticStudySession | undefined
  >(undefined);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const isStoppingRef = useRef(false);
  const activeSession =
    pendingSession !== undefined
      ? pendingSession
      : (timerState?.activeSession ?? null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const next = await loadTimerState(userId);
      if (cancelled || !next) return;

      setTimerState(next);
      // Drop the local override once the server agrees with it.
      setPendingSession((pending) =>
        pending !== undefined &&
        Boolean(pending) === Boolean(next.activeSession)
          ? undefined
          : pending,
      );
    };

    void load();
    const unsubscribeTables = subscribeToRemoteTableChanges((table) => {
      if (TIMER_TABLES.has(table)) void load();
    });
    const unsubscribeLocal = onStudySessionChange((session) => {
      setPendingSession(session);
      setNow(new Date());
      if (session) setError(null);
    });

    return () => {
      cancelled = true;
      unsubscribeTables();
      unsubscribeLocal();
    };
  }, [userId]);

  useEffect(() => {
    if (!activeSession) return;

    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, [activeSession]);

  if (!activeSession) {
    return error ? (
      <p
        className="mb-3 rounded-lg border border-[rgb(255_255_255/0.08)] p-3 text-xs text-[var(--color-danger)]"
        role="status"
      >
        {error}
      </p>
    ) : null;
  }

  const subject = timerState?.subjects.find(
    (item) => item.id === activeSession.subjectId,
  );
  const elapsed = getElapsedSeconds(activeSession.startedAt, now);
  const todayKey = getLocalDateKey(now);
  const todayStart = getAustralianDateStart(todayKey);
  const todayEnd = getAustralianDateStart(addDateKeyDays(todayKey, 1));
  const todayTotal = [
    ...(timerState?.sessions ?? []),
    { startedAt: activeSession.startedAt, endedAt: now.toISOString() },
  ].reduce(
    (total, session) =>
      total +
      getIntervalOverlapSeconds(
        session.startedAt,
        session.endedAt,
        todayStart,
        todayEnd,
      ),
    0,
  );

  async function stop() {
    if (isStoppingRef.current || !activeSession) return;

    const stoppingSession = activeSession;
    isStoppingRef.current = true;
    setError(null);
    emitStudySessionChange(null);

    try {
      await stopRemoteStudySession(createSupabaseBrowserClient());
    } catch {
      emitStudySessionChange({
        groupId: stoppingSession.groupId ?? null,
        startedAt: stoppingSession.startedAt,
        subjectId: stoppingSession.subjectId,
      });
      setError("Couldn't stop. Try again.");
    } finally {
      isStoppingRef.current = false;
    }
  }

  return (
    <section
      aria-label="Current study session"
      className="mb-3 rounded-lg border border-[rgb(255_122_0/0.28)] bg-[rgb(255_122_0/0.06)] p-3"
    >
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-xs font-medium text-[#ff9a3d]">
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#ff7a00] motion-reduce:animate-none"
            />
            <span className="truncate">{subject?.name ?? "Studying"}</span>
          </span>
          <span
            aria-live="off"
            className="mt-1 block font-mono text-xl font-semibold tabular-nums tracking-tight text-[var(--color-text)]"
          >
            {formatDuration(elapsed)}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
            Today{" "}
            <span className="font-mono font-semibold tabular-nums text-[var(--color-text)]">
              {formatDuration(todayTotal)}
            </span>
          </span>
        </span>
        <button
          aria-label="Stop studying"
          className="mac-focus flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#ff7a00] text-[#141414] transition hover:bg-[#ff8f26] active:scale-95"
          onClick={() => void stop()}
          title="Stop studying"
          type="button"
        >
          <Square aria-hidden fill="currentColor" size={14} />
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-[var(--color-danger)]" role="status">
          {error}
        </p>
      ) : null}
    </section>
  );
}

async function loadTimerState(userId: string) {
  try {
    const supabase = createSupabaseBrowserClient();
    const next = await dedupeRemoteRequest({
      key: "timer",
      load: () => fetchRemoteTimerState(supabase),
      userId,
    });

    if (next) cacheRemoteTimerState(next);
    return next;
  } catch {
    // Keep the last known state; the next table change retries.
    return null;
  }
}
