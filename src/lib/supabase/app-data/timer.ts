import type {
  AppSupabaseClient as SupabaseClient,
  Tables,
} from "../types";
import type { UnitEnrollment } from "@/lib/units";
import { invalidateRemoteCachesForTable } from "@/lib/client-cache";
import { getRemoteUserId } from "./shared";
import type { RemoteTimerState } from "./types";
import {
  fetchRemoteSubjects,
  unitEnrollmentFromRow,
  type UnitEnrollmentRow,
} from "./units";

export type SessionRow = Omit<
  Pick<
    Tables<"study_sessions">,
    | "duration_seconds"
    | "ended_at"
    | "group_id"
    | "id"
    | "reminder_interval_minutes"
    | "source"
    | "started_at"
    | "status"
    | "subject_id"
    | "user_id"
  >,
  "source" | "status"
> & {
  status: "active" | "completed" | "needs_confirmation" | "voided";
  source: "timer" | "manual_adjustment";
};

type SessionRowWithoutReminders = Omit<SessionRow, "reminder_interval_minutes">;

const TIMER_SESSION_COLUMNS =
  "id, user_id, subject_id, group_id, started_at, ended_at, status, source, duration_seconds, reminder_interval_minutes";

const TIMER_SESSION_COLUMNS_WITHOUT_REMINDERS =
  "id, user_id, subject_id, group_id, started_at, ended_at, status, source, duration_seconds";

function isMissingStudyReminderColumn(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === "42703" &&
    error.message?.includes("study_sessions.reminder_interval_minutes")
  );
}

export async function fetchRemoteTimerState(
  supabase: SupabaseClient,
): Promise<RemoteTimerState | null> {
  const userId = await getRemoteUserId();

  if (!userId) {
    return null;
  }

  const [subjects, sessionsResult, enrolmentsResult] = await Promise.all([
    fetchRemoteSubjects(supabase, userId),
    supabase
      .from("study_sessions")
      .select(TIMER_SESSION_COLUMNS)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(250),
    supabase
      .from("unit_enrolments")
      .select(
        "offering_id, nickname, joined_at, unit_offerings!inner(id, unit_id, study_year, teaching_period, units!inner(id, code))",
      )
      .eq("user_id", userId)
      .is("left_at", null)
      .order("joined_at", { ascending: false }),
  ]);

  if (enrolmentsResult.error) throw enrolmentsResult.error;

  let rows: SessionRow[];

  if (!sessionsResult.error) {
    rows = (sessionsResult.data ?? []) as SessionRow[];
  } else if (isMissingStudyReminderColumn(sessionsResult.error)) {
    const fallbackResult = await supabase
      .from("study_sessions")
      .select(TIMER_SESSION_COLUMNS_WITHOUT_REMINDERS)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(250);

    if (fallbackResult.error) throw fallbackResult.error;

    rows = ((fallbackResult.data ?? []) as SessionRowWithoutReminders[]).map(
      (row) => ({
        ...row,
        reminder_interval_minutes: null,
      }),
    );
  } else {
    throw sessionsResult.error;
  }

  const activeRow =
    rows.find((row) => row.status === "active" && !row.ended_at) ?? null;
  const completedRows = rows.filter(
    (row) =>
      row.ended_at &&
      (row.status === "completed" || row.status === "needs_confirmation"),
  );

  return {
    subjects,
    unitEnrollments: ((enrolmentsResult.data ?? []) as UnitEnrollmentRow[])
      .map(unitEnrollmentFromRow)
      .filter((value): value is UnitEnrollment => Boolean(value)),
    activeSession: activeRow
      ? {
          subjectId: activeRow.subject_id,
          groupId: activeRow.group_id,
          reminderIntervalMinutes: activeRow.reminder_interval_minutes,
          startedAt: activeRow.started_at,
        }
      : null,
    sessions: completedRows.map((row) => ({
      id: row.id,
      subjectId: row.subject_id,
      groupId: row.group_id,
      startedAt: row.started_at,
      endedAt: row.ended_at as string,
      status:
        row.status === "needs_confirmation"
          ? "needs_confirmation"
          : "completed",
      source: row.source,
    })),
  };
}

export async function startRemoteStudySession({
  groupId = null,
  startedAt = new Date().toISOString(),
  subjectId,
  supabase,
}: {
  groupId?: string | null;
  startedAt?: string;
  subjectId: string | null;
  supabase: SupabaseClient;
}) {
  const userId = await getRemoteUserId();

  if (!userId) {
    return;
  }

  const { error } = await supabase.from("study_sessions").insert({
    user_id: userId,
    subject_id: subjectId,
    group_id: groupId,
    started_at: startedAt,
    status: "active",
    source: "timer",
  });

  if (error) {
    throw error;
  }

  invalidateRemoteCachesForTable("study_sessions");
}

export async function setRemoteActiveStudyReminder({
  intervalMinutes,
  supabase,
}: {
  intervalMinutes: number | null;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.rpc("set_active_study_reminder", {
    ...(intervalMinutes === null
      ? {}
      : { next_interval_minutes: intervalMinutes }),
  });

  if (error) throw error;

  invalidateRemoteCachesForTable("study_sessions");
}

export async function stopRemoteStudySession(supabase: SupabaseClient) {
  const userId = await getRemoteUserId();

  if (!userId) {
    return;
  }

  const { data: activeSession, error: activeError } = await supabase
    .from("study_sessions")
    .select("id, started_at")
    .eq("user_id", userId)
    .is("ended_at", null)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; started_at: string }>();

  if (activeError) throw activeError;
  if (!activeSession) return null;

  const endedAt = new Date();
  const durationMs =
    endedAt.getTime() - new Date(activeSession.started_at).getTime();
  const status: "needs_confirmation" | "completed" =
    durationMs >= 6 * 60 * 60 * 1000 ? "needs_confirmation" : "completed";
  const { error } = await supabase
    .from("study_sessions")
    .update({ ended_at: endedAt.toISOString(), status })
    .eq("id", activeSession.id)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  invalidateRemoteCachesForTable("study_sessions");

  return { endedAt: endedAt.toISOString(), id: activeSession.id, status };
}

export async function updateRemoteStudySession({
  endedAt,
  sessionId,
  startedAt,
  subjectId,
  supabase,
}: {
  endedAt: string;
  sessionId: string;
  startedAt: string;
  subjectId: string | null;
  supabase: SupabaseClient;
}) {
  const userId = await getRemoteUserId();
  if (!userId) return;

  const { error } = await supabase
    .from("study_sessions")
    .update({
      ended_at: endedAt,
      source: "manual_adjustment",
      started_at: startedAt,
      status: "completed",
      subject_id: subjectId,
    })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .is("deleted_at", null);

  if (error) throw error;

  invalidateRemoteCachesForTable("study_sessions");
}

export async function deleteRemoteStudySession({
  sessionId,
  supabase,
}: {
  sessionId: string;
  supabase: SupabaseClient;
}) {
  const userId = await getRemoteUserId();
  if (!userId) return;

  const { error } = await supabase
    .from("study_sessions")
    .update({ deleted_at: new Date().toISOString(), status: "voided" })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .not("ended_at", "is", null);

  if (error) throw error;

  invalidateRemoteCachesForTable("study_sessions");
}
