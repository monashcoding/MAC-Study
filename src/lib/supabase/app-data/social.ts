import type {
  AppSupabaseClient as SupabaseClient,
  Database,
  Json,
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
  type SocialState,
} from "@/lib/social-state";
import { getRemoteUserId } from "./shared";
import type {
  RemoteFriendCandidate,
  RemoteFriendRequest,
  RemoteFriendsSnapshot,
  RemoteGroupInvite,
  RemoteGroupsSnapshot,
  RemoteSuperNudge,
} from "./types";

const SOCIAL_PAGE_SIZE = 100;

type SocialFriendResult =
  Database["public"]["Functions"]["list_social_friends"]["Returns"][number];
type SocialFriendRow = Omit<
  SocialFriendResult,
  | "active_started_at"
  | "avatar_url"
  | "display_name"
  | "profile_color"
  | "study_icon"
  | "username"
> & {
  active_started_at: string | null;
  avatar_url: string | null;
  display_name: string | null;
  profile_color: string | null;
  study_icon: string | null;
  username: string | null;
};

type SocialGroupRow =
  Database["public"]["Functions"]["list_my_study_groups"]["Returns"][number];

type FriendCandidateResult =
  Database["public"]["Functions"]["list_friend_candidates_page"]["Returns"][number];
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
  Database["public"]["Functions"]["list_friend_requests_page"]["Returns"][number];
type FriendRequestRow = Omit<
  FriendRequestResult,
  | "avatar_url"
  | "direction"
  | "display_name"
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
  Database["public"]["Functions"]["list_group_invites_page"]["Returns"][number];
type GroupInviteRow = Omit<
  GroupInviteResult,
  | "avatar_url"
  | "direction"
  | "display_name"
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

type SuperNudgeResult =
  Database["public"]["Functions"]["list_active_super_nudges"]["Returns"][number];
type SuperNudgeRow = Omit<SuperNudgeResult, "status"> & {
  status: "active" | "pending";
};

export async function fetchRemoteFriendsSnapshot(
  supabase: SupabaseClient,
): Promise<RemoteFriendsSnapshot | null> {
  const userId = await getRemoteUserId();
  if (!userId) return null;

  const [friendsResult, groupsResult, candidatesResult, requestsResult, nudgesResult] =
    await Promise.all([
      supabase.rpc("list_social_friends"),
      supabase.rpc("list_my_study_groups"),
      supabase.rpc("list_friend_candidates_page", {
        result_limit: SOCIAL_PAGE_SIZE,
        result_offset: 0,
      }),
      supabase.rpc("list_friend_requests_page", {
        result_limit: SOCIAL_PAGE_SIZE,
        result_offset: 0,
      }),
      supabase.rpc("list_active_super_nudges", {
        result_limit: SOCIAL_PAGE_SIZE,
        result_offset: 0,
      }),
    ]);

  if (friendsResult.error) throw friendsResult.error;
  if (groupsResult.error) throw groupsResult.error;

  const socialState = socialStateFromRows(
    (friendsResult.data ?? []) as SocialFriendRow[],
    (groupsResult.data ?? []) as SocialGroupRow[],
  );
  const availableFriends = candidatesResult.error
    ? socialState.friends
        .filter((friend) => friend.id !== userId && !friend.isFriend)
        .map((friend) => ({
          ...friend,
          mutualFriendCount: 0,
          requestDirection: null,
        }))
    : ((candidatesResult.data ?? []) as FriendCandidateRow[]).map(
        friendCandidateFromRow,
      );
  const friendRequests = requestsResult.error
    ? []
    : ((requestsResult.data ?? []) as FriendRequestRow[]).map(
        friendRequestFromRow,
      );
  const superNudges = nudgesResult.error
    ? []
    : ((nudgesResult.data ?? []) as SuperNudgeRow[]).map((request) =>
        superNudgeFromRow(request, userId),
      );

  return {
    availableFriends,
    currentUserId: userId,
    friendRequests,
    socialState,
    superNudges,
  };
}

export async function fetchRemoteGroupsSnapshot(
  supabase: SupabaseClient,
): Promise<RemoteGroupsSnapshot | null> {
  const userId = await getRemoteUserId();
  if (!userId) return null;

  const [friendsResult, groupsResult, invitesResult] = await Promise.all([
    supabase.rpc("list_social_friends"),
    supabase.rpc("list_my_study_groups"),
    supabase.rpc("list_group_invites_page", {
      result_limit: SOCIAL_PAGE_SIZE,
      result_offset: 0,
    }),
  ]);

  if (friendsResult.error) throw friendsResult.error;
  if (groupsResult.error) throw groupsResult.error;

  return {
    currentUserId: userId,
    groupInvites: invitesResult.error
      ? []
      : ((invitesResult.data ?? []) as GroupInviteRow[]).map(
          groupInviteFromRow,
        ),
    socialState: socialStateFromRows(
      (friendsResult.data ?? []) as SocialFriendRow[],
      (groupsResult.data ?? []) as SocialGroupRow[],
    ),
  };
}

