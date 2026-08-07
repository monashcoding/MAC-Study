import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentStudyUserId } from "@/lib/auth/mac-auth-browser";
import {
  GROUP_ICON_KEYS,
  PERSON_ICON_KEYS,
  PROFILE_COLORS,
  type GroupIconKey,
  type GroupRole,
  type GroupVisibility,
  type PersonIconKey,
  type SocialFriend,
  type SocialGroup,
  type SocialState,
} from "@/lib/social-state";
import {
  addDateKeyDays,
  getAustralianDateStart,
  getElapsedSeconds,
  getLocalDateKey,
} from "@/lib/timer";
import {
  type SpecialUnit,
  type TeachingPeriod,
  type UnitCohortMember,
  type UnitEnrollment,
  type UnitSuggestion,
  uniqueUnitSuggestions,
} from "@/lib/units";

export type RemoteSubject = {
  id: string;
  name: string;
  color: string;
  canonicalCode?: string;
  unitOfferingId?: string | null;
};

export type RemoteUnitState = {
  enrollments: UnitEnrollment[];
  specialUnits: SpecialUnit[];
  subjects: RemoteSubject[];
  suggestions: UnitSuggestion[];
};

export type RemoteActiveSession = {
  subjectId: string | null;
  groupId?: string | null;
  reminderIntervalMinutes?: number | null;
  startedAt: string;
};

export type RemoteStoredSession = {
  id: string;
  subjectId: string | null;
  groupId?: string | null;
  startedAt: string;
  endedAt: string;
  status: "completed" | "needs_confirmation";
  source: "manual_adjustment" | "timer";
};

export type RemoteTimerState = {
  subjects: RemoteSubject[];
  unitEnrollments: UnitEnrollment[];
  activeSession: RemoteActiveSession | null;
  sessions: RemoteStoredSession[];
};

export type RemoteSocialSnapshot = {
  socialState: SocialState;
  availableFriends: RemoteFriendCandidate[];
  friendRequests: RemoteFriendRequest[];
  groupInvites: RemoteGroupInvite[];
  superNudges: RemoteSuperNudge[];
  currentUserId: string;
};

export type RemoteFriendCandidate = SocialFriend & {
  mutualFriendCount: number;
  requestDirection: "incoming" | "outgoing" | null;
};

export type RemoteFriendRequest = {
  createdAt: string;
  direction: "incoming" | "outgoing";
  id: string;
  user: SocialFriend;
};

export type RemoteGroupInvite = {
  createdAt: string;
  direction: "incoming" | "outgoing";
  group: {
    id: string;
    name: string;
  };
  id: string;
  user: SocialFriend;
};

export type RemoteSuperNudge = {
  createdAt: string;
  direction: "incoming" | "outgoing";
  friendId: string;
  id: string;
  status: "active" | "pending";
};

export type RemoteNotificationPreferences = {
  friendNotifications: boolean;
  nudgeNotifications: boolean;
  otherNotifications: boolean;
};

export type RemoteGroupNotificationSettings = {
  chatMuted: boolean;
  nudgesMuted: boolean;
};

export type RemoteAppNotification = {
  body: string;
  createdAt: string;
  entityId: string | null;
  id: string;
  title: string;
  type: "friend_accepted" | "friend_request" | "other";
};

export type RemoteGroupChatMessage = {
  id: string;
  groupId: string;
  userId: string;
  body: string;
  createdAt: string;
  imagePath?: string | null;
  imageUrl?: string | null;
  replyToId?: string | null;
};

export type RemoteGroupChatPage = {
  hasMore: boolean;
  messages: RemoteGroupChatMessage[];
};

export type RemoteNudgeNotification = {
  id: string;
  groupId: string | null;
  message: string;
  senderId: string;
  createdAt: string;
};

export type RemoteNudgeDelivery = {
  sent: number;
  skipped?:
    | "disabled"
    | "no_subscriptions"
    | "push_not_configured"
    | "subscriptions_unavailable";
};

export function getNudgeDeliveryMessage(delivery: RemoteNudgeDelivery) {
  if (delivery.sent > 0) {
    return "Nudge delivered.";
  }

  if (delivery.skipped === "no_subscriptions") {
    return "They need to enable nudge notifications.";
  }

  if (delivery.skipped === "disabled") {
    return "They have nudge notifications muted.";
  }

  if (delivery.skipped === "push_not_configured") {
    return "Push notifications are not configured.";
  }

  return "Push delivery is unavailable.";
}

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url?: string | null;
  study_icon?: string | null;
  profile_color?: string | null;
};

type SubjectRow = {
  id: string;
  code: string;
  name: string | null;
  color: string | null;
  unit_offering_id?: string | null;
};

type UnitEnrollmentRow = {
  joined_at: string;
  nickname: string | null;
  offering_id: string;
  unit_offerings:
    | {
        id: string;
        study_year: number;
        teaching_period: TeachingPeriod;
        unit_id: string;
        units: { code: string; id: string } | { code: string; id: string }[];
      }
    | {
        id: string;
        study_year: number;
        teaching_period: TeachingPeriod;
        unit_id: string;
        units: { code: string; id: string } | { code: string; id: string }[];
      }[];
};

type UnitCohortRow = {
  display_name: string | null;
  is_friend: boolean;
  mutual_friend_count: number | string;
  profile_color: string | null;
  shared_group_ids: string[] | null;
  study_icon: string | null;
  user_id: string;
  username: string | null;
};

type GroupRow = {
  id: string;
  name: string;
  icon?: string | null;
  invite_code?: string;
  visibility: "invite_only" | "public";
};

type GroupMemberRow = {
  group_id: string;
  user_id: string;
  role: string;
  status: string;
};

type FriendshipRow = {
  friend_id: string;
};

