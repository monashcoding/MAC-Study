import type {
  AppSupabaseClient as SupabaseClient,
  Database,
  Tables,
} from "../types";
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
} from "@/lib/social-state";
import {
  addDateKeyDays,
  getAustralianDateStart,
  getElapsedSeconds,
  getLocalDateKey,
} from "@/lib/timer";
import { getRemoteUserId, getResponseError } from "./shared";
import type { SessionRow } from "./timer";
import type {
  RemoteFriendCandidate,
  RemoteFriendRequest,
  RemoteGroupInvite,
  RemoteSocialSnapshot,
} from "./types";

type ProfileRow = Pick<
  Tables<"profiles">,
  | "avatar_url"
  | "display_name"
  | "id"
  | "profile_color"
  | "study_icon"
  | "username"
>;

type SocialProfileRow = Omit<ProfileRow, "profile_color" | "study_icon"> & {
  profile_color: string | null;
  study_icon: string | null;
};

type GroupRow = Pick<
  Tables<"groups">,
  "icon" | "id" | "invite_code" | "name" | "visibility"
>;

type GroupMemberRow = Pick<
  Tables<"group_members">,
  "group_id" | "role" | "status" | "user_id"
>;

type FriendshipRow = Pick<Tables<"friendships">, "friend_id">;

type FriendCandidateResult =
  Database["public"]["Functions"]["list_friend_candidates"]["Returns"][number];

type FriendCandidateRow = Omit<
  FriendCandidateResult,
  | "avatar_url"
  | "display_name"
  | "profile_color"
  | "request_direction"
  | "study_icon"
  | "username"
> & {
  avatar_url: string | null;
  display_name: string | null;
  profile_color: string | null;
  request_direction: "incoming" | "outgoing" | null;
  study_icon: string | null;
  username: string | null;
};

type FriendRequestResult =
  Database["public"]["Functions"]["list_friend_requests"]["Returns"][number];

type FriendRequestRow = Omit<
  FriendRequestResult,
  | "avatar_url"
  | "display_name"
  | "direction"
  | "profile_color"
  | "study_icon"
  | "username"
> & {
  avatar_url: string | null;
  direction: "incoming" | "outgoing";
  display_name: string | null;
  profile_color: string | null;
  study_icon: string | null;
  username: string | null;
};

type GroupInviteResult =
  Database["public"]["Functions"]["list_group_invites"]["Returns"][number];

type GroupInviteRow = Omit<
  GroupInviteResult,
  | "avatar_url"
  | "display_name"
  | "direction"
  | "profile_color"
  | "study_icon"
  | "username"
> & {
  avatar_url: string | null;
  direction: "incoming" | "outgoing";
  display_name: string | null;
  profile_color: string | null;
  study_icon: string | null;
  username: string | null;
};

type SuperNudgeRow = Omit<
  Pick<
    Tables<"super_nudge_requests">,
    "created_at" | "id" | "recipient_id" | "sender_id" | "status"
  >,
  "status"
> & { status: "active" | "pending" };

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
    inviteCode: group.invite_code?.trim() || undefined,
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

function friendFromProfile(
  profile: SocialProfileRow,
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
