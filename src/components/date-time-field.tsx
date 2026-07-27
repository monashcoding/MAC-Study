"use client";

import { useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { CustomSelect } from "@/components/custom-select";
import { cn } from "@/lib/utils";

export type DateTimePickerPart = "date" | "time";

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  label: String(index + 1),
  value: String(index + 1),
}));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => ({
  label: String(index).padStart(2, "0"),
  value: String(index),
}));
const PERIOD_OPTIONS = [
  { label: "AM", value: "AM" },
  { label: "PM", value: "PM" },
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function DateTimeField({
  activePart,
  label,
  onChange,
  onPartChange,
  value,
}: {
  activePart: DateTimePickerPart | null;
  label: string;
  onChange: (value: string) => void;
  onPartChange: (part: DateTimePickerPart | null) => void;
  value: string;
}) {
  const selectedDate = parseLocalDateTime(value);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );

  function changeDate(year: number, month: number, day: number) {
    const next = new Date(selectedDate);
    next.setFullYear(year, month, day);
    onChange(toLocalDateTime(next));
    onPartChange(null);
  }

  function changeTime({
    hour12 = getHour12(selectedDate),
    minute = selectedDate.getMinutes(),
    period = getPeriod(selectedDate),
  }: {
    hour12?: number;
    minute?: number;
    period?: "AM" | "PM";
  }) {
    const next = new Date(selectedDate);
    const hour24 =
      period === "PM" ? (hour12 % 12) + 12 : hour12 === 12 ? 0 : hour12;
    next.setHours(hour24, minute, 0, 0);
    onChange(toLocalDateTime(next));
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          aria-expanded={activePart === "date"}
          className={cn(
            "mac-focus inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-md border bg-[var(--color-surface)] px-2 text-sm font-semibold transition",
            activePart === "date"
              ? "border-[var(--color-mac-yellow)] text-[var(--color-text)]"
              : "border-[var(--color-border)] text-[var(--color-text-muted)]",
          )}
          onClick={() => {
            setVisibleMonth(
              new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
            );
            onPartChange(activePart === "date" ? null : "date");
          }}
          type="button"
        >
          <Calendar aria-hidden className="shrink-0" size={16} />
          <span className="truncate">{formatDate(selectedDate)}</span>
        </button>
        <button
          aria-expanded={activePart === "time"}
          className={cn(
            "mac-focus inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-md border bg-[var(--color-surface)] px-2 text-sm font-semibold transition",
            activePart === "time"
              ? "border-[var(--color-mac-yellow)] text-[var(--color-text)]"
              : "border-[var(--color-border)] text-[var(--color-text-muted)]",
          )}
          onClick={() =>
            onPartChange(activePart === "time" ? null : "time")
          }
          type="button"
        >
          <Clock aria-hidden className="shrink-0" size={16} />
          <span className="truncate">{formatTime(selectedDate)}</span>
        </button>
      </div>

      {activePart === "date" ? (
        <CalendarPanel
          onChange={changeDate}
          onMonthChange={setVisibleMonth}
          selectedDate={selectedDate}
          visibleMonth={visibleMonth}
        />
      ) : null}

      {activePart === "time" ? (
        <div className="rounded-md border border-[var(--color-border)] bg-[rgb(255_255_255/0.025)] p-3">
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
            <div>
              <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">
                Hour
              </p>
              <CustomSelect
                ariaLabel={`${label} hour`}
                onChange={(hour) =>
                  changeTime({ hour12: Number(hour) })
                }
                options={HOUR_OPTIONS}
                value={String(getHour12(selectedDate))}
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">
                Minute
              </p>
              <CustomSelect
                ariaLabel={`${label} minute`}
                onChange={(minute) =>
                  changeTime({ minute: Number(minute) })
                }
                options={MINUTE_OPTIONS}
                value={String(selectedDate.getMinutes())}
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">
                Period
              </p>
              <CustomSelect
                ariaLabel={`${label} period`}
                onChange={(period) =>
                  changeTime({ period: period as "AM" | "PM" })
                }
                options={PERIOD_OPTIONS}
                value={getPeriod(selectedDate)}
              />
            </div>
          </div>
          <button
            className="mac-focus mt-3 h-11 w-full rounded-md bg-[var(--color-mac-yellow)] text-sm font-semibold text-[#141414]"
            onClick={() => onPartChange(null)}
            type="button"
          >
            Set time
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function DateField({
  isOpen,
  label,
  onChange,
  onOpenChange,
  value,
}: {
  isOpen: boolean;
  label: string;
  onChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  value: string;
}) {
  const selectedDate = parseLocalDateTime(value);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );

  function changeDate(year: number, month: number, day: number) {
    const next = new Date(selectedDate);
    next.setFullYear(year, month, day);
    onChange(toLocalDateTime(next));
    onOpenChange(false);
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[var(--color-text-muted)]">
        {label}
      </p>
      <button
        aria-expanded={isOpen}
        className={cn(
          "mac-focus inline-flex h-12 w-full min-w-0 items-center gap-2.5 rounded-md border bg-[var(--color-surface)] px-3 text-left text-sm font-medium transition lg:h-10",
          isOpen
            ? "border-[var(--color-mac-yellow)] text-[var(--color-text)]"
            : "border-[var(--color-border)] text-[var(--color-text)] hover:border-[rgb(255_255_255/0.18)]",
        )}
        onClick={() => {
          setVisibleMonth(
            new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
          );
          onOpenChange(!isOpen);
        }}
        type="button"
      >
        <Calendar
          aria-hidden
          className="shrink-0 text-[var(--color-text-muted)]"
          size={16}
        />
        <span className="truncate">{formatDate(selectedDate)}</span>
      </button>

      {isOpen ? (
        <CalendarPanel
          onChange={changeDate}
          onMonthChange={setVisibleMonth}
          selectedDate={selectedDate}
          visibleMonth={visibleMonth}
        />
      ) : null}
    </div>
  );
}

function CalendarPanel({
  onChange,
  onMonthChange,
  selectedDate,
  visibleMonth,
}: {
  onChange: (year: number, month: number, day: number) => void;
  onMonthChange: (month: Date) => void;
  selectedDate: Date;
  visibleMonth: Date;
}) {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingSpaces = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells = Array.from(
    { length: leadingSpaces + daysInMonth },
    (_, index) => (index < leadingSpaces ? null : index - leadingSpaces + 1),
  );

  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[rgb(255_255_255/0.025)] p-2">
      <div className="mb-2 flex items-center justify-between">
        <button
          className="mac-focus inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--color-text-muted)]"
          onClick={() =>
            onMonthChange(new Date(year, month - 1, 1))
          }
          type="button"
        >
          <ChevronLeft aria-hidden size={18} />
          <span className="sr-only">Previous month</span>
        </button>
        <p className="text-sm font-semibold">
          {new Intl.DateTimeFormat("en-AU", {
            month: "long",
            year: "numeric",
          }).format(visibleMonth)}
        </p>
        <button
          className="mac-focus inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--color-text-muted)]"
          onClick={() =>
            onMonthChange(new Date(year, month + 1, 1))
          }
          type="button"
        >
          <ChevronRight aria-hidden size={18} />
          <span className="sr-only">Next month</span>
        </button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((weekday) => (
          <span
            className="py-1 text-[11px] font-medium text-[var(--color-text-muted)]"
            key={weekday}
          >
            {weekday}
          </span>
        ))}
        {cells.map((day, index) =>
          day ? (
            <button
              aria-label={`${day} ${new Intl.DateTimeFormat("en-AU", {
                month: "long",
                year: "numeric",
              }).format(visibleMonth)}`}
              aria-pressed={
                selectedDate.getFullYear() === year &&
                selectedDate.getMonth() === month &&
                selectedDate.getDate() === day
              }
              className={cn(
                "mac-focus inline-flex h-10 w-full min-w-0 items-center justify-center rounded-md text-sm font-medium transition",
                selectedDate.getFullYear() === year &&
                  selectedDate.getMonth() === month &&
                  selectedDate.getDate() === day
                  ? "bg-[var(--color-mac-yellow)] font-semibold text-[#141414]"
                  : "text-[var(--color-text)] hover:bg-[rgb(255_255_255/0.055)]",
              )}
              key={`${year}-${month}-${day}`}
              onClick={() => onChange(year, month, day)}
              type="button"
            >
              {day}
            </button>
          ) : (
            <span aria-hidden className="h-10" key={`empty-${index}`} />
          ),
        )}
      </div>
    </div>
  );
}

function parseLocalDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toLocalDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
  }).format(date);
}

function getHour12(date: Date) {
  return date.getHours() % 12 || 12;
}

function getPeriod(date: Date): "AM" | "PM" {
  return date.getHours() >= 12 ? "PM" : "AM";
}