type FriendCandidateRow = {
  avatar_url: string | null;
  display_name: string | null;
  mutual_friend_count: number | string;
  profile_color: string | null;
  request_direction: "incoming" | "outgoing" | null;
  study_icon: string | null;
  user_id: string;
  username: string | null;
};

type FriendRequestRow = {
  avatar_url: string | null;
  created_at: string;
  direction: "incoming" | "outgoing";
  display_name: string | null;
  profile_color: string | null;
  request_id: string;
  study_icon: string | null;
  user_id: string;
  username: string | null;
};

type GroupInviteRow = {
  avatar_url: string | null;
  created_at: string;
  direction: "incoming" | "outgoing";
  display_name: string | null;
  group_id: string;
  group_name: string;
  invite_id: string;
  profile_color: string | null;
  study_icon: string | null;
  user_id: string;
  username: string | null;
};

type SuperNudgeRow = {
  created_at: string;
  id: string;
  recipient_id: string;
  sender_id: string;
  status: "active" | "pending";
};

type NotificationPreferencesRow = {
  friend_notifications: boolean;
  nudge_notifications: boolean;
  other_notifications: boolean;
};

type AppNotificationRow = {
  body: string;
  created_at: string;
  entity_id: string | null;
  id: string;
  title: string;
  type: "friend_accepted" | "friend_request" | "other";
};

type SessionRow = {
  id: string;
  user_id: string;
  subject_id: string | null;
  group_id: string | null;
  reminder_interval_minutes: number | null;
  started_at: string;
  ended_at: string | null;
  status: "active" | "completed" | "needs_confirmation" | "voided";
  source: "timer" | "manual_adjustment";
  duration_seconds: number | null;
};

type NudgeRow = {
  id: string;
  group_id: string | null;
  sender_id: string;
  recipient_id: string;
  message: string | null;
  created_at: string;
};

type GroupChatRow = {
  id: string;
  group_id: string;
  user_id: string;
  body: string | null;
  created_at: string;
  image_path: string | null;
  reply_to_id: string | null;
};

const GROUP_CHAT_IMAGE_BUCKET = "group-chat-images";
const GROUP_CHAT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const GROUP_CHAT_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function getRemoteUserId() {
  try {
    return await getCurrentStudyUserId();
  } catch {
    return null;
  }
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
      .select(
        "id, user_id, subject_id, group_id, started_at, ended_at, status, source, duration_seconds, reminder_interval_minutes",
      )
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

  if (sessionsResult.error) throw sessionsResult.error;
  if (enrolmentsResult.error) throw enrolmentsResult.error;

  const rows = (sessionsResult.data ?? []) as SessionRow[];
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
}

