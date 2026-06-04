"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CircleStop,
  Clock3,
  Flame,
  Play,
  RefreshCcw,
  Users,
} from "lucide-react";
import { groups, subjects } from "@/lib/demo-data";
import {
  formatDuration,
  getElapsedSeconds,
  getLocalDateKey,
  groupSessionsBySubject,
  isLongSession,
  sumCompletedSeconds,
} from "@/lib/timer";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "mac-study-demo-state";

type ActiveSession = {
  subjectId: string;
  groupId: string | null;
  startedAt: string;
};

type StoredSession = {
  id: string;
  subjectId: string;
  groupId: string | null;
  startedAt: string;
  endedAt: string;
  status: "completed" | "needs_confirmation";
  source: "timer";
};

type StoredState = {
  activeSession: ActiveSession | null;
  sessions: StoredSession[];
};

export function TimerDashboard() {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjects[0].id);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    groups[0].id,
  );
  const [now, setNow] = useState(() => new Date());
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);

    /* eslint-disable react-hooks/set-state-in-effect --
     * The demo timer hydrates from localStorage after mount so the server
     * render stays deterministic while active sessions still survive reloads.
     */
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as StoredState;
        setActiveSession(parsed.activeSession);
        setSessions(parsed.sessions ?? []);

        if (parsed.activeSession) {
          setSelectedSubjectId(parsed.activeSession.subjectId);
          setSelectedGroupId(parsed.activeSession.groupId);
        }
      } catch {
        setSessions(makeSeedSessions());
      }
    } else {
      setSessions(makeSeedSessions());
    }

    setIsLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeSession, sessions }),
    );
  }, [activeSession, isLoaded, sessions]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const activeSubject = subjects.find(
    (subject) => subject.id === activeSession?.subjectId,
  );
  const selectedSubject = subjects.find(
    (subject) => subject.id === selectedSubjectId,
  );
  const activeGroup = groups.find((group) => group.id === activeSession?.groupId);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const elapsedSeconds = activeSession
    ? getElapsedSeconds(activeSession.startedAt, now)
    : 0;
  const longSession = activeSession ? isLongSession(activeSession.startedAt, now) : false;
  const todayKey = getLocalDateKey(now);

  const todaySessions = useMemo(
    () =>
      sessions.filter(
        (session) => getLocalDateKey(new Date(session.endedAt)) === todayKey,
      ),
    [sessions, todayKey],
  );
  const subjectTotals = groupSessionsBySubject(todaySessions);
  const totalToday = sumCompletedSeconds(todaySessions);
  const groupToday = sumCompletedSeconds(
    todaySessions.filter((session) => session.groupId === selectedGroupId),
  );
  const leaderboardRows = makeLeaderboard(groupToday);

  function startStudy() {
    if (activeSession) {
      return;
    }

    setActiveSession({
      subjectId: selectedSubjectId,
      groupId: selectedGroupId,
      startedAt: new Date().toISOString(),
    });
  }

  function stopStudy() {
    if (!activeSession) {
      return;
    }

    const endedAt = new Date();

    setSessions((current) => [
      {
        id: crypto.randomUUID(),
        subjectId: activeSession.subjectId,
        groupId: activeSession.groupId,
        startedAt: activeSession.startedAt,
        endedAt: endedAt.toISOString(),
        status: isLongSession(activeSession.startedAt, endedAt)
          ? "needs_confirmation"
          : "completed",
        source: "timer",
      },
      ...current,
    ]);
    setActiveSession(null);
  }

  function resetDemo() {
    setActiveSession(null);
    setSessions(makeSeedSessions());
    setSelectedSubjectId(subjects[0].id);
    setSelectedGroupId(groups[0].id);
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
        <div className="mac-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[var(--color-mac-yellow)]">
                Active timer
              </p>
              <h1 className="mt-1 text-2xl font-semibold">
                {activeSession ? activeSubject?.code : "Ready to study"}
              </h1>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                activeSession
                  ? "border-[rgb(66_211_146/0.5)] bg-[rgb(66_211_146/0.1)] text-[var(--color-success)]"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)]",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  activeSession
                    ? "bg-[var(--color-success)]"
                    : "bg-[var(--color-text-muted)]",
                )}
              />
              {activeSession ? "Studying" : "Idle"}
            </span>
          </div>

          <div className="mt-7">
            <p className="font-mono text-5xl font-semibold leading-none tabular-nums sm:text-6xl">
              {formatDuration(elapsedSeconds)}
            </p>
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
              {activeSession
                ? `${activeSubject?.name ?? "Subject"}${
                    activeGroup ? ` with ${activeGroup.name}` : ""
                  }`
                : `${selectedSubject?.code ?? "Subject"}${
                    selectedGroup ? ` with ${selectedGroup.name}` : ""
                  }`}
            </p>
          </div>

          {longSession ? (
            <div className="mt-5 flex items-start gap-3 rounded-md border border-[rgb(255_107_107/0.5)] bg-[rgb(255_107_107/0.1)] p-3 text-sm text-[var(--color-danger)]">
              <AlertTriangle aria-hidden className="mt-0.5 shrink-0" size={18} />
              <p>
                This session is past the confirmation limit and will be marked
                for review when stopped.
              </p>
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              className="mac-focus inline-flex h-13 items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 font-semibold text-[#141414] disabled:opacity-45"
              disabled={Boolean(activeSession)}
              onClick={startStudy}
              type="button"
            >
              <Play aria-hidden size={19} />
              Start Study
            </button>
            <button
              className="mac-focus inline-flex h-13 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-4 font-semibold text-[var(--color-text)] disabled:opacity-45"
              disabled={!activeSession}
              onClick={stopStudy}
              type="button"
            >
              <CircleStop aria-hidden size={19} />
              Stop
            </button>
          </div>
        </div>

        <div className="mac-panel p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-mac-yellow)]">
                Today
              </p>
              <h2 className="mt-1 text-2xl font-semibold tabular-nums">
                {formatDuration(totalToday)}
              </h2>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#262626] text-[var(--color-mac-yellow)]">
              <Flame aria-hidden size={23} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:hidden">
            {subjects.map((subject) => (
              <div
                className="rounded-md border border-[var(--color-border)] bg-[#262626] p-2"
                key={subject.id}
              >
                <p className="text-xs font-semibold">{subject.code}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)] tabular-nums">
                  {formatDuration(subjectTotals[subject.id] ?? 0)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 hidden space-y-3 sm:block">
            {subjects.map((subject) => {
              const seconds = subjectTotals[subject.id] ?? 0;
              const width = totalToday > 0 ? `${(seconds / totalToday) * 100}%` : "0%";

              return (
                <div key={subject.id}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{subject.code}</span>
                    <span className="text-[var(--color-text-muted)] tabular-nums">
                      {formatDuration(seconds)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#202020]">
                    <div
                      className="h-full rounded-full"
                      style={{ background: subject.color, width }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <div className="mac-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Subject</h2>
              <Clock3
                aria-hidden
                className="text-[var(--color-text-muted)]"
                size={18}
              />
            </div>
            <div className="mt-4 grid gap-2">
              {subjects.map((subject) => {
                const active = subject.id === selectedSubjectId;

                return (
                  <button
                    className={cn(
                      "mac-focus flex min-h-14 items-center justify-between rounded-md border p-3 text-left",
                      active
                        ? "border-[var(--color-mac-yellow)] bg-[rgb(255_227_48/0.09)]"
                        : "border-[var(--color-border)] bg-[#262626]",
                    )}
                    key={subject.id}
                    onClick={() => setSelectedSubjectId(subject.id)}
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className="h-8 w-8 shrink-0 rounded-md"
                        style={{ background: subject.color }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">
                          {subject.code}
                        </span>
                        <span className="block truncate text-sm text-[var(--color-text-muted)]">
                          {subject.name}
                        </span>
                      </span>
                    </span>
                    <span
                      className={cn(
                        "h-3 w-3 rounded-full border",
                        active
                          ? "border-[var(--color-mac-yellow)] bg-[var(--color-mac-yellow)]"
                          : "border-[var(--color-border)]",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mac-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Group context</h2>
              <Users
                aria-hidden
                className="text-[var(--color-text-muted)]"
                size={18}
              />
            </div>
            <div className="mt-4 grid gap-2">
              <GroupButton
                active={selectedGroupId === null}
                label="No group"
                meta="Personal total only"
                onClick={() => setSelectedGroupId(null)}
              />
              {groups.map((group) => (
                <GroupButton
                  active={selectedGroupId === group.id}
                  key={group.id}
                  label={group.name}
                  meta={`${group.activeNow} active now`}
                  onClick={() => setSelectedGroupId(group.id)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <section className="mac-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Group daily leaderboard</h2>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {selectedGroup?.name ?? "Personal sessions"}
                </p>
              </div>
              <button
                className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)]"
                onClick={resetDemo}
                type="button"
              >
                <RefreshCcw aria-hidden size={17} />
                <span className="sr-only">Reset demo data</span>
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-md border border-[var(--color-border)]">
              {leaderboardRows.map((row) => (
                <div
                  className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[#262626] p-3 last:border-b-0"
                  key={row.name}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold",
                      row.isUser
                        ? "bg-[var(--color-mac-yellow)] text-[#141414]"
                        : "bg-[var(--color-surface-raised)] text-[var(--color-text)]",
                    )}
                  >
                    {row.rank}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.name}</span>
                    <span className="text-sm text-[var(--color-text-muted)]">
                      {row.status}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatDuration(row.seconds)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <StatCard label="Group time" value={formatDuration(groupToday)} />
            <StatCard label="Streak" value="3 days" />
            <StatCard label="Active members" value="8" tone="info" />
            <StatCard label="Needs review" value="0" tone="danger" />
          </section>
        </div>
      </section>
    </div>
  );
}

function GroupButton({
  active,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "mac-focus flex min-h-13 items-center justify-between rounded-md border p-3 text-left",
        active
          ? "border-[var(--color-mac-yellow)] bg-[rgb(255_227_48/0.09)]"
          : "border-[var(--color-border)] bg-[#262626]",
      )}
      onClick={onClick}
      type="button"
    >
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="text-sm text-[var(--color-text-muted)]">{meta}</span>
      </span>
      <span
        className={cn(
          "h-3 w-3 rounded-full border",
          active
            ? "border-[var(--color-mac-yellow)] bg-[var(--color-mac-yellow)]"
            : "border-[var(--color-border)]",
        )}
      />
    </button>
  );
}

function StatCard({
  label,
  tone = "yellow",
  value,
}: {
  label: string;
  tone?: "yellow" | "info" | "danger";
  value: string;
}) {
  const toneClass = {
    danger: "text-[var(--color-danger)]",
    info: "text-[var(--color-info)]",
    yellow: "text-[var(--color-mac-yellow)]",
  }[tone];

  return (
    <div className="mac-raised p-4">
      <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", toneClass)}>
        {value}
      </p>
    </div>
  );
}

function makeSeedSessions(): StoredSession[] {
  const now = new Date();
  const base = new Date(now);
  base.setHours(9, 10, 0, 0);

  return [
    {
      id: "seed-fit3159",
      subjectId: "fit3159",
      groupId: "exam-sprint",
      startedAt: base.toISOString(),
      endedAt: new Date(base.getTime() + 42 * 60 * 1000).toISOString(),
      status: "completed",
      source: "timer",
    },
    {
      id: "seed-fit3077",
      subjectId: "fit3077",
      groupId: null,
      startedAt: new Date(base.getTime() + 60 * 60 * 1000).toISOString(),
      endedAt: new Date(base.getTime() + 102 * 60 * 1000).toISOString(),
      status: "completed",
      source: "timer",
    },
  ];
}

function makeLeaderboard(userSeconds: number) {
  return [
    {
      name: "Maya",
      rank: 1,
      seconds: 2 * 60 * 60 + 20 * 60,
      status: "FIT3159",
    },
    {
      name: "You",
      rank: 2,
      seconds: userSeconds,
      status: "MAC Study",
      isUser: true,
    },
    {
      name: "Josh",
      rank: 3,
      seconds: 58 * 60,
      status: "FIT3077",
    },
    {
      name: "Ari",
      rank: 4,
      seconds: 34 * 60,
      status: "FIT2004",
    },
  ]
    .sort((a, b) => b.seconds - a.seconds)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
