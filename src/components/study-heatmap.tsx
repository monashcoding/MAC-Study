"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MAX_WEEK_COUNT = 52;
const MIN_WEEK_COUNT = 12;
const WEEK_PITCH_PX = 16;

export function StudyHeatmap({
  dailySeconds,
  title = "Study activity",
}: {
  dailySeconds: Record<string, number>;
  title?: string;
}) {
  const graphRef = useRef<HTMLDivElement>(null);
  const [weekCount, setWeekCount] = useState(18);
  const weeks = useMemo(() => buildWeeks(weekCount), [weekCount]);
  const days = weeks.flat();
  const visibleActiveDays = days.filter(
    (day) => !day.isFuture && (dailySeconds[day.key] ?? 0) > 0,
  );
  const activeDays = getActiveDaysInLastYear(dailySeconds);
  const maxSeconds = Math.max(1, ...activeDays.map(([, seconds]) => seconds));
  const latestActiveDay =
    visibleActiveDays.at(-1) ?? days.findLast((day) => !day.isFuture);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    latestActiveDay?.key ?? null,
  );
  const selectedDay =
    days.find((day) => day.key === selectedKey) ?? latestActiveDay ?? null;

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    function updateWeekCount(width: number) {
      setWeekCount(
        Math.max(
          MIN_WEEK_COUNT,
          Math.min(MAX_WEEK_COUNT, Math.floor(width / WEEK_PITCH_PX)),
        ),
      );
    }

    updateWeekCount(graph.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) updateWeekCount(entry.contentRect.width);
    });

    observer.observe(graph);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="overflow-hidden rounded-lg border border-[rgb(255_255_255/0.07)] bg-[rgb(255_255_255/0.02)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {activeDays.length} active{" "}
            {activeDays.length === 1 ? "day" : "days"} in the last year
          </p>
        </div>
        {selectedDay ? (
          <p
            aria-live="polite"
            className="text-right text-xs text-[var(--color-text-muted)]"
          >
            {formatDayLabel(selectedDay.date)}
            <span className="ml-2 font-semibold text-[var(--color-text)]">
              {formatHeatmapTime(dailySeconds[selectedDay.key] ?? 0)}
            </span>
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-1">
        <span aria-hidden />
        <div className="min-w-0 overflow-hidden" ref={graphRef}>
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${weekCount}, minmax(0, 1fr))`,
            }}
          >
            {weeks.map((week, index) => (
              <span
                className="min-w-0 overflow-visible whitespace-nowrap text-[10px] font-medium text-[var(--color-text-muted)]"
                key={week[0].key}
              >
                {shouldShowMonth(weeks, index)
                  ? week[0].date.toLocaleDateString("en-AU", {
                      month: "short",
                    })
                  : ""}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-2 grid grid-rows-7 gap-1 text-[10px] font-medium leading-none text-[var(--color-text-muted)]">
          <span />
          <span className="flex items-center">Mon</span>
          <span />
          <span className="flex items-center">Wed</span>
          <span />
          <span className="flex items-center">Fri</span>
          <span />
        </div>

        <div
          className="mt-2 grid min-w-0 gap-1"
          style={{
            gridTemplateColumns: `repeat(${weekCount}, minmax(0, 1fr))`,
          }}
        >
          {weeks.map((week) => (
            <div className="grid min-w-0 grid-rows-7 gap-1" key={week[0].key}>
              {week.map((day) => {
                const seconds = dailySeconds[day.key] ?? 0;
                const level = getLevel(seconds, maxSeconds);
                const selected = selectedKey === day.key;

                return (
                  <button
                    aria-label={`${formatDayLabel(day.date)}: ${formatHeatmapTime(seconds)}`}
                    className={cn(
                      "mac-focus aspect-square min-w-0 rounded-[3px] transition",
                      getLevelClass(level),
                      selected &&
                        !day.isFuture &&
                        "ring-1 ring-white ring-offset-1 ring-offset-[var(--color-background)]",
                      day.isFuture && "pointer-events-none opacity-0",
                    )}
                    disabled={day.isFuture}
                    key={day.key}
                    onClick={() => setSelectedKey(day.key)}
                    type="button"
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] font-medium text-[var(--color-text-muted)]">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span
            aria-hidden
            className={cn("h-3 w-3 rounded-[3px]", getLevelClass(level))}
            key={level}
          />
        ))}
        <span>More</span>
      </div>
    </section>
  );
}

type HeatmapDay = {
  date: Date;
  isFuture: boolean;
  key: string;
};

function getActiveDaysInLastYear(dailySeconds: Record<string, number>) {
  const today = startOfDay(new Date());
  const firstDay = addDays(today, -364);
  const firstKey = getDateKey(firstDay);
  const todayKey = getDateKey(today);

  return Object.entries(dailySeconds).filter(
    ([key, seconds]) => key >= firstKey && key <= todayKey && seconds > 0,
  );
}

function buildWeeks(weekCount: number) {
  const today = startOfDay(new Date());
  const currentWeekStart = startOfWeek(today);
  const firstWeekStart = addDays(currentWeekStart, -(weekCount - 1) * 7);

  return Array.from({ length: weekCount }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = addDays(firstWeekStart, weekIndex * 7 + dayIndex);

      return {
        date,
        isFuture: date > today,
        key: getDateKey(date),
      } satisfies HeatmapDay;
    }),
  );
}

function shouldShowMonth(weeks: HeatmapDay[][], index: number) {
  if (index === 0) return true;

  return (
    weeks[index][0].date.getMonth() !== weeks[index - 1][0].date.getMonth()
  );
}

function getLevel(seconds: number, maxSeconds: number) {
  if (seconds <= 0) return 0;

  return Math.max(1, Math.min(4, Math.ceil((seconds / maxSeconds) * 4)));
}

function getLevelClass(level: number) {
  if (level === 4) return "bg-[var(--color-mac-yellow)]";
  if (level === 3) return "bg-[rgb(255_227_48/0.68)]";
  if (level === 2) return "bg-[rgb(255_227_48/0.42)]";
  if (level === 1) return "bg-[rgb(255_227_48/0.2)]";

  return "bg-[rgb(255_255_255/0.055)]";
}

function formatHeatmapTime(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} sec`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function startOfWeek(date: Date) {
  return addDays(date, -date.getDay());
}

function addDays(date: Date, amount: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + amount);
  return value;
}

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
