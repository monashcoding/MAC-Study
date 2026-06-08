"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, Clock, PieChart } from "lucide-react";
import { subjects as defaultSubjects } from "@/lib/demo-data";
import {
  cacheRemoteTimerState,
  getCachedRemoteTimerState,
} from "@/lib/client-cache";
import { fetchRemoteTimerState } from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  formatDuration,
  getElapsedSeconds,
  getLocalDateKey,
  getSessionSeconds,
} from "@/lib/timer";

const TIMER_STORAGE_KEY = "mac-study-demo-state";

type StudySubject = {
  id: string;
  name: string;
  color: string;
};

type StoredSession = {
  id: string;
  subjectId: string | null;
  startedAt: string;
  endedAt: string;
  status: "completed" | "needs_confirmation";
  source: "timer";
};

type ActiveSession = {
  subjectId: string | null;
  startedAt: string;
};

type StoredTimerState = {
  activeSession?: ActiveSession | null;
  sessions?: StoredSession[];
  subjects?: Partial<StudySubject>[];
};

const fallbackSubjects = defaultSubjects.map((subject) => ({
  id: subject.id,
  name: subject.code,
  color: subject.color,
})) satisfies StudySubject[];

const fallbackSubjectTotals: Record<string, number> = {
  fit3159: 2 * 60 * 60 + 20 * 60,
  fit3077: 74 * 60,
  fit2004: 52 * 60,
};

