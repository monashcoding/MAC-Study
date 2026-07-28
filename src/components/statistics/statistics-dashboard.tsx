"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays } from "lucide-react";
import { PaginatedList } from "@/components/paginated-list";
import { StudyHeatmap } from "@/components/study-heatmap";
import {
  cacheRemoteTimerState,
  getCachedRemoteTimerState,
} from "@/lib/client-cache";
import { fetchRemoteTimerState } from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  getElapsedSeconds,
  getLocalDateKey,
  getSessionSeconds,
} from "@/lib/timer";

const TIMER_STORAGE_KEY = "mac-study-demo-state";
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_SHORT_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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
  source: "manual_adjustment" | "timer";
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

type StatsPeriod = "day" | "week" | "month" | "annual";
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

const fallbackSubjects: StudySubject[] = [];

const fallbackSubjectTotals: Record<string, number> = {};

const periodOptions = [
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
  { id: "annual", label: "Annual" },
] satisfies { id: StatsPeriod; label: string }[];

const chartOptions = [
  { id: "column", label: "Activity" },
  { id: "pie", label: "Subjects" },
] satisfies { id: ChartView; label: string }[];

export function StatisticsDashboard() {
  const [subjects, setSubjects] = useState<StudySubject[]>(fallbackSubjects);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(
    null,
  );
  const [now, setNow] = useState(() => new Date());
  const [isLoaded, setIsLoaded] = useState(false);
  const [useDemoData, setUseDemoData] = useState(false);
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
        setUseDemoData(false);
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
          setUseDemoData(false);
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
          setUseDemoData(false);
        } else {
          setUseDemoData(true);
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

  const stats = useMemo(() => {
    const periodStats = buildPeriodStats({
      activeSession,
      now,
      period: selectedPeriod,
      sessions,
    });

    return isLoaded && useDemoData
      ? buildDemoPeriodStats(selectedPeriod, now)
      : periodStats;
  }, [activeSession, isLoaded, now, selectedPeriod, sessions, useDemoData]);
  const subjectTotals = stats.subjectTotals;
  const totalSeconds = stats.totalSeconds;
  const subjectRows = subjects
    .map((subject) => ({
      ...subject,
      seconds: subjectTotals[subject.id] ?? 0,
    }))
    .filter((subject) => subject.seconds > 0);
  const assignedSubjectSeconds = subjectRows.reduce(
    (total, subject) => total + subject.seconds,
    0,
  );
  const generalSeconds = Math.max(0, totalSeconds - assignedSubjectSeconds);

  if (generalSeconds > 0) {
    subjectRows.push({
      color: "#9A9A92",
      id: "general-study",
      name: "General",
      seconds: generalSeconds,
    });
  }

  subjectRows.sort((first, second) => second.seconds - first.seconds);
  const subjectTotal = subjectRows.reduce(
    (total, subject) => total + subject.seconds,
    0,
  );
  const topSubject = subjectRows[0];
  const pieGradient = makePieGradient(subjectRows, subjectTotal);
  const average = getAverageStat(selectedPeriod, totalSeconds, stats.buckets);
  const showAverage = average.seconds >= 60;
  const dailyStudySeconds = useMemo(
    () =>
      isLoaded && useDemoData
        ? buildDemoDailyStudySeconds(now)
        : buildDailyStudySeconds({ activeSession, now, sessions }),
    [activeSession, isLoaded, now, sessions, useDemoData],
  );

  return (
    <div className="space-y-5 pt-1 lg:pt-0">
      <section className="border-b border-[rgb(255_255_255/0.08)] pb-5">
        <div
          aria-label="Statistics period"
          className="grid grid-cols-4 gap-1.5 sm:gap-2"
          role="group"
        >
          {periodOptions.map((period) => {
            const active = selectedPeriod === period.id;

            return (
              <button
                aria-pressed={active}
                className={`mac-focus h-11 rounded-md border text-xs font-semibold transition active:scale-[0.98] sm:text-sm ${
                  active
                    ? "border-[var(--color-mac-yellow)] bg-[var(--color-mac-yellow)] text-[#141414]"
                    : "border-[rgb(255_255_255/0.1)] bg-transparent text-[var(--color-text-muted)] hover:border-[rgb(255_255_255/0.2)] hover:text-[var(--color-text)]"
                }`}
                key={period.id}
                onClick={() => setSelectedPeriod(period.id)}
                type="button"
              >
                {period.label}
              </button>
            );
          })}
        </div>

        <div className="mt-5 min-w-0">
          <h2 className="text-4xl font-semibold leading-none tracking-[-0.025em] lg:text-5xl">
            {formatRoundedStudyTime(totalSeconds)}
          </h2>
          {showAverage ? (
            <p className="mt-2 text-xs font-medium text-[var(--color-text-muted)] sm:text-sm">
              Avg {average.label}: {formatRoundedStudyTime(average.seconds)}
            </p>
          ) : null}
        </div>

        {totalSeconds > 0 ? (
          <div
            aria-label="Chart type"
            className="mt-4 grid grid-cols-2 border-b border-[rgb(255_255_255/0.08)]"
            role="group"
          >
            {chartOptions.map((option) => {
              const active = chartView === option.id;

              return (
                <button
                  aria-pressed={active}
                  className={`mac-focus min-h-11 border-b-2 px-3 text-sm font-semibold transition ${
                    active
                      ? "border-[var(--color-mac-yellow)] text-[var(--color-text)]"
                      : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                  key={option.id}
                  onClick={() => setChartView(option.id)}
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      {totalSeconds <= 0 ? (
        <EmptyStatistics period={selectedPeriod} />
      ) : chartView === "column" ? (
        <ColumnChart
          buckets={stats.buckets}
          icon={
            selectedPeriod === "day" || selectedPeriod === "week"
              ? CalendarDays
              : BarChart3
          }
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

      <StudyHeatmap dailySeconds={dailyStudySeconds} />
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
    <section className="grid gap-5 rounded-lg border border-[rgb(255_255_255/0.06)] bg-[rgb(255_255_255/0.025)] p-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:p-6">
      <div className="flex items-center justify-center">
        <div
          aria-label="Subject study split"
          className="relative h-44 w-44 rounded-full lg:h-52 lg:w-52"
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

        {subjectRows.length ? (
          <PaginatedList
            className="grid gap-1.5"
            items={subjectRows}
            pageSize={12}
            renderItem={(subject) => {
              const percent = subjectTotal
                ? (subject.seconds / subjectTotal) * 100
                : 0;

              return (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-[rgb(255_255_255/0.03)] px-3 py-2.5"
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
            }}
            resetKey="subject-split"
          />
        ) : (
          <p className="rounded-md bg-[rgb(255_255_255/0.035)] p-4 text-sm text-[var(--color-text-muted)]">
            Start a session to fill your study split.
          </p>
        )}
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
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(
    null,
  );
  const maxSeconds = Math.max(...buckets.map((bucket) => bucket.seconds), 1);
  const scaleMaxSeconds = getNiceScaleMax(maxSeconds);
  const yTicks = [scaleMaxSeconds, scaleMaxSeconds / 2, 0];
  const selectedBucket =
    buckets.find((bucket) => getBucketKey(bucket) === selectedBucketKey) ??
    getLargestBucket(buckets);

  return (
    <section className="rounded-lg border border-[rgb(255_255_255/0.06)] bg-[rgb(255_255_255/0.025)] p-4 lg:p-5">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[rgb(255_227_48/0.1)] text-[var(--color-mac-yellow)]">
            <Icon aria-hidden size={16} />
          </span>
          <h2 className="truncate text-lg font-semibold">{title}</h2>
        </div>
        <p
          aria-live="polite"
          className="shrink-0 text-xs font-semibold text-[var(--color-text-muted)]"
        >
          {selectedBucket ? (
            <>
              {selectedBucket.label} ·{" "}
              <span className="text-[var(--color-text)]">
                {formatRoundedStudyTime(selectedBucket.seconds)}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-[2.25rem_minmax(0,1fr)] gap-1 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
        <div className="relative h-32 lg:h-52">
          {yTicks.map((tick) => (
            <p
              className="absolute left-0 translate-y-1/2 text-left text-xs font-medium leading-none text-[var(--color-text-muted)]"
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
                const bucketKey = getBucketKey(bucket);
                const isSelected = selectedBucketKey === bucketKey;

                return (
                  <button
                    aria-label={`${bucket.label}: ${formatRoundedStudyTime(bucket.seconds)}`}
                    aria-pressed={isSelected}
                    className="mac-focus group flex h-full min-w-0 flex-1 flex-col justify-end rounded-sm"
                    disabled={bucket.seconds <= 0}
                    key={bucketKey}
                    onClick={() => setSelectedBucketKey(bucketKey)}
                    type="button"
                  >
                    <span
                      aria-hidden
                      className={`w-full rounded-t-md bg-[var(--color-mac-yellow)] transition ${
                        isSelected
                          ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--color-background)]"
                          : "opacity-85 group-hover:opacity-100"
                      }`}
                      style={{
                        height: `${height}%`,
                        minHeight: bucket.seconds ? "6px" : undefined,
                      }}
                    />
                  </button>
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
                <p className="text-center text-xs font-medium leading-none text-[var(--color-text-muted)]">
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

function EmptyStatistics({ period }: { period: StatsPeriod }) {
  const periodName =
    period === "day"
      ? "day"
      : period === "week"
        ? "week"
        : period === "month"
          ? "month"
          : "year";

  return (
    <section className="flex min-h-60 flex-col items-center justify-center rounded-lg border border-dashed border-[rgb(255_255_255/0.1)] bg-[rgb(255_255_255/0.02)] px-6 py-10 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(255_227_48/0.1)] text-[var(--color-mac-yellow)]">
        <BarChart3 aria-hidden size={22} />
      </span>
      <h2 className="mt-4 text-lg font-semibold">No study time yet</h2>
      <p className="mt-1 max-w-xs text-sm leading-6 text-[var(--color-text-muted)]">
        Complete a study session to see your {periodName} take shape.
      </p>
    </section>
  );
}

function formatRoundedStudyTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));

  if (seconds < 60) {
    return `${seconds} sec`;
  }

  const minutes = Math.round(seconds / 60);

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

  if (totalSeconds < 60) {
    return `${Math.round(totalSeconds)}s`;
  }

  const minutes = Math.round(totalSeconds / 60);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = minutes / 60;

  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function getNiceScaleMax(maxSeconds: number) {
  const candidates = [
    30, 60, 120, 240, 600, 1200, 1800, 3600, 7200, 14400, 21600, 28800, 43200,
    57600, 86400,
  ];
  const candidate = candidates.find((value) => value >= maxSeconds);

  return candidate ?? Math.ceil(maxSeconds / 14400) * 14400;
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

function buildDemoPeriodStats(period: StatsPeriod, now: Date) {
  const buckets = buildBuckets(period, now);
  const totalSeconds = Object.values(fallbackSubjectTotals).reduce(
    (total, seconds) => total + seconds,
    0,
  );
  const currentBucket = buckets.find(
    (bucket) => now >= bucket.start && now < bucket.end,
  );

  if (currentBucket) {
    currentBucket.seconds = totalSeconds;
  }

  return {
    buckets,
    subjectTotals: { ...fallbackSubjectTotals },
    totalSeconds,
  };
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

function buildDailyStudySeconds({
  activeSession,
  now,
  sessions,
}: {
  activeSession: ActiveSession | null;
  now: Date;
  sessions: StoredSession[];
}) {
  const totals = sessions.reduce<Record<string, number>>((result, session) => {
    const key = getLocalDateKey(new Date(session.startedAt));
    result[key] = (result[key] ?? 0) + getSessionSeconds(session);
    return result;
  }, {});

  if (activeSession) {
    const key = getLocalDateKey(new Date(activeSession.startedAt));
    totals[key] =
      (totals[key] ?? 0) + getElapsedSeconds(activeSession.startedAt, now);
  }

  return totals;
}

function buildDemoDailyStudySeconds(now: Date) {
  const totals: Record<string, number> = {};

  for (let offset = 0; offset < 364; offset += 1) {
    const date = addDays(startOfDay(now), -offset);
    const pattern = (offset * 17 + date.getMonth() * 7) % 11;

    if (pattern < 5) {
      totals[getLocalDateKey(date)] = (pattern + 1) * 18 * 60;
    }
  }

  return totals;
}

function getPeriodRange(period: StatsPeriod, now: Date) {
  if (period === "day") {
    const start = startOfDay(now);

    return { start, end: addDays(start, 1) };
  }

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
  if (period === "day") {
    const dayStart = startOfDay(now);

    return Array.from({ length: 8 }, (_, index) => {
      const hour = index * 3;
      const bucketStart = new Date(dayStart);
      bucketStart.setHours(hour);

      return {
        label: formatHourLabel(hour),
        seconds: 0,
        start: bucketStart,
        end: new Date(bucketStart.getTime() + 3 * 60 * 60 * 1000),
      };
    });
  }

  if (period === "week") {
    const { start } = getPeriodRange(period, now);

    return Array.from({ length: 7 }, (_, index) => {
      const bucketStart = addDays(start, index);

      return {
        label: WEEKDAY_LABELS[bucketStart.getDay()],
        shortLabel: WEEKDAY_SHORT_LABELS[bucketStart.getDay()],
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
        label: MONTH_LABELS[month],
        shortLabel: MONTH_LABELS[month][0],
        seconds: 0,
        start: bucketStart,
        end: new Date(now.getFullYear(), month + 1, 1),
      };
    });
  }

  return Array.from({ length: 12 }, (_, month) => {
    const bucketStart = new Date(now.getFullYear(), month, 1);

    return {
      label: MONTH_LABELS[month],
      shortLabel: MONTH_LABELS[month][0],
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
  if (period === "day") {
    return { label: "per hour", seconds: Math.floor(totalSeconds / 24) };
  }

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
  if (period === "day") {
    return "Hourly breakdown";
  }

  if (period === "month") {
    return "Weekly breakdown";
  }

  if (period === "annual") {
    return "Monthly breakdown";
  }

  return "Daily breakdown";
}

function formatHourLabel(hour: number) {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

function getBucketKey(bucket: ChartBucket) {
  return `${bucket.label}-${bucket.start.toISOString()}`;
}

function getLargestBucket(buckets: ChartBucket[]) {
  return buckets.reduce<ChartBucket | undefined>(
    (largest, bucket) =>
      !largest || bucket.seconds > largest.seconds ? bucket : largest,
    undefined,
  );
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
