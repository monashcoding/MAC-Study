"use client";

export type OptimisticStudySession = {
  groupId?: string | null;
  startedAt: string;
  subjectId: string | null;
} | null;

const STUDY_SESSION_EVENT = "mac-study-session-change";

// Broadcast a local start/stop before the server confirms, so every mounted
// view (sidebar timer, group cards) updates in the same frame.
export function emitStudySessionChange(session: OptimisticStudySession) {
  window.dispatchEvent(
    new CustomEvent<OptimisticStudySession>(STUDY_SESSION_EVENT, {
      detail: session,
    }),
  );
}

export function onStudySessionChange(
  listener: (session: OptimisticStudySession) => void,
) {
  const handler = (event: Event) => {
    listener((event as CustomEvent<OptimisticStudySession>).detail);
  };

  window.addEventListener(STUDY_SESSION_EVENT, handler);
  return () => window.removeEventListener(STUDY_SESSION_EVENT, handler);
}