export function StatisticsDashboard() {
  const [subjects, setSubjects] = useState<StudySubject[]>(fallbackSubjects);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(
    null,
  );
  const [now, setNow] = useState(() => new Date());
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      const cachedRemoteState = getCachedRemoteTimerState();

      if (cachedRemoteState) {
        setSubjects(cachedRemoteState.subjects);
        setSessions(cachedRemoteState.sessions);
        setActiveSession(cachedRemoteState.activeSession);
        setIsLoaded(true);
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const remoteState = await fetchRemoteTimerState(supabase);

        if (!cancelled && remoteState) {
          cacheRemoteTimerState(remoteState);
          setSubjects(remoteState.subjects);
          setSessions(remoteState.sessions);
          setActiveSession(remoteState.activeSession);
          setIsLoaded(true);
          return;
        }
      } catch {
        // Fall through to local stats.
      }

      if (cachedRemoteState) {
        return;
      }

      if (!cancelled) {
        const parsed = loadLocalTimerState();

        if (parsed) {
          setSubjects(normalizeSubjects(parsed.subjects));
          setSessions(Array.isArray(parsed.sessions) ? parsed.sessions : []);
          setActiveSession(parsed.activeSession ?? null);
        }

        setIsLoaded(true);
      }
    }

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(interval);
  }, []);

  const stats = useMemo(
    () => buildStats({ activeSession, now, sessions }),
    [activeSession, now, sessions],
  );
  const hasTimerData = isLoaded && (sessions.length > 0 || activeSession);
  const subjectTotals = hasTimerData
    ? stats.subjectTotals
    : fallbackSubjectTotals;
  const summary = hasTimerData
    ? stats.summary
    : {
        today: 84 * 60,
        week: 9 * 60 * 60 + 20 * 60,
        month: 34 * 60 * 60 + 10 * 60,
        allTime: Object.values(fallbackSubjectTotals).reduce(
          (total, seconds) => total + seconds,
          0,
        ),
      };
  const subjectRows = subjects
    .map((subject) => ({
      ...subject,
      seconds: subjectTotals[subject.id] ?? 0,
    }))
    .filter((subject) => subject.seconds > 0)
    .sort((first, second) => second.seconds - first.seconds);
  const subjectTotal = subjectRows.reduce(
    (total, subject) => total + subject.seconds,
    0,
  );
  const topSubject = subjectRows[0];
  const pieGradient = makePieGradient(subjectRows, subjectTotal);

  return (
    <div className="space-y-6 pt-1">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryTile
          icon={Clock}
          label="Today"
          value={formatDuration(summary.today)}
        />
        <SummaryTile
          icon={CalendarDays}
          label="Week"
          value={formatDuration(summary.week)}
        />
        <SummaryTile
          icon={BarChart3}
          label="Month"
          value={formatDuration(summary.month)}
        />
        <SummaryTile
          icon={PieChart}
          label="All time"
          value={formatDuration(summary.allTime)}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex items-center justify-center py-2">
          <div
            aria-label="Subject study split"
            className="relative h-52 w-52 rounded-full shadow-[0_18px_42px_rgb(0_0_0/0.28)]"
            role="img"
            style={{ background: pieGradient }}
          >
            <div className="absolute inset-12 flex flex-col items-center justify-center rounded-full bg-[var(--color-background)] text-center">
              <p className="font-mono text-lg font-semibold tabular-nums">
                {formatDuration(subjectTotal)}
              </p>
              <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">
                subject time
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Subject split</h2>
              <p className="mt-1 text-sm font-medium text-[var(--color-text-muted)]">
                {topSubject ? `${topSubject.name} is leading.` : "No time yet."}
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            {subjectRows.length ? (
              subjectRows.map((subject) => {
                const percent = subjectTotal
                  ? (subject.seconds / subjectTotal) * 100
                  : 0;

                return (
                  <div
                    className="rounded-md bg-[rgb(255_255_255/0.035)] p-3"
                    key={subject.id}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: subject.color }}
                        />
                        <p className="truncate font-semibold">{subject.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-semibold tabular-nums">
                          {formatDuration(subject.seconds)}
                        </p>
                        <p className="text-xs font-medium text-[var(--color-text-muted)]">
                          {Math.round(percent)}%
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface)]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          backgroundColor: subject.color,
                          width: `${Math.max(4, percent)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="rounded-md bg-[rgb(255_255_255/0.035)] p-4 text-sm text-[var(--color-text-muted)]">
                Start a session to fill your study split.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <InsightTile
          label="Daily average"
          value={formatDuration(Math.floor(summary.week / 7))}
        />
        <InsightTile
          label="Month pace"
          value={formatDuration(Math.floor(summary.month / 4))}
        />
        <InsightTile
          label="Focus"
          value={topSubject ? topSubject.name : "None"}
        />
      </section>
    </div>
  );
}

function loadLocalTimerState() {
  const saved = window.localStorage.getItem(TIMER_STORAGE_KEY);

  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved) as StoredTimerState;
  } catch {
    return null;
  }
}

function SummaryTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-4">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414]">
        <Icon aria-hidden size={17} />
      </div>
      <p className="font-mono text-base font-semibold tabular-nums sm:text-lg">
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </p>
    </div>
  );
}

function InsightTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[rgb(255_255_255/0.035)] p-3">
      <p className="truncate text-lg font-semibold">{value}</p>
      <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </p>
    </div>
  );
}

function buildStats({
  activeSession,
  now,
  sessions,
}: {
  activeSession: ActiveSession | null;
  now: Date;
  sessions: StoredSession[];
}) {
  const todayKey = getLocalDateKey(now);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const summary = {
    today: 0,
    week: 0,
    month: 0,
    allTime: 0,
  };
  const subjectTotals: Record<string, number> = {};

  for (const session of sessions) {
    const endedAt = new Date(session.endedAt);
    const seconds = getSessionSeconds(session);

    summary.allTime += seconds;

    if (session.subjectId) {
      subjectTotals[session.subjectId] =
        (subjectTotals[session.subjectId] ?? 0) + seconds;
    }

    if (getLocalDateKey(endedAt) === todayKey) {
      summary.today += seconds;
    }

    if (endedAt >= weekStart) {
      summary.week += seconds;
    }

    if (endedAt >= monthStart) {
      summary.month += seconds;
    }
  }

  if (activeSession) {
    const startedAt = new Date(activeSession.startedAt);
    const activeSeconds = getElapsedSeconds(activeSession.startedAt, now);

    summary.allTime += activeSeconds;

    if (activeSession.subjectId) {
      subjectTotals[activeSession.subjectId] =
        (subjectTotals[activeSession.subjectId] ?? 0) + activeSeconds;
    }

    if (getLocalDateKey(startedAt) === todayKey) {
      summary.today += activeSeconds;
    }

    if (startedAt >= weekStart) {
      summary.week += activeSeconds;
    }

    if (startedAt >= monthStart) {
      summary.month += activeSeconds;
    }
  }

  return { subjectTotals, summary };
}

function normalizeSubjects(value: StoredTimerState["subjects"]) {
  if (!Array.isArray(value) || !value.length) {
    return fallbackSubjects;
  }

  const normalized = value
    .map((subject, index) => ({
      id: subject.id || fallbackSubjects[index]?.id || `subject-${index}`,
      name:
        subject.name || fallbackSubjects[index]?.name || `Subject ${index + 1}`,
      color: subject.color || fallbackSubjects[index]?.color || "#FFE330",
    }))
    .filter((subject) => subject.name);

  return normalized.length ? normalized : fallbackSubjects;
}

function makePieGradient(
  subjects: (StudySubject & { seconds: number })[],
  totalSeconds: number,
) {
  if (!subjects.length || totalSeconds <= 0) {
    return "var(--color-surface)";
  }

  let cursor = 0;
  const stops = subjects.map((subject) => {
    const start = cursor;
    cursor += (subject.seconds / totalSeconds) * 100;

    return `${subject.color} ${start}% ${cursor}%`;
  });

  return `conic-gradient(${stops.join(", ")})`;
}