export async function fetchRemoteStudyGroups(
  supabase: SupabaseClient,
): Promise<SocialGroup[]> {
  const userId = await getRemoteUserId();
  if (!userId) return [];

  const { data, error } = await supabase.rpc("list_my_study_groups");
  if (error) throw error;

  return ((data ?? []) as SocialGroupRow[]).map(socialGroupFromRow);
}

function socialStateFromRows(
  friendRows: SocialFriendRow[],
  groupRows: SocialGroupRow[],
): SocialState {
  return {
    friends: friendRows.map(socialFriendFromRow),
    groups: groupRows.map(socialGroupFromRow),
  };
}

function socialFriendFromRow(row: SocialFriendRow): SocialFriend {
  const label = row.display_name || row.username || "Student";

  return {
    activeStartedAt: row.active_started_at,
    activeUpdatedAt: row.active_started_at ? new Date().toISOString() : null,
    allTimeSeconds: Number(row.all_time_seconds) || 0,
    color: normalizeProfileColor(row.profile_color),
    currentSubject: "General study",
    dailyStudySeconds: parseDailyStudySeconds(row.daily_study_seconds),
    daySeconds: Number(row.day_seconds) || 0,
    handle: row.username ? `@${row.username}` : `@user_${row.user_id.slice(0, 6)}`,
    id: row.user_id,
    initials: getInitials(label),
    isFriend: row.is_friend,
    monthSeconds: Number(row.month_seconds) || 0,
    name: label,
    personIcon: normalizePersonIcon(row.study_icon),
    studying: Boolean(row.active_started_at),
    subjectSeconds: {},
    weekSeconds: Number(row.week_seconds) || 0,
  };
}

function socialGroupFromRow(row: SocialGroupRow): SocialGroup {
  return {
    currentUserRole: normalizeGroupRole(row.current_user_role),
    icon: normalizeGroupIcon(row.group_icon),
    id: row.group_id,
    inviteCode: row.invite_code?.trim() || undefined,
    memberIds: row.member_ids ?? [],
    memberRoles: parseMemberRoles(row.member_roles),
    name: row.group_name,
    visibility: normalizeGroupVisibility(row.visibility),
  };
}

function friendCandidateFromRow(row: FriendCandidateRow): RemoteFriendCandidate {
  return {
    ...socialFriendFromProfile(row),
    mutualFriendCount: Number(row.mutual_friend_count) || 0,
    requestDirection: row.request_direction,
  };
}

function friendRequestFromRow(row: FriendRequestRow): RemoteFriendRequest {
  return {
    createdAt: row.created_at,
    direction: row.direction,
    id: row.request_id,
    user: socialFriendFromProfile(row),
  };
}

function groupInviteFromRow(row: GroupInviteRow): RemoteGroupInvite {
  return {
    createdAt: row.created_at,
    direction: row.direction,
    group: { id: row.group_id, name: row.group_name },
    id: row.invite_id,
    user: { ...socialFriendFromProfile(row), isFriend: true },
  };
}

function socialFriendFromProfile(row: {
  display_name: string | null;
  profile_color: string | null;
  study_icon: string | null;
  user_id: string;
  username: string | null;
}): SocialFriend {
  const label = row.display_name || row.username || "Student";

  return {
    activeStartedAt: null,
    activeUpdatedAt: null,
    allTimeSeconds: 0,
    color: normalizeProfileColor(row.profile_color),
    currentSubject: "General study",
    dailyStudySeconds: {},
    daySeconds: 0,
    handle: row.username ? `@${row.username}` : `@user_${row.user_id.slice(0, 6)}`,
    id: row.user_id,
    initials: getInitials(label),
    isFriend: false,
    monthSeconds: 0,
    name: label,
    personIcon: normalizePersonIcon(row.study_icon),
    studying: false,
    subjectSeconds: {},
    weekSeconds: 0,
  };
}

function superNudgeFromRow(
  row: SuperNudgeRow,
  userId: string,
): RemoteSuperNudge {
  return {
    createdAt: row.created_at,
    direction: row.sender_id === userId ? "outgoing" : "incoming",
    friendId: row.sender_id === userId ? row.recipient_id : row.sender_id,
    id: row.request_id,
    status: row.status,
  };
}

function parseDailyStudySeconds(value: Json): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([date, seconds]) => [date, Number(seconds)] as const)
      .filter(([, seconds]) => Number.isFinite(seconds) && seconds >= 0),
  );
}

function parseMemberRoles(value: Json): Record<string, GroupRole> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, GroupRole] =>
        entry[1] === "owner" || entry[1] === "admin" || entry[1] === "member",
    ),
  );
}

function normalizeGroupIcon(icon: string | null | undefined): GroupIconKey {
  return GROUP_ICON_KEYS.includes(icon as GroupIconKey)
    ? (icon as GroupIconKey)
    : "users";
}

function normalizeGroupRole(
  role: string | null | undefined,
): GroupRole | undefined {
  return role === "owner" || role === "admin" || role === "member"
    ? role
    : undefined;
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