export async function setRemoteActiveStudyReminder({
  intervalMinutes,
  supabase,
}: {
  intervalMinutes: number | null;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.rpc("set_active_study_reminder", {
    next_interval_minutes: intervalMinutes,
  });

  if (error) throw error;
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
}

export async function saveRemoteSubjects({
  subjects,
  supabase,
}: {
  subjects: RemoteSubject[];
  supabase: SupabaseClient;
}) {
  const userId = await getRemoteUserId();

  if (!userId) {
    return subjects;
  }

  const savedSubjects: RemoteSubject[] = [];
  const linkChanges: {
    offeringId: string | null;
    subjectId: string;
  }[] = [];

  for (const subject of subjects) {
    if (isUuid(subject.id)) {
      const { data, error } = await supabase
        .from("subjects")
        .update({
          code: subject.unitOfferingId
            ? (subject.canonicalCode ?? subject.name)
            : subject.name,
          name: subject.name,
          color: subject.color,
          archived_at: null,
        })
        .eq("id", subject.id)
        .eq("user_id", userId)
        .select("id, code, name, color, unit_offering_id")
        .single<SubjectRow>();

      if (error) {
        throw error;
      }

      savedSubjects.push(subjectFromRow(data));
      if (subject.unitOfferingId !== undefined) {
        linkChanges.push({
          offeringId: subject.unitOfferingId,
          subjectId: data.id,
        });
      }
    } else {
      const { data, error } = await supabase
        .from("subjects")
        .insert({
          user_id: userId,
          code: subject.name,
          name: subject.name,
          color: subject.color,
        })
        .select("id, code, name, color, unit_offering_id")
        .single<SubjectRow>();

      if (error) {
        throw error;
      }

      savedSubjects.push(subjectFromRow(data));
      if (subject.unitOfferingId !== undefined) {
        linkChanges.push({
          offeringId: subject.unitOfferingId,
          subjectId: data.id,
        });
      }
    }
  }

  const keptIds = savedSubjects.map((subject) => subject.id);

  if (keptIds.length) {
    const { error } = await supabase
      .from("subjects")
      .update({
        archived_at: new Date().toISOString(),
        unit_offering_id: null,
      })
      .eq("user_id", userId)
      .not("id", "in", `(${keptIds.join(",")})`);

    if (error) {
      throw error;
    }
  } else {
    const { error } = await supabase
      .from("subjects")
      .update({
        archived_at: new Date().toISOString(),
        unit_offering_id: null,
      })
      .eq("user_id", userId)
      .is("archived_at", null);

    if (error) {
      throw error;
    }
  }

  for (const change of linkChanges) {
    await setRemoteSubjectUnitOffering({
      offeringId: change.offeringId,
      subjectId: change.subjectId,
      supabase,
    });
  }

  const { data: refreshedSubjects, error: refreshError } = await supabase
    .from("subjects")
    .select("id, code, name, color, unit_offering_id")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (refreshError) {
    throw refreshError;
  }

  return ((refreshedSubjects ?? []) as SubjectRow[]).map(subjectFromRow);
}

export async function fetchRemoteUnitState(
  supabase: SupabaseClient,
): Promise<RemoteUnitState | null> {
  const userId = await getRemoteUserId();

  if (!userId) {
    return null;
  }

  const [
    enrolmentsResult,
    unitsResult,
    subjectsResult,
    specialUnitsResult,
    specialUnitAliasesResult,
  ] = await Promise.all([
    supabase
      .from("unit_enrolments")
      .select(
        "offering_id, nickname, joined_at, unit_offerings!inner(id, unit_id, study_year, teaching_period, units!inner(id, code))",
      )
      .eq("user_id", userId)
      .is("left_at", null)
      .order("joined_at", { ascending: false }),
    supabase.from("units").select("id, code").order("code").limit(500),
    supabase
      .from("subjects")
      .select("id, code, name, color, unit_offering_id")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("special_units")
      .select("code, name, description")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("special_unit_aliases")
      .select("alias_code, special_unit_code")
      .order("alias_code", { ascending: true }),
  ]);

  if (enrolmentsResult.error) throw enrolmentsResult.error;
  if (unitsResult.error) throw unitsResult.error;
  if (subjectsResult.error) throw subjectsResult.error;

  const enrollments = ((enrolmentsResult.data ?? []) as UnitEnrollmentRow[])
    .map(unitEnrollmentFromRow)
    .filter((value): value is UnitEnrollment => Boolean(value));
  const subjectSuggestions = ((subjectsResult.data ?? []) as SubjectRow[]).map(
    (subject) => ({
      code: subject.code,
      nickname:
        subject.name &&
        subject.name.toUpperCase() !== subject.code.toUpperCase()
          ? subject.name
          : null,
    }),
  );
  const catalogueSuggestions = (
    (unitsResult.data ?? []) as { code: string }[]
  ).map((unit) => ({ code: unit.code, nickname: null }));
  const specialUnitAliases = specialUnitAliasesResult.error
    ? []
    : ((specialUnitAliasesResult.data ?? []) as {
        alias_code: string;
        special_unit_code: string;
      }[]);
  const specialUnits = specialUnitsResult.error
    ? []
    : (
        (specialUnitsResult.data ?? []) as Omit<SpecialUnit, "aliasCodes">[]
      ).map((unit) => ({
        ...unit,
        aliasCodes: specialUnitAliases
          .filter((alias) => alias.special_unit_code === unit.code)
          .map((alias) => alias.alias_code),
      }));

  return {
    enrollments,
    specialUnits,
    subjects: ((subjectsResult.data ?? []) as SubjectRow[]).map(subjectFromRow),
    suggestions: uniqueUnitSuggestions([
      ...subjectSuggestions,
      ...catalogueSuggestions,
    ]),
  };
}

export async function setRemoteSubjectUnitOffering({
  offeringId,
  subjectId,
  supabase,
}: {
  offeringId: string | null;
  subjectId: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase.rpc("set_subject_unit_offering", {
    input_offering_id: offeringId,
    input_subject_id: subjectId,
  });

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function upsertRemoteUnitEnrollment({
  code,
  nickname,
  period,
  supabase,
  year,
}: {
  code: string;
  nickname: string | null;
  period: TeachingPeriod;
  supabase: SupabaseClient;
  year: number;
}) {
  const { data, error } = await supabase.rpc("upsert_unit_enrolment", {
    input_nickname: nickname,
    input_study_year: year,
    input_teaching_period: period,
    input_unit_code: code,
  });

  if (error) {
    throw error;
  }

  return data as string;
}

export async function requestRemoteSpecialUnit({
  code,
  comment,
  name,
  supabase,
}: {
  code: string | null;
  comment: string | null;
  name: string;
  supabase: SupabaseClient;
}) {
  const userId = await getRemoteUserId();

  if (!userId) {
    throw new Error("Sign in to request a unit.");
  }

  const { error } = await supabase.from("special_unit_requests").insert({
    requester_id: userId,
    unit_code: code,
    unit_name: name,
    comment,
  });

  if (error) {
    throw error;
  }
}

export async function leaveRemoteUnitEnrollment({
  offeringId,
  supabase,
}: {
  offeringId: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase.rpc("leave_unit_enrolment", {
    input_offering_id: offeringId,
  });

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function fetchRemoteUnitCohort({
  offeringId,
  supabase,
}: {
  offeringId: string;
  supabase: SupabaseClient;
}): Promise<UnitCohortMember[]> {
  const userId = await getRemoteUserId();

  if (!userId) {
    return [];
  }

  const [cohortResult, friendshipsResult] = await Promise.all([
    supabase.rpc("get_unit_cohort_v2", {
      input_offering_id: offeringId,
    }),
    supabase.from("friendships").select("friend_id").eq("user_id", userId),
  ]);

  if (cohortResult.error) throw cohortResult.error;
  if (friendshipsResult.error) throw friendshipsResult.error;

  const friendIds = new Set(
    ((friendshipsResult.data ?? []) as FriendshipRow[]).map(
      (friendship) => friendship.friend_id,
    ),
  );

  return ((cohortResult.data ?? []) as UnitCohortRow[]).map((member) => ({
    color: member.profile_color || "#FFE330",
    displayName: member.display_name || member.username || "Student",
    handle: member.username ? `@${member.username}` : "@student",
    id: member.user_id,
    isFriend: member.is_friend || friendIds.has(member.user_id),
    mutualFriendCount: Number(member.mutual_friend_count) || 0,
    sharedGroupIds: member.shared_group_ids ?? [],
    studyIcon: member.study_icon || "flame-desk",
  }));
}

export async function fetchRemoteSocialSnapshot(
  supabase: SupabaseClient,
): Promise<RemoteSocialSnapshot | null> {
  const userId = await getRemoteUserId();

  if (!userId) {
    return null;
  }

  const [
    profilesResult,
    friendshipsResult,
    groupsResult,
    membershipsResult,
    sessionsResult,
    friendCandidatesResult,
    friendRequestsResult,
    groupInvitesResult,
    superNudgesResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, display_name, username, avatar_url, study_icon, profile_color",
      )
      .order("display_name", { ascending: true }),
    supabase.from("friendships").select("friend_id").eq("user_id", userId),
    supabase
      .from("groups")
      .select("id, name, icon, invite_code, visibility")
      .order("created_at", {
        ascending: false,
      }),
    supabase
      .from("group_members")
      .select("group_id, user_id, role, status")
      .eq("status", "active"),
    supabase
      .from("study_sessions")
      .select(
        "id, user_id, subject_id, group_id, started_at, ended_at, status, source, duration_seconds",
      )
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(1000),
    supabase.rpc("list_friend_candidates"),
    supabase.rpc("list_friend_requests"),
    supabase.rpc("list_group_invites"),
    supabase
      .from("super_nudge_requests")
      .select("id, sender_id, recipient_id, status, created_at")
      .in("status", ["pending", "active"])
      .order("created_at", { ascending: false }),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (friendshipsResult.error) throw friendshipsResult.error;
  if (groupsResult.error) throw groupsResult.error;
  if (membershipsResult.error) throw membershipsResult.error;
  if (sessionsResult.error) throw sessionsResult.error;

  const profiles = ((profilesResult.data ?? []) as ProfileRow[]).filter(
    (profile) => profile.id,
  );
  const friendships = (friendshipsResult.data ?? []) as FriendshipRow[];
  const groups = (groupsResult.data ?? []) as GroupRow[];
  const memberships = (membershipsResult.data ?? []) as GroupMemberRow[];
  const sessions = (sessionsResult.data ?? []) as SessionRow[];
  const friendIds = new Set(
    friendships.map((friendship) => friendship.friend_id),
  );
  const groupMemberIds = new Set(memberships.map((member) => member.user_id));
  const visibleProfileIds = new Set([userId, ...friendIds, ...groupMemberIds]);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const visibleProfiles = profiles.filter((profile) =>
    visibleProfileIds.has(profile.id),
  );
  const remoteFriends = visibleProfiles.map((profile) => ({
    ...friendFromProfile(profile, sessions),
    isFriend: profile.id === userId || friendIds.has(profile.id),
  }));
  const socialGroups: SocialGroup[] = groups.map((group) => ({
    id: group.id,
    name: group.name,
    icon: normalizeGroupIcon(group.icon),
    memberIds: memberships
      .filter((member) => member.group_id === group.id)
      .map((member) => member.user_id)
      .filter((id) => profileById.has(id)),
    currentUserRole: normalizeGroupRole(
      memberships.find(
        (member) => member.group_id === group.id && member.user_id === userId,
      )?.role,
    ),
    memberRoles: Object.fromEntries(
      memberships
        .filter((member) => member.group_id === group.id)
        .map((member) => [
          member.user_id,
          normalizeGroupRole(member.role) ?? "member",
        ]),
    ),
    visibility: normalizeGroupVisibility(group.visibility),
  }));
  const availableFriends = friendCandidatesResult.error
    ? profiles
        .filter(
          (profile) => profile.id !== userId && !friendIds.has(profile.id),
        )
        .map((profile) => ({
          ...friendFromProfile(profile, []),
          isFriend: false,
          mutualFriendCount: 0,
          requestDirection: null,
        }))
    : ((friendCandidatesResult.data ?? []) as FriendCandidateRow[]).map(
        friendCandidateFromRow,
      );
  const friendRequests = friendRequestsResult.error
    ? []
    : ((friendRequestsResult.data ?? []) as FriendRequestRow[]).map(
        friendRequestFromRow,
      );
  const groupInvites = groupInvitesResult.error
    ? []
    : ((groupInvitesResult.data ?? []) as GroupInviteRow[]).map(
        groupInviteFromRow,
      );
  const superNudges = superNudgesResult.error
    ? []
    : ((superNudgesResult.data ?? []) as SuperNudgeRow[]).map((request) => ({
        createdAt: request.created_at,
        direction:
          request.sender_id === userId
            ? ("outgoing" as const)
            : ("incoming" as const),
        friendId:
          request.sender_id === userId
            ? request.recipient_id
            : request.sender_id,
        id: request.id,
        status: request.status,
      }));

  return {
    currentUserId: userId,
    availableFriends,
    friendRequests,
    groupInvites,
    superNudges,
    socialState: {
      friends: remoteFriends,
      groups: socialGroups.filter((group) => group.currentUserRole),
    },
  };
}

export async function createRemoteGroup({
  name,
  supabase,
}: {
  name: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase.rpc("create_study_group", {
    group_icon: "users",
    group_name: name,
  });

  if (error) {
    throw error;
  }

  return data as string | null;
}

export async function updateRemoteGroupDetails({
  groupId,
  name,
  supabase,
}: {
  groupId: string;
  name: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase
    .from("groups")
    .update({
      icon: "users",
      name,
      visibility: "invite_only",
    })
    .eq("id", groupId);

  if (error) {
    throw error;
  }
}

export async function setRemoteGroupMemberRole({
  groupId,
  role,
  supabase,
  userId,
}: {
  groupId: string;
  role: Exclude<GroupRole, "owner">;
  supabase: SupabaseClient;
  userId: string;
}) {
  const { error } = await supabase.rpc("set_group_member_role", {
    target_group_id: groupId,
    target_user_id: userId,
    new_role: role,
  });

  if (error) throw error;
}

export async function transferRemoteGroupLeadership({
  groupId,
  supabase,
  userId,
}: {
  groupId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const { error } = await supabase.rpc("transfer_group_leadership", {
    target_group_id: groupId,
    target_user_id: userId,
  });

  if (error) throw error;
}

export async function removeRemoteGroupMember({
  groupId,
  supabase,
  userId,
}: {
  groupId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const { error } = await supabase.rpc("remove_group_member", {
    target_group_id: groupId,
    target_user_id: userId,
  });

  if (error) throw error;
}

export async function leaveRemoteGroup({
  groupId,
  supabase,
}: {
  groupId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.rpc("leave_study_group", {
    target_group_id: groupId,
  });

  if (error) throw error;
}

export async function fetchRemoteGroupChatMessages(
  supabase: SupabaseClient,
  groupId: string,
  options: { before?: string; limit?: number } = {},
) {
  const pageSize = Math.min(Math.max(options.limit ?? 50, 1), 100);
  let query = supabase
    .from("group_chat_messages")
    .select("id, group_id, user_id, body, image_path, reply_to_id, created_at")
    .eq("group_id", groupId)
    .is("deleted_at", null);

  if (options.before) {
    query = query.lt("created_at", options.before);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(pageSize + 1);

  if (error) throw error;

  const rows = (data ?? []) as GroupChatRow[];

  const messages = rows
    .slice(0, pageSize)
    .map(groupChatMessageFromRow)
    .reverse();

  return {
    hasMore: rows.length > pageSize,
    messages: await signRemoteGroupChatImages(supabase, messages),
  } satisfies RemoteGroupChatPage;
}

export async function sendRemoteGroupChatMessage({
  body,
  groupId,
  imagePath = null,
  replyToId = null,
}: {
  body?: string;
  groupId: string;
  imagePath?: string | null;
  replyToId?: string | null;
}) {
  const trimmedBody = body?.trim() ?? "";

  if (!trimmedBody && !imagePath) return;

  const response = await fetch("/api/groups/messages", {
    body: JSON.stringify({
      body: trimmedBody,
      groupId,
      imagePath,
      replyToId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await getResponseError(response));
  }

  const result = (await response.json()) as { messageId?: string };
  return result.messageId ?? null;
}

export async function uploadRemoteGroupChatImage({
  file,
  groupId,
  supabase,
}: {
  file: File;
  groupId: string;
  supabase: SupabaseClient;
}) {
  const extension = GROUP_CHAT_IMAGE_EXTENSIONS[file.type];

  if (!extension) {
    throw new Error("Choose a JPG, PNG, WebP or GIF image.");
  }

  if (file.size > GROUP_CHAT_IMAGE_MAX_BYTES) {
    throw new Error("Photos must be 8 MB or smaller.");
  }

  const userId = await getRemoteUserId();
  if (!userId) throw new Error("Sign in to send photos.");

  const imagePath = `${groupId}/${userId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(GROUP_CHAT_IMAGE_BUCKET)
    .upload(imagePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(GROUP_CHAT_IMAGE_BUCKET)
    .createSignedUrl(imagePath, 60 * 60);

  if (signError) {
    await supabase.storage.from(GROUP_CHAT_IMAGE_BUCKET).remove([imagePath]);
    throw signError;
  }

  return { imagePath, imageUrl: data.signedUrl };
}

export async function deleteRemoteGroupChatImage({
  imagePath,
  supabase,
}: {
  imagePath: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.storage
    .from(GROUP_CHAT_IMAGE_BUCKET)
    .remove([imagePath]);

  if (error) throw error;
}

export async function deleteRemoteGroupChatMessage({
  messageId,
  supabase,
}: {
  messageId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.rpc("delete_group_chat_message", {
    target_message_id: messageId,
  });

  if (error) throw error;
}

export async function reportRemoteGroupChatMessage({
  messageId,
  supabase,
}: {
  messageId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.rpc("report_group_chat_message", {
    target_message_id: messageId,
  });

  if (error) throw error;
}

export async function fetchRemoteGroupNotificationSettings({
  groupId,
  supabase,
}: {
  groupId: string;
  supabase: SupabaseClient;
}): Promise<RemoteGroupNotificationSettings> {
  const userId = await getRemoteUserId();
  if (!userId) return { chatMuted: false, nudgesMuted: false };

  const { data, error } = await supabase
    .from("user_group_notification_settings")
    .select("chat_muted, nudges_muted")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .maybeSingle<{ chat_muted: boolean; nudges_muted: boolean }>();

  if (error) throw error;

  return {
    chatMuted: data?.chat_muted ?? false,
    nudgesMuted: data?.nudges_muted ?? false,
  };
}

export async function saveRemoteGroupNotificationSettings({
  groupId,
  settings,
  supabase,
}: {
  groupId: string;
  settings: RemoteGroupNotificationSettings;
  supabase: SupabaseClient;
}) {
  const userId = await getRemoteUserId();
  if (!userId) return;

  const { error } = await supabase
    .from("user_group_notification_settings")
    .upsert(
      {
        chat_muted: settings.chatMuted,
        group_id: groupId,
        nudges_muted: settings.nudgesMuted,
        updated_at: new Date().toISOString(),
        user_id: userId,
      },
      { onConflict: "user_id,group_id" },
    );

  if (error) throw error;
}

export async function fetchRemoteUserNudgeMute({
  groupId,
  supabase,
  userId,
}: {
  groupId: string | null;
  supabase: SupabaseClient;
  userId: string;
}) {
  const currentUserId = await getRemoteUserId();
  if (!currentUserId) return false;

  let query = supabase
    .from("user_nudge_mutes")
    .select("muted_user_id")
    .eq("user_id", currentUserId)
    .eq("muted_user_id", userId);
  query = groupId ? query.eq("group_id", groupId) : query.is("group_id", null);

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function fetchRemoteGlobalNudgeMutes({
  supabase,
}: {
  supabase: SupabaseClient;
}) {
  const currentUserId = await getRemoteUserId();
  if (!currentUserId) return [];

  const { data, error } = await supabase
    .from("user_nudge_mutes")
    .select("muted_user_id")
    .eq("user_id", currentUserId)
    .is("group_id", null);

  if (error) throw error;

  return (data ?? []).map((row) => row.muted_user_id as string);
}

export async function setRemoteUserNudgeMute({
  groupId,
  muted,
  supabase,
  userId,
}: {
  groupId: string | null;
  muted: boolean;
  supabase: SupabaseClient;
  userId: string;
}) {
  const currentUserId = await getRemoteUserId();
  if (!currentUserId) return;

  if (muted) {
    const { error } = await supabase.from("user_nudge_mutes").upsert(
      {
        group_id: groupId,
        muted_user_id: userId,
        user_id: currentUserId,
      },
      { onConflict: "user_id,muted_user_id,group_id" },
    );
    if (error) throw error;
    return;
  }

  let query = supabase
    .from("user_nudge_mutes")
    .delete()
    .eq("user_id", currentUserId)
    .eq("muted_user_id", userId);
  query = groupId ? query.eq("group_id", groupId) : query.is("group_id", null);

  const { error } = await query;

  if (error) throw error;
}

export function subscribeToRemoteGroupChat(
  supabase: SupabaseClient,
  groupId: string,
  onMessage: (message: RemoteGroupChatMessage) => void,
) {
  const channel = supabase
    .channel(`mac-study-chat-${groupId}-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        filter: `group_id=eq.${groupId}`,
        schema: "public",
        table: "group_chat_messages",
      },
      (payload) => {
        const message = groupChatMessageFromRow(payload.new as GroupChatRow);
        void signRemoteGroupChatImages(supabase, [message])
          .then(([signedMessage]) => onMessage(signedMessage ?? message))
          .catch(() => onMessage(message));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function updateRemoteStudyIcon({
  icon,
  supabase,
  userId,
}: {
  icon: PersonIconKey;
  supabase: SupabaseClient;
  userId: string;
}) {
  const currentUserId = await getRemoteUserId();

  if (!currentUserId || currentUserId !== userId) {
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ study_icon: icon })
    .eq("id", userId);

  if (error) {
    throw error;
  }
}

export async function addRemoteFriend({
  friendId,
}: {
  friendId: string;
  supabase: SupabaseClient;
}) {
  return sendRemoteFriendRequest(friendId);
}

export async function sendRemoteFriendRequest(friendId: string) {
  const response = await fetch("/api/friends/requests", {
    body: JSON.stringify({ recipientId: friendId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await getResponseError(response));
  }
}

export async function updateRemoteFriendRequest({
  action,
  requestId,
}: {
  action: "accept" | "cancel" | "decline";
  requestId: string;
}) {
  const response = await fetch("/api/friends/requests", {
    body: JSON.stringify({ action, requestId }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(await getResponseError(response));
  }
}

export async function requestRemoteSuperNudge({
  friendId,
  supabase,
}: {
  friendId: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase.rpc("request_super_nudge", {
    target_user_id: friendId,
  });

  if (error) throw error;
  return data as string;
}

export async function updateRemoteSuperNudge({
  action,
  requestId,
  supabase,
}: {
  action: "accept" | "cancel" | "decline" | "disable";
  requestId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.rpc("respond_super_nudge", {
    request_id: requestId,
    response_action: action,
  });

  if (error) throw error;
}

export async function fetchRemoteNotificationPreferences(
  supabase: SupabaseClient,
): Promise<RemoteNotificationPreferences> {
  const { data, error } = await supabase.rpc("get_notification_preferences");

  if (error) throw error;

  const row = ((data ?? []) as NotificationPreferencesRow[])[0];

  return row
    ? notificationPreferencesFromRow(row)
    : {
        friendNotifications: true,
        nudgeNotifications: true,
        otherNotifications: true,
      };
}

export async function updateRemoteNotificationPreferences({
  preferences,
  supabase,
}: {
  preferences: RemoteNotificationPreferences;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.rpc("update_notification_preferences", {
    next_friend_notifications: preferences.friendNotifications,
    next_nudge_notifications: preferences.nudgeNotifications,
    next_other_notifications: preferences.otherNotifications,
  });

  if (error) throw error;
}

export async function removeRemoteFriend({
  friendId,
  supabase,
}: {
  friendId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.rpc("remove_friend", {
    target_user_id: friendId,
  });

  if (error) {
    throw error;
  }
}

export async function inviteRemoteFriendToGroup({
  friendId,
  groupId,
  supabase: _supabase,
}: {
  friendId: string;
  groupId: string;
  supabase: SupabaseClient;
}) {
  void _supabase;

  const response = await fetch("/api/groups/invites", {
    body: JSON.stringify({ friendId, groupId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;

  if (!response.ok) {
    throw new Error(body?.message ?? "Could not send that group invitation.");
  }
}

export async function updateRemoteGroupInvite({
  action,
  requestId,
}: {
  action: "accept" | "cancel" | "decline";
  requestId: string;
}) {
  const response = await fetch("/api/groups/invites", {
    body: JSON.stringify({ action, requestId }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(await getResponseError(response));
  }
}

export async function sendRemoteNudge({
  groupId = null,
  recipientId,
}: {
  groupId?: string | null;
  recipientId: string;
}) {
  const response = await fetch("/api/nudges", {
    body: JSON.stringify({ groupId, recipientId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const body = (await response.json().catch(() => null)) as {
    message?: string;
    push?: RemoteNudgeDelivery;
  } | null;

  if (!response.ok) {
    throw new Error(body?.message ?? "Nudge failed.");
  }

  return body?.push ?? { sent: 0, skipped: "subscriptions_unavailable" };
}

export function subscribeToRemoteNudges(
  supabase: SupabaseClient,
  recipientId: string,
  onNudge: (nudge: RemoteNudgeNotification) => void,
) {
  const channel = supabase
    .channel(
      `mac-study-nudges-${recipientId}-${Math.random().toString(36).slice(2)}`,
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        filter: `recipient_id=eq.${recipientId}`,
        schema: "public",
        table: "nudges",
      },
      (payload) => {
        onNudge(nudgeFromRow(payload.new as NudgeRow));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToRemoteAppNotifications(
  supabase: SupabaseClient,
  userId: string,
  onNotification: (notification: RemoteAppNotification) => void,
) {
  const channel = supabase
    .channel(
      `mac-study-notifications-${userId}-${Math.random().toString(36).slice(2)}`,
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        filter: `user_id=eq.${userId}`,
        schema: "public",
        table: "app_notifications",
      },
      (payload) =>
        onNotification(
          appNotificationFromRow(payload.new as AppNotificationRow),
        ),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function markRemoteAppNotificationRead({
  notificationId,
  supabase,
}: {
  notificationId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase
    .from("app_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);

  if (error) throw error;
}

export function subscribeToRemoteAppChanges(
  supabase: SupabaseClient,
  onChange: (table?: string) => void,
) {
  const channel = supabase
    .channel(`mac-study-app-data-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "study_sessions" },
      () => onChange("study_sessions"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_members" },
      () => onChange("group_members"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "friendships" },
      () => onChange("friendships"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "friend_requests" },
      () => onChange("friend_requests"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "direct_messages" },
      () => onChange("direct_messages"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "super_nudge_requests" },
      () => onChange("super_nudge_requests"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_invites" },
      () => onChange("group_invites"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_notifications" },
      () => onChange("app_notifications"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_chat_messages" },
      () => onChange("group_chat_messages"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_chat_read_receipts" },
      () => onChange("group_chat_read_receipts"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "groups" },
      () => onChange("groups"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      () => onChange("profiles"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "nudges" },
      () => onChange("nudges"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "subjects" },
      () => onChange("subjects"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "unit_enrolments" },
      () => onChange("unit_enrolments"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "special_units" },
      () => onChange("special_units"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "special_unit_aliases" },
      () => onChange("special_unit_aliases"),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function fetchRemoteDirectMessageUnreadCount({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}) {
  const { count, error } = await supabase
    .from("direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);

  if (error) throw error;

  return count ?? 0;
}

async function fetchRemoteSubjects(supabase: SupabaseClient, userId: string) {
  const { data: existing, error: fetchError } = await supabase
    .from("subjects")
    .select("id, code, name, color, unit_offering_id")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (fetchError) {
    throw fetchError;
  }

  return ((existing ?? []) as SubjectRow[]).map(subjectFromRow);
}

function subjectFromRow(row: SubjectRow): RemoteSubject {
  return {
    id: row.id,
    name: row.name || row.code,
    color: row.color || "#FFE330",
    canonicalCode: row.unit_offering_id ? row.code : undefined,
    unitOfferingId: row.unit_offering_id ?? null,
  };
}

function unitEnrollmentFromRow(row: UnitEnrollmentRow) {
  const offering = firstRelation(row.unit_offerings);
  const unit = offering ? firstRelation(offering.units) : null;

  if (!offering || !unit) {
    return null;
  }

  return {
    code: unit.code,
    joinedAt: row.joined_at,
    nickname: row.nickname,
    offeringId: offering.id,
    period: offering.teaching_period,
    unitId: offering.unit_id,
    year: offering.study_year,
  } satisfies UnitEnrollment;
}

function firstRelation<T>(value: T | T[]) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function nudgeFromRow(row: NudgeRow): RemoteNudgeNotification {
  return {
    id: row.id,
    createdAt: row.created_at,
    groupId: row.group_id,
    message: row.message || "Someone woke you up!",
    senderId: row.sender_id,
  };
}

function friendCandidateFromRow(
  row: FriendCandidateRow,
): RemoteFriendCandidate {
  return {
    ...friendFromProfile(
      {
        avatar_url: row.avatar_url,
        display_name: row.display_name,
        id: row.user_id,
        profile_color: row.profile_color,
        study_icon: row.study_icon,
        username: row.username,
      },
      [],
    ),
    isFriend: false,
    mutualFriendCount: Number(row.mutual_friend_count) || 0,
    requestDirection: row.request_direction,
  };
}

function friendRequestFromRow(row: FriendRequestRow): RemoteFriendRequest {
  return {
    createdAt: row.created_at,
    direction: row.direction,
    id: row.request_id,
    user: {
      ...friendFromProfile(
        {
          avatar_url: row.avatar_url,
          display_name: row.display_name,
          id: row.user_id,
          profile_color: row.profile_color,
          study_icon: row.study_icon,
          username: row.username,
        },
        [],
      ),
      isFriend: false,
    },
  };
}

function groupInviteFromRow(row: GroupInviteRow): RemoteGroupInvite {
  return {
    createdAt: row.created_at,
    direction: row.direction,
    group: {
      id: row.group_id,
      name: row.group_name,
    },
    id: row.invite_id,
    user: {
      ...friendFromProfile(
        {
          avatar_url: row.avatar_url,
          display_name: row.display_name,
          id: row.user_id,
          profile_color: row.profile_color,
          study_icon: row.study_icon,
          username: row.username,
        },
        [],
      ),
      isFriend: true,
    },
  };
}

function notificationPreferencesFromRow(
  row: NotificationPreferencesRow,
): RemoteNotificationPreferences {
  return {
    friendNotifications: row.friend_notifications,
    nudgeNotifications: row.nudge_notifications,
    otherNotifications: row.other_notifications,
  };
}

function appNotificationFromRow(
  row: AppNotificationRow,
): RemoteAppNotification {
  return {
    body: row.body,
    createdAt: row.created_at,
    entityId: row.entity_id,
    id: row.id,
    title: row.title,
    type: row.type,
  };
}

function friendFromProfile(
  profile: ProfileRow,
  sessions: SessionRow[],
): SocialFriend {
  const now = new Date();
  const userSessions = sessions.filter(
    (session) => session.user_id === profile.id,
  );
  const activeSession =
    userSessions.find((session) => session.status === "active") ?? null;
  const dailyStudySeconds = getDailySessionTotals(userSessions, now);
  const totals = getSessionTotals(userSessions, dailyStudySeconds, now);

  return {
    id: profile.id,
    name: profile.display_name || profile.username || "Student",
    handle: profile.username
      ? `@${profile.username}`
      : `@user_${profile.id.slice(0, 6)}`,
    initials: getInitials(profile.display_name || profile.username || "ST"),
    color: normalizeProfileColor(profile.profile_color),
    personIcon: normalizePersonIcon(profile.study_icon),
    studying: userSessions.some((session) => session.status === "active"),
    currentSubject: "General study",
    daySeconds: totals.day,
    weekSeconds: totals.week,
    monthSeconds: totals.month,
    allTimeSeconds: totals.allTime,
    dailyStudySeconds,
    activeStartedAt: activeSession?.started_at ?? null,
    activeUpdatedAt: activeSession ? now.toISOString() : null,
    subjectSeconds: {},
  };
}

function getSessionTotals(
  sessions: SessionRow[],
  dailyStudySeconds: Record<string, number>,
  now = new Date(),
) {
  const todayKey = getLocalDateKey(now);
  const calendarDay = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  const weekStartKey = addDateKeyDays(todayKey, -((calendarDay + 6) % 7));
  const monthStartKey = `${todayKey.slice(0, 7)}-01`;
  const totals = Object.entries(dailyStudySeconds).reduce(
    (result, [dateKey, seconds]) => {
      if (dateKey >= weekStartKey && dateKey <= todayKey) {
        result.week += seconds;
      }

      if (dateKey >= monthStartKey && dateKey <= todayKey) {
        result.month += seconds;
      }

      return result;
    },
    {
      day: dailyStudySeconds[todayKey] ?? 0,
      month: 0,
      week: 0,
    },
  );

  return {
    ...totals,
    allTime: sessions.reduce(
      (total, session) =>
        session.status === "voided"
          ? total
          : total + getSessionDurationSeconds(session, now),
      0,
    ),
  };
}

function getDailySessionTotals(sessions: SessionRow[], now = new Date()) {
  return sessions.reduce<Record<string, number>>((totals, session) => {
    if (session.status === "voided") {
      return totals;
    }

    const sessionEnd = session.ended_at
      ? new Date(session.ended_at)
      : new Date(now);
    let cursor = new Date(session.started_at);

    while (cursor < sessionEnd) {
      const key = getLocalDateKey(cursor);
      const nextDay = getAustralianDateStart(addDateKeyDays(key, 1));
      const segmentEnd = nextDay < sessionEnd ? nextDay : new Date(sessionEnd);
      const seconds = Math.max(
        0,
        Math.floor((segmentEnd.getTime() - cursor.getTime()) / 1000),
      );

      totals[key] = (totals[key] ?? 0) + seconds;
      if (segmentEnd <= cursor) break;
      cursor = segmentEnd;
    }

    return totals;
  }, {});
}

function getSessionDurationSeconds(session: SessionRow, now: Date) {
  return session.ended_at
    ? (session.duration_seconds ??
        getElapsedSeconds(session.started_at, new Date(session.ended_at)))
    : getElapsedSeconds(session.started_at, now);
}

function normalizeGroupIcon(icon: string | null | undefined): GroupIconKey {
  return GROUP_ICON_KEYS.includes(icon as GroupIconKey)
    ? (icon as GroupIconKey)
    : "users";
}

function normalizeGroupRole(
  role: string | null | undefined,
): GroupRole | undefined {
  if (role === "owner" || role === "admin" || role === "member") {
    return role;
  }

  return undefined;
}

function normalizeGroupVisibility(
  visibility: string | null | undefined,
): GroupVisibility {
  void visibility;
  return "private";
}

function groupChatMessageFromRow(row: GroupChatRow): RemoteGroupChatMessage {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    body: row.body ?? "",
    createdAt: row.created_at,
    imagePath: row.image_path,
    imageUrl: null,
    replyToId: row.reply_to_id,
  };
}

async function signRemoteGroupChatImages(
  supabase: SupabaseClient,
  messages: RemoteGroupChatMessage[],
) {
  const imagePaths = [
    ...new Set(
      messages
        .map((message) => message.imagePath)
        .filter((path): path is string => Boolean(path)),
    ),
  ];

  if (!imagePaths.length) return messages;

  const { data, error } = await supabase.storage
    .from(GROUP_CHAT_IMAGE_BUCKET)
    .createSignedUrls(imagePaths, 60 * 60);

  if (error) return messages;

  const urlsByPath = new Map<string, string>();
  (data ?? []).forEach((item, index) => {
    const path = item.path ?? imagePaths[index];
    if (path && item.signedUrl) urlsByPath.set(path, item.signedUrl);
  });

  return messages.map((message) => ({
    ...message,
    imageUrl: message.imagePath
      ? (urlsByPath.get(message.imagePath) ?? null)
      : null,
  }));
}

function normalizePersonIcon(icon: string | null | undefined): PersonIconKey {
  return PERSON_ICON_KEYS.includes(icon as PersonIconKey)
    ? (icon as PersonIconKey)
    : "flame-desk";
}

function normalizeProfileColor(color: string | null | undefined) {
  return PROFILE_COLORS.includes(color as (typeof PROFILE_COLORS)[number])
    ? (color as string)
    : "#FFE330";
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function getResponseError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;

  return body?.message ?? "That request could not be completed.";
}
