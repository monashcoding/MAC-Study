type CompletedSession = {
  subjectId: string | null;
  startedAt: string;
  endedAt: string;
};

export function getElapsedSeconds(startedAt: string, now = new Date()) {
  const started = new Date(startedAt).getTime();
  return Math.max(0, Math.floor((now.getTime() - started) / 1000));
}

export function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":");
}

export function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getSessionSeconds(session: CompletedSession) {
  const started = new Date(session.startedAt).getTime();
  const ended = new Date(session.endedAt).getTime();

  return Math.max(0, Math.floor((ended - started) / 1000));
}

export function sumCompletedSeconds(sessions: CompletedSession[]) {
  return sessions.reduce(
    (total, session) => total + getSessionSeconds(session),
    0,
  );
}

export function groupSessionsBySubject(sessions: CompletedSession[]) {
  return sessions.reduce<Record<string, number>>((totals, session) => {
    if (!session.subjectId) {
      return totals;
    }

    totals[session.subjectId] =
      (totals[session.subjectId] ?? 0) + getSessionSeconds(session);

    return totals;
  }, {});
}

export function isLongSession(startedAt: string, now = new Date()) {
  return getElapsedSeconds(startedAt, now) >= 6 * 60 * 60;
}
