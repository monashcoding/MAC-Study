type CompletedSession = {
  subjectId: string | null;
  startedAt: string;
  endedAt: string;
};

export const STUDY_TIME_ZONE = "Australia/Sydney";

const australianDateTimeFormatter = new Intl.DateTimeFormat("en-AU", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: STUDY_TIME_ZONE,
  year: "numeric",
});

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
  const parts = getAustralianDateTimeParts(date);

  return `${parts.year}-${`${parts.month}`.padStart(2, "0")}-${`${parts.day}`.padStart(2, "0")}`;
}

export function addDateKeyDays(dateKey: string, days: number) {
  const { day, month, year } = parseDateKey(dateKey);
  const next = new Date(Date.UTC(year, month - 1, day + days));

  return [
    next.getUTCFullYear(),
    `${next.getUTCMonth() + 1}`.padStart(2, "0"),
    `${next.getUTCDate()}`.padStart(2, "0"),
  ].join("-");
}

export function getAustralianDayRange(date = new Date()) {
  const dateKey = getLocalDateKey(date);

  return {
    end: getAustralianDateStart(addDateKeyDays(dateKey, 1)),
    start: getAustralianDateStart(dateKey),
  };
}

export function getAustralianDateStart(dateKey: string) {
  const { day, month, year } = parseDateKey(dateKey);
  const desiredWallClock = Date.UTC(year, month - 1, day);
  let candidate = desiredWallClock;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getAustralianDateTimeParts(new Date(candidate));
    const representedWallClock = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const adjustment = desiredWallClock - representedWallClock;

    candidate += adjustment;
    if (!adjustment) break;
  }

  return new Date(candidate);
}

export function getIntervalOverlapSeconds(
  intervalStart: Date | string,
  intervalEnd: Date | string,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const start = Math.max(
    new Date(intervalStart).getTime(),
    rangeStart.getTime(),
  );
  const end = Math.min(new Date(intervalEnd).getTime(), rangeEnd.getTime());

  return Math.max(0, Math.floor((end - start) / 1000));
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

function getAustralianDateTimeParts(date: Date) {
  const values = Object.fromEntries(
    australianDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    month: values.month,
    second: values.second,
    year: values.year,
  };
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);

  return { day, month, year };
}
