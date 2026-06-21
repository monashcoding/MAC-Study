import type { SupabaseClient } from "@supabase/supabase-js";
import { subjects as defaultSubjects } from "@/lib/demo-data";
import {
  GROUP_ICON_KEYS,
  PERSON_ICON_KEYS,
  PROFILE_COLORS,
  type GroupIconKey,
  type GroupRole,
  type PersonIconKey,
  type SocialFriend,
  type SocialGroup,
  type SocialState,
} from "@/lib/social-state";
import { getElapsedSeconds } from "@/lib/timer";
import {
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
  suggestions: UnitSuggestion[];
};

export type RemoteActiveSession = {
  subjectId: string | null;
  groupId?: string | null;
  startedAt: string;
};

export type RemoteStoredSession = {
  id: string;
  subjectId: string | null;
  groupId?: string | null;
  startedAt: string;
  endedAt: string;
  status: "completed" | "needs_confirmation";
  source: "timer";
};

export type RemoteTimerState = {
  subjects: RemoteSubject[];
  activeSession: RemoteActiveSession | null;
  sessions: RemoteStoredSession[];
};

export type RemoteSocialSnapshot = {
  socialState: SocialState;
  availableFriends: SocialFriend[];
  currentUserId: string;
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

type SessionRow = {
  id: string;
  user_id: string;
  subject_id: string | null;
  group_id: string | null;
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

export async function getRemoteUserId(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

export async function fetchRemoteTimerState(
  supabase: SupabaseClient,
): Promise<RemoteTimerState | null> {
  const userId = await getRemoteUserId(supabase);

  if (!userId) {
    return null;
  }

  const subjects = await ensureRemoteSubjects(supabase, userId);
  const { data, error } = await supabase
    .from("study_sessions")
    .select(
      "id, user_id, subject_id, group_id, started_at, ended_at, status, source, duration_seconds",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("started_at", { ascending: false })
    .limit(250);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as SessionRow[];
  const activeRow =
    rows.find((row) => row.status === "active" && !row.ended_at) ?? null;
  const completedRows = rows.filter(
    (row) =>
      row.ended_at &&
      (row.status === "completed" || row.status === "needs_confirmation"),
  );

  return {
    subjects,
    activeSession: activeRow
      ? {
          subjectId: activeRow.subject_id,
          groupId: activeRow.group_id,
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
      source: "timer",
    })),
  };
}

export async function startRemoteStudySession({
  groupId = null,
  subjectId,
  supabase,
}: {
  groupId?: string | null;
  subjectId: string | null;
  supabase: SupabaseClient;
}) {
  const userId = await getRemoteUserId(supabase);

  if (!userId) {
    return;
  }

  const { error } = await supabase.from("study_sessions").insert({
    user_id: userId,
    subject_id: subjectId,
    group_id: groupId,
    started_at: new Date().toISOString(),
    status: "active",
    source: "timer",
  });

  if (error) {
    throw error;
  }
}

export async function stopRemoteStudySession(supabase: SupabaseClient) {
  const userId = await getRemoteUserId(supabase);

  if (!userId) {
    return;
  }

  const endedAt = new Date().toISOString();
  const { error } = await supabase
    .from("study_sessions")
    .update({ ended_at: endedAt, status: "completed" })
    .eq("user_id", userId)
    .is("ended_at", null)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function saveRemoteSubjects({
  subjects,
  supabase,
}: {
  subjects: RemoteSubject[];
  supabase: SupabaseClient;
}) {
  const userId = await getRemoteUserId(supabase);

  if (!userId) {
    return subjects;
  }

  const savedSubjects: RemoteSubject[] = [];

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
    }
  }

  const keptIds = savedSubjects.map((subject) => subject.id);

  if (keptIds.length) {
    const { error } = await supabase
      .from("subjects")
      .update({ archived_at: new Date().toISOString() })
      .eq("user_id", userId)
      .not("id", "in", `(${keptIds.join(",")})`);

    if (error) {
      throw error;
    }
  }

  return savedSubjects;
}

export async function fetchRemoteUnitState(
  supabase: SupabaseClient,
): Promise<RemoteUnitState | null> {
  const userId = await getRemoteUserId(supabase);

  if (!userId) {
    return null;
  }

  const [enrolmentsResult, unitsResult, subjectsResult] = await Promise.all([
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

  return {
    enrollments,
    suggestions: uniqueUnitSuggestions([
      ...subjectSuggestions,
      ...catalogueSuggestions,
    ]),
  };
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
  const userId = await getRemoteUserId(supabase);

  if (!userId) {
    return [];
  }

  const [cohortResult, friendshipsResult] = await Promise.all([
    supabase.rpc("get_unit_cohort", {
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
    displayName: member.display_name || member.username || "MAC member",
    handle: member.username ? `@${member.username}` : "@mac_member",
    id: member.user_id,
    isFriend: member.is_friend || friendIds.has(member.user_id),
    sharedGroupIds: member.shared_group_ids ?? [],
    studyIcon: member.study_icon || "flame-desk",
  }));
}

export async function fetchRemoteSocialSnapshot(
  supabase: SupabaseClient,
): Promise<RemoteSocialSnapshot | null> {
  const userId = await getRemoteUserId(supabase);

  if (!userId) {
    return null;
  }

  const [
    profilesResult,
    friendshipsResult,
    groupsResult,
    membershipsResult,
    sessionsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, display_name, username, avatar_url, study_icon, profile_color",
      )
      .order("display_name", { ascending: true }),
    supabase.from("friendships").select("friend_id").eq("user_id", userId),
    supabase.from("groups").select("id, name, icon").order("created_at", {
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
  const remoteFriends = visibleProfiles.map((profile) =>
    friendFromProfile(profile, sessions),
  );
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
  }));
  const availableFriends = profiles
    .filter((profile) => profile.id !== userId && !friendIds.has(profile.id))
    .map((profile) => friendFromProfile(profile, []));

  return {
    currentUserId: userId,
    availableFriends,
    socialState: {
      friends: remoteFriends,
      groups: socialGroups.filter((group) => group.memberIds.length),
    },
  };
}

export async function createRemoteGroup({
  icon,
  name,
  supabase,
}: {
  icon: GroupIconKey;
  name: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase.rpc("create_study_group", {
    group_icon: icon,
    group_name: name,
  });

  if (error) {
    throw error;
  }

  return data as string | null;
}

export async function updateRemoteGroupIcon({
  groupId,
  icon,
  supabase,
}: {
  groupId: string;
  icon: GroupIconKey;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase
    .from("groups")
    .update({ icon })
    .eq("id", groupId);

  if (error) {
    throw error;
  }
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
  const currentUserId = await getRemoteUserId(supabase);

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
  supabase,
}: {
  friendId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.rpc("add_friend", {
    target_user_id: friendId,
  });

  if (error) {
    throw error;
  }
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
  supabase,
}: {
  friendId: string;
  groupId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.rpc("invite_friend_to_group", {
    target_group_id: groupId,
    target_user_id: friendId,
  });

  if (error) {
    throw error;
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

export function subscribeToRemoteAppChanges(
  supabase: SupabaseClient,
  onChange: () => void,
) {
  const channel = supabase
    .channel(`mac-study-app-data-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "study_sessions" },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_members" },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "friendships" },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "groups" },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "nudges" },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "subjects" },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "unit_enrolments" },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

async function ensureRemoteSubjects(supabase: SupabaseClient, userId: string) {
  const { data: existing, error: fetchError } = await supabase
    .from("subjects")
    .select("id, code, name, color, unit_offering_id")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (fetchError) {
    throw fetchError;
  }

  if (existing?.length) {
    return (existing as SubjectRow[]).map(subjectFromRow);
  }

  const seedRows = defaultSubjects.map((subject) => ({
    user_id: userId,
    code: subject.code,
    name: subject.code,
    color: subject.color,
  }));
  const { data: inserted, error: insertError } = await supabase
    .from("subjects")
    .insert(seedRows)
    .select("id, code, name, color, unit_offering_id");

  if (insertError) {
    throw insertError;
  }

  return ((inserted ?? []) as SubjectRow[]).map(subjectFromRow);
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
  const totals = getSessionTotals(userSessions, now);

  return {
    id: profile.id,
    name: profile.display_name || profile.username || "MAC member",
    handle: profile.username
      ? `@${profile.username}`
      : `@user_${profile.id.slice(0, 6)}`,
    initials: getInitials(profile.display_name || profile.username || "MAC"),
    color: normalizeProfileColor(profile.profile_color),
    personIcon: normalizePersonIcon(profile.study_icon),
    studying: userSessions.some((session) => session.status === "active"),
    currentSubject: "MAC Study",
    daySeconds: totals.day,
    weekSeconds: totals.week,
    monthSeconds: totals.month,
    allTimeSeconds: totals.allTime,
    activeStartedAt: activeSession?.started_at ?? null,
    activeUpdatedAt: activeSession ? now.toISOString() : null,
    subjectSeconds: {},
  };
}

function getSessionTotals(sessions: SessionRow[], now = new Date()) {
  const todayKey = now.toISOString().slice(0, 10);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return sessions.reduce(
    (totals, session) => {
      if (session.status === "voided") {
        return totals;
      }

      const startedAt = new Date(session.started_at);
      const seconds = session.ended_at
        ? (session.duration_seconds ??
          getElapsedSeconds(session.started_at, new Date(session.ended_at)))
        : getElapsedSeconds(session.started_at, now);

      totals.allTime += seconds;

      if (startedAt.toISOString().slice(0, 10) === todayKey) {
        totals.day += seconds;
      }

      if (startedAt >= weekStart) {
        totals.week += seconds;
      }

      if (startedAt >= monthStart) {
        totals.month += seconds;
      }

      return totals;
    },
    { allTime: 0, day: 0, month: 0, week: 0 },
  );
}

function normalizeGroupIcon(icon: string | null | undefined): GroupIconKey {
  return GROUP_ICON_KEYS.includes(icon as GroupIconKey)
    ? (icon as GroupIconKey)
    : "users";
}

function normalizeGroupRole(role: string | null | undefined): GroupRole {
  return role === "owner" || role === "admin" ? role : "member";
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
