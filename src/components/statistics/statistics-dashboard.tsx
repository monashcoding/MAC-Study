"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays } from "lucide-react";
import { subjects as defaultSubjects } from "@/lib/demo-data";
import {
  cacheRemoteTimerState,
  getCachedRemoteTimerState,
} from "@/lib/client-cache";
import { fetchRemoteTimerState } from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getElapsedSeconds, getSessionSeconds } from "@/lib/timer";

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

type StatsPeriod = "week" | "month" | "annual";
type ChartView = "column" | "pie";

type StudyEntry = {
  date: Date;
  seconds: number;
  subjectId: string | null;
};

type ChartBucket = {
  label: string;
  shortLabel?: string;
  seconds: number;
  start: Date;
  end: Date;
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

const periodOptions = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "annual", label: "Year" },
] satisfies { id: StatsPeriod; label: string }[];

const chartOptions = [
  { id: "column", label: "Column graph" },
  { id: "pie", label: "Pie chart" },
] satisfies { id: ChartView; label: string }[];

export function StatisticsDashboard() {
  const [subjects, setSubjects] = useState<StudySubject[]>(fallbackSubjects);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(
    null,
  );
  const [now, setNow] = useState(() => new Date());
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriod>("week");
  const [chartView, setChartView] = useState<ChartView>("column");

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

  const hasTimerData = isLoaded && (sessions.length > 0 || activeSession);
  const stats = useMemo(
    () =>
      buildPeriodStats({
        activeSession,
        now,
        period: selectedPeriod,
        sessions,
      }),
    [activeSession, now, selectedPeriod, sessions],
  );
  const subjectTotals = hasTimerData
    ? stats.subjectTotals
    : fallbackSubjectTotals;
  const totalSeconds = hasTimerData
    ? stats.totalSeconds
    : Object.values(fallbackSubjectTotals).reduce(
        (total, seconds) => total + seconds,
        0,
      );
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
  const average = getAverageStat(selectedPeriod, totalSeconds, stats.buckets);
  const periodLabel =
    periodOptions.find((period) => period.id === selectedPeriod)?.label ??
    "Week";

  return (
    <div className="space-y-6 pt-1 lg:pt-0">
      <section className="rounded-md bg-[rgb(255_255_255/0.04)] p-3 lg:border lg:border-[rgb(255_255_255/0.07)] lg:p-5">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <label className="block">
            <span className="sr-only">Statistics period</span>
            <select
              className="mac-focus h-9 w-full rounded-md border border-[rgb(255_255_255/0.10)] bg-[#2b2b2b] px-3 text-sm font-semibold text-[var(--color-text)] outline-none [color-scheme:dark]"
              onChange={(event) =>
                setSelectedPeriod(event.target.value as StatsPeriod)
              }
              value={selectedPeriod}
            >
              {periodOptions.map((period) => (
                <option
                  className="bg-[#2b2b2b] text-[#f7f7f2]"
                  key={period.id}
                  value={period.id}
                >
                  {period.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 rounded-md bg-[rgb(255_255_255/0.045)] p-1 sm:w-64">
            {chartOptions.map((option) => (
              <button
                className={`mac-focus h-8 rounded text-[11px] font-semibold transition sm:text-xs ${
                  chartView === option.id
                    ? "bg-[var(--color-mac-yellow)] text-[#141414]"
                    : "text-[var(--color-text-muted)]"
                }`}
                key={option.id}
                onClick={() => setChartView(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <div>
            <p className="text-sm font-semibold text-[var(--color-mac-yellow)]">
              {periodLabel}
            </p>
            <h2 className="mt-1 text-4xl font-semibold leading-none tracking-normal lg:text-5xl">
              {formatRoundedStudyTime(totalSeconds)}
            </h2>
            <p className="mt-2 text-sm font-medium text-[var(--color-text-muted)]">
              Avg {average.label}: {formatRoundedStudyTime(average.seconds)}
            </p>
          </div>
        </div>
      </section>

      {chartView === "column" ? (
        <ColumnChart
          buckets={stats.buckets}
          icon={selectedPeriod === "week" ? CalendarDays : BarChart3}
          title={getChartTitle(selectedPeriod)}
        />
      ) : (
        <SubjectSplit
          pieGradient={pieGradient}
          subjectRows={subjectRows}
          subjectTotal={subjectTotal}
          topSubject={topSubject}
        />
      )}
    </div>
  );
}

function SubjectSplit({
  pieGradient,
  subjectRows,
  subjectTotal,
  topSubject,
}: {
  pieGradient: string;
  subjectRows: (StudySubject & { seconds: number })[];
  subjectTotal: number;
  topSubject?: StudySubject & { seconds: number };
}) {
  return (
    <section className="grid gap-5 rounded-md bg-[rgb(255_255_255/0.035)] p-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:border lg:border-[rgb(255_255_255/0.07)] lg:p-6">
      <div className="flex items-center justify-center">
        <div
          aria-label="Subject study split"
          className="relative h-44 w-44 rounded-full shadow-[0_18px_42px_rgb(0_0_0/0.28)] lg:h-52 lg:w-52"
          role="img"
          style={{ background: pieGradient }}
        >
          <div className="absolute inset-10 flex flex-col items-center justify-center rounded-full bg-[var(--color-background)] text-center lg:inset-12">
            <p className="text-base font-semibold">
              {formatRoundedStudyTime(subjectTotal)}
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
            <h2 className="text-lg font-semibold">Subject split</h2>
            <p className="mt-1 text-sm font-medium text-[var(--color-text-muted)]">
              {topSubject ? `${topSubject.name} leads.` : "No time yet."}
            </p>
          </div>
        </div>

        <div className="grid gap-1.5">
          {subjectRows.length ? (
            subjectRows.map((subject) => {
              const percent = subjectTotal
                ? (subject.seconds / subjectTotal) * 100
                : 0;

              return (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-[rgb(255_255_255/0.035)] px-2.5 py-2"
                  key={subject.id}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: subject.color }}
                      />
                      <p className="truncate text-sm font-semibold">
                        {subject.name}
                      </p>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--color-surface)]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          backgroundColor: subject.color,
                          width: `${Math.max(4, percent)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {formatRoundedStudyTime(subject.seconds)}
                    </p>
                    <p className="text-xs font-medium text-[var(--color-text-muted)]">
                      {Math.round(percent)}%
                    </p>
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

function ColumnChart({
  buckets,
  icon: Icon,
  title,
}: {
  buckets: ChartBucket[];
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  title: string;
}) {
  const maxSeconds = Math.max(...buckets.map((bucket) => bucket.seconds), 1);
  const scaleMaxSeconds = getNiceScaleMax(maxSeconds);
  const yTicks = [scaleMaxSeconds, scaleMaxSeconds / 2, 0];

  return (
    <section className="rounded-md bg-[rgb(255_255_255/0.035)] p-3 lg:border lg:border-[rgb(255_255_255/0.07)] lg:p-5">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[rgb(255_227_48/0.12)] text-[var(--color-mac-yellow)]">
          <Icon aria-hidden size={15} />
        </span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>

      <div className="mt-3 grid grid-cols-[1.75rem_minmax(0,1fr)] gap-1 sm:grid-cols-[2rem_minmax(0,1fr)]">
        <div className="relative h-32 lg:h-52">
          {yTicks.map((tick) => (
            <p
              className="absolute left-0 translate-y-1/2 text-left text-[10px] font-medium leading-none text-[var(--color-text-muted)]"
              key={tick}
              style={{ bottom: `${(tick / scaleMaxSeconds) * 100}%` }}
            >
              {formatAxisTick(tick)}
            </p>
          ))}
        </div>

        <div className="min-w-0">
          <div className="relative h-32 lg:h-52">
            {yTicks.map((tick) => (
              <div
                aria-hidden
                className="absolute left-0 right-0 border-t border-[rgb(255_255_255/0.08)]"
                key={tick}
                style={{ bottom: `${(tick / scaleMaxSeconds) * 100}%` }}
              />
            ))}

            <div className="absolute inset-0 flex items-end gap-1.5">
              {buckets.map((bucket) => {
                const height = bucket.seconds
                  ? Math.max(3, (bucket.seconds / scaleMaxSeconds) * 100)
                  : 0;

                return (
                  <div
                    className="flex min-w-0 flex-1 flex-col justify-end"
                    key={`${bucket.label}-${bucket.start.toISOString()}`}
                  >
                    <div
                      aria-label={`${bucket.label}: ${formatRoundedStudyTime(bucket.seconds)}`}
                      className="w-full rounded-t bg-[var(--color-mac-yellow)]"
                      style={{ height: `${height}%` }}
                      title={formatRoundedStudyTime(bucket.seconds)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-2 flex gap-1.5">
            {buckets.map((bucket) => (
              <div
                className="min-w-0 flex-1"
                key={`${bucket.label}-${bucket.start.toISOString()}-label`}
              >
                <p className="text-center text-[10px] font-medium leading-none text-[var(--color-text-muted)] sm:text-[11px]">
                  <span className="sm:hidden">
                    {bucket.shortLabel ?? bucket.label}
                  </span>
                  <span className="hidden sm:inline">{bucket.label}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function formatRoundedStudyTime(totalSeconds: number) {
  const minutes = Math.round(totalSeconds / 60);

  if (minutes <= 0) {
    return "0 min";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatAxisTick(totalSeconds: number) {
  if (totalSeconds <= 0) {
    return "0";
  }

  const minutes = Math.round(totalSeconds / 60);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = minutes / 60;

  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function getNiceScaleMax(maxSeconds: number) {
  const maxMinutes = Math.max(15, Math.ceil(maxSeconds / 60));
  const candidates = [
    15, 30, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720, 960, 1200, 1440,
  ];
  const candidate = candidates.find((value) => value >= maxMinutes);

  return (candidate ?? Math.ceil(maxMinutes / 240) * 240) * 60;
}

function buildPeriodStats({
  activeSession,
  now,
  period,
  sessions,
}: {
  activeSession: ActiveSession | null;
  now: Date;
  period: StatsPeriod;
  sessions: StoredSession[];
}) {
  const { end, start } = getPeriodRange(period, now);
  const entries = getStudyEntries({ activeSession, now, sessions }).filter(
    (entry) => entry.date >= start && entry.date < end,
  );
  const buckets = buildBuckets(period, now);
  const totalSeconds = entries.reduce(
    (total, entry) => total + entry.seconds,
    0,
  );
  const subjectTotals: Record<string, number> = {};

  for (const entry of entries) {
    if (entry.subjectId) {
      subjectTotals[entry.subjectId] =
        (subjectTotals[entry.subjectId] ?? 0) + entry.seconds;
    }

    const bucket = buckets.find(
      (item) => entry.date >= item.start && entry.date < item.end,
    );

    if (bucket) {
      bucket.seconds += entry.seconds;
    }
  }

  return { buckets, subjectTotals, totalSeconds };
}

function getStudyEntries({
  activeSession,
  now,
  sessions,
}: {
  activeSession: ActiveSession | null;
  now: Date;
  sessions: StoredSession[];
}) {
  const entries: StudyEntry[] = sessions.map((session) => ({
    date: new Date(session.endedAt),
    seconds: getSessionSeconds(session),
    subjectId: session.subjectId,
  }));

  if (activeSession) {
    entries.push({
      date: new Date(activeSession.startedAt),
      seconds: getElapsedSeconds(activeSession.startedAt, now),
      subjectId: activeSession.subjectId,
    });
  }

  return entries;
}

function getPeriodRange(period: StatsPeriod, now: Date) {
  if (period === "week") {
    const start = startOfDay(now);
    start.setDate(now.getDate() - 6);

    return { start, end: addDays(startOfDay(now), 1) };
  }

  if (period === "month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }

  if (period === "annual") {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear() + 1, 0, 1),
    };
  }

  return {
    start: new Date(now.getFullYear(), 0, 1),
    end: new Date(now.getFullYear() + 1, 0, 1),
  };
}

function buildBuckets(period: StatsPeriod, now: Date): ChartBucket[] {
  if (period === "week") {
    const { start } = getPeriodRange(period, now);

    return Array.from({ length: 7 }, (_, index) => {
      const bucketStart = addDays(start, index);

      return {
        label: bucketStart.toLocaleDateString(undefined, { weekday: "short" }),
        shortLabel: bucketStart.toLocaleDateString(undefined, {
          weekday: "narrow",
        }),
        seconds: 0,
        start: bucketStart,
        end: addDays(bucketStart, 1),
      };
    });
  }

  if (period === "month") {
    const { end, start } = getPeriodRange(period, now);
    const buckets: ChartBucket[] = [];
    let cursor = new Date(start);
    let week = 1;

    while (cursor < end) {
      const bucketStart = new Date(cursor);
      const bucketEnd = minDate(addDays(bucketStart, 7), end);

      buckets.push({
        label: `W${week}`,
        shortLabel: `${week}`,
        seconds: 0,
        start: bucketStart,
        end: bucketEnd,
      });

      cursor = bucketEnd;
      week += 1;
    }

    return buckets;
  }

  if (period === "annual") {
    return Array.from({ length: 12 }, (_, month) => {
      const bucketStart = new Date(now.getFullYear(), month, 1);

      return {
        label: bucketStart.toLocaleDateString(undefined, { month: "short" }),
        shortLabel: bucketStart.toLocaleDateString(undefined, {
          month: "narrow",
        }),
        seconds: 0,
        start: bucketStart,
        end: new Date(now.getFullYear(), month + 1, 1),
      };
    });
  }

  return Array.from({ length: 12 }, (_, month) => {
    const bucketStart = new Date(now.getFullYear(), month, 1);

    return {
      label: bucketStart.toLocaleDateString(undefined, { month: "short" }),
      shortLabel: bucketStart.toLocaleDateString(undefined, {
        month: "narrow",
      }),
      seconds: 0,
      start: bucketStart,
      end: new Date(now.getFullYear(), month + 1, 1),
    };
  });
}

function getAverageStat(
  period: StatsPeriod,
  totalSeconds: number,
  buckets: ChartBucket[],
) {
  if (period === "month") {
    return {
      label: "per week",
      seconds: Math.floor(totalSeconds / Math.max(1, buckets.length)),
    };
  }

  if (period === "annual") {
    return { label: "per month", seconds: Math.floor(totalSeconds / 12) };
  }

  return { label: "per day", seconds: Math.floor(totalSeconds / 7) };
}

function getChartTitle(period: StatsPeriod) {
  if (period === "month") {
    return "Weekly breakdown";
  }

  if (period === "annual") {
    return "Monthly breakdown";
  }

  return "Daily breakdown";
}

function startOfDay(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  return start;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);

  return next;
}

function minDate(first: Date, second: Date) {
  return first < second ? first : second;
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
