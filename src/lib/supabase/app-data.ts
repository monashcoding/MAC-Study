import type { SupabaseClient } from "@supabase/supabase-js";
import { subjects as defaultSubjects } from "@/lib/demo-data";
import {
  GROUP_ICON_KEYS,
  PERSON_ICON_KEYS,
  PROFILE_COLORS,
  type GroupIconKey,
  type PersonIconKey,
  type SocialFriend,
  type SocialGroup,
  type SocialState,
} from "@/lib/social-state";
import { getElapsedSeconds } from "@/lib/timer";

export type RemoteSubject = {
  id: string;
  name: string;
  color: string;
};

export type RemoteActiveSession = {
  subjectId: string;
  groupId?: string | null;
  startedAt: string;
};

export type RemoteStoredSession = {
  id: string;
  subjectId: string;
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
  subject_id: string;
  group_id: string | null;
  started_at: string;
  ended_at: string | null;
  status: "active" | "completed" | "needs_confirmation" | "voided";
  source: "timer" | "manual_adjustment";
  duration_seconds: number | null;
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
  subjectId: string;
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
          code: subject.name,
          name: subject.name,
          color: subject.color,
          archived_at: null,
        })
        .eq("id", subject.id)
        .eq("user_id", userId)
        .select("id, code, name, color")
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
        .select("id, code, name, color")
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
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

async function ensureRemoteSubjects(supabase: SupabaseClient, userId: string) {
  const { data: existing, error: fetchError } = await supabase
    .from("subjects")
    .select("id, code, name, color")
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
    .select("id, code, name, color");

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
  };
}

function friendFromProfile(
  profile: ProfileRow,
  sessions: SessionRow[],
): SocialFriend {
  const userSessions = sessions.filter(
    (session) => session.user_id === profile.id,
  );
  const totals = getSessionTotals(userSessions);

  return {
    id: profile.id,
    name: profile.display_name || profile.username || "MAC member",
    handle: profile.username ? `@${profile.username}` : "@mac",
    initials: getInitials(profile.display_name || profile.username || "MAC"),
    color: normalizeProfileColor(profile.profile_color),
    personIcon: normalizePersonIcon(profile.study_icon),
    studying: userSessions.some((session) => session.status === "active"),
    currentSubject: "MAC Study",
    daySeconds: totals.day,
    weekSeconds: totals.week,
    monthSeconds: totals.month,
    allTimeSeconds: totals.allTime,
    subjectSeconds: {},
  };
}

function getSessionTotals(sessions: SessionRow[]) {
  const now = new Date();
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
