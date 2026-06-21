import { getElapsedSeconds, getLocalDateKey } from "@/lib/timer";

export const SOCIAL_STORAGE_KEY = "mac-study-social-state";

export const GROUP_ICON_KEYS = [
  "users",
  "target",
  "flame",
  "book",
  "trophy",
] as const;

export const PROFILE_COLORS = [
  "#FFE330",
  "#6CB6FF",
  "#42D392",
  "#FF8A65",
  "#B388FF",
  "#F06292",
] as const;

export const PERSON_ICON_KEYS = [
  "flame-desk",
  "clock-desk",
  "lamp-desk",
  "spark-desk",
] as const;

export type GroupIconKey = (typeof GROUP_ICON_KEYS)[number];
export type PersonIconKey = (typeof PERSON_ICON_KEYS)[number];
export type GroupRole = "owner" | "admin" | "member";

export type RankingWindow = "day" | "week" | "month";

export type SocialFriend = {
  id: string;
  name: string;
  handle: string;
  initials: string;
  color: string;
  personIcon: PersonIconKey;
  studying: boolean;
  currentSubject: string;
  daySeconds: number;
  weekSeconds: number;
  monthSeconds: number;
  allTimeSeconds: number;
  activeStartedAt?: string | null;
  activeUpdatedAt?: string | null;
  subjectSeconds: Record<string, number>;
};

export type SocialGroup = {
  id: string;
  name: string;
  icon: GroupIconKey;
  memberIds: string[];
  currentUserRole?: GroupRole;
};

export type SocialState = {
  friends: SocialFriend[];
  groups: SocialGroup[];
};

export const defaultSocialState: SocialState = {
  friends: [
    {
      id: "you",
      name: "You",
      handle: "@steve",
      initials: "S",
      color: "#FFE330",
      personIcon: "flame-desk",
      studying: true,
      currentSubject: "FIT3159",
      daySeconds: 84 * 60,
      weekSeconds: 9 * 60 * 60 + 20 * 60,
      monthSeconds: 34 * 60 * 60 + 10 * 60,
      allTimeSeconds: 148 * 60 * 60 + 12 * 60,
      subjectSeconds: {
        fit3159: 45 * 60,
        fit3077: 26 * 60,
        fit2004: 13 * 60,
      },
    },
    {
      id: "maya",
      name: "Maya Chen",
      handle: "@maya",
      initials: "MC",
      color: "#42D392",
      personIcon: "spark-desk",
      studying: true,
      currentSubject: "FIT3159",
      daySeconds: 2 * 60 * 60 + 20 * 60,
      weekSeconds: 11 * 60 * 60 + 45 * 60,
      monthSeconds: 41 * 60 * 60 + 30 * 60,
      allTimeSeconds: 202 * 60 * 60,
      subjectSeconds: {
        fit3159: 86 * 60,
        fit3077: 34 * 60,
        fit2004: 20 * 60,
      },
    },
    {
      id: "josh",
      name: "Josh Patel",
      handle: "@josh",
      initials: "JP",
      color: "#6CB6FF",
      personIcon: "clock-desk",
      studying: false,
      currentSubject: "FIT3077",
      daySeconds: 58 * 60,
      weekSeconds: 8 * 60 * 60 + 15 * 60,
      monthSeconds: 29 * 60 * 60 + 44 * 60,
      allTimeSeconds: 117 * 60 * 60 + 5 * 60,
      subjectSeconds: {
        fit3159: 12 * 60,
        fit3077: 38 * 60,
        fit2004: 8 * 60,
      },
    },
    {
      id: "ari",
      name: "Ari Nguyen",
      handle: "@ari",
      initials: "AN",
      color: "#B388FF",
      personIcon: "lamp-desk",
      studying: false,
      currentSubject: "FIT2004",
      daySeconds: 34 * 60,
      weekSeconds: 6 * 60 * 60 + 5 * 60,
      monthSeconds: 24 * 60 * 60 + 18 * 60,
      allTimeSeconds: 96 * 60 * 60 + 40 * 60,
      subjectSeconds: {
        fit3159: 4 * 60,
        fit3077: 10 * 60,
        fit2004: 20 * 60,
      },
    },
    {
      id: "lucy",
      name: "Lucy Hart",
      handle: "@lucy",
      initials: "LH",
      color: "#FF8A65",
      personIcon: "flame-desk",
      studying: true,
      currentSubject: "FIT2004",
      daySeconds: 72 * 60,
      weekSeconds: 7 * 60 * 60 + 50 * 60,
      monthSeconds: 31 * 60 * 60 + 5 * 60,
      allTimeSeconds: 135 * 60 * 60 + 20 * 60,
      subjectSeconds: {
        fit3159: 18 * 60,
        fit3077: 16 * 60,
        fit2004: 38 * 60,
      },
    },
  ],
  groups: [
    {
      id: "exam-sprint",
      name: "Exam Sprint",
      icon: "target",
      memberIds: ["you", "maya", "josh", "ari"],
      currentUserRole: "owner",
    },
    {
      id: "lab-night",
      name: "Lab Night",
      icon: "book",
      memberIds: ["you", "josh", "lucy"],
      currentUserRole: "admin",
    },
  ],
};

export function getRankingSeconds(friend: SocialFriend, window: RankingWindow) {
  if (window === "week") {
    return friend.weekSeconds;
  }

  if (window === "month") {
    return friend.monthSeconds;
  }

  return friend.daySeconds;
}

export function normalizeSocialState(value: unknown): SocialState {
  if (!isObject(value)) {
    return defaultSocialState;
  }

  const friends = Array.isArray(value.friends)
    ? value.friends.map(normalizeFriend).filter(Boolean)
    : defaultSocialState.friends;
  const groups = Array.isArray(value.groups)
    ? value.groups.map(normalizeGroup).filter(Boolean)
    : defaultSocialState.groups;

  const mergedFriends = ensureSelf(friends as SocialFriend[]);
  const friendIds = new Set(mergedFriends.map((friend) => friend.id));
  const cleanGroups = (groups as SocialGroup[])
    .map((group) => ({
      ...group,
      memberIds: uniqueIds(group.memberIds).filter((id) => friendIds.has(id)),
    }))
    .filter((group) => group.name && group.memberIds.length);

  return {
    friends: mergedFriends,
    groups: cleanGroups.length ? cleanGroups : defaultSocialState.groups,
  };
}

function normalizeFriend(value: unknown) {
  if (!isObject(value)) {
    return null;
  }

  const name = asString(value.name).trim();

  if (!name) {
    return null;
  }

  return {
    id: asString(value.id) || makeStableId(name),
    name,
    handle: asString(value.handle) || `@${makeStableId(name)}`,
    initials: getInitials(asString(value.initials) || name),
    color: isKnownColor(asString(value.color))
      ? asString(value.color)
      : PROFILE_COLORS[0],
    personIcon: isKnownPersonIcon(asString(value.personIcon))
      ? (asString(value.personIcon) as PersonIconKey)
      : "flame-desk",
    studying: Boolean(value.studying),
    currentSubject: asString(value.currentSubject) || "MAC Study",
    daySeconds: asNumber(value.daySeconds),
    weekSeconds: asNumber(value.weekSeconds),
    monthSeconds: asNumber(value.monthSeconds),
    allTimeSeconds: asNumber(value.allTimeSeconds),
    activeStartedAt: asNullableString(value.activeStartedAt),
    activeUpdatedAt: asNullableString(value.activeUpdatedAt),
    subjectSeconds: isObject(value.subjectSeconds)
      ? normalizeSubjectSeconds(value.subjectSeconds)
      : {},
  } satisfies SocialFriend;
}

function normalizeGroup(value: unknown) {
  if (!isObject(value)) {
    return null;
  }

  const name = asString(value.name).trim();

  if (!name) {
    return null;
  }

  const icon = asString(value.icon);

  return {
    id: asString(value.id) || makeStableId(name),
    name,
    icon: GROUP_ICON_KEYS.includes(icon as GroupIconKey)
      ? (icon as GroupIconKey)
      : "users",
    memberIds: Array.isArray(value.memberIds)
      ? uniqueIds(value.memberIds.map(asString))
      : ["you"],
    currentUserRole: isKnownGroupRole(asString(value.currentUserRole))
      ? (asString(value.currentUserRole) as GroupRole)
      : undefined,
  } satisfies SocialGroup;
}

function ensureSelf(friends: SocialFriend[]) {
  const self = defaultSocialState.friends[0];
  const savedSelf = friends.find((friend) => friend.id === self.id);
  const withoutDuplicateSelf = friends.filter(
    (friend) => friend.id !== self.id,
  );

  return [{ ...self, ...savedSelf, id: self.id }, ...withoutDuplicateSelf];
}

function normalizeSubjectSeconds(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value)
      .map(([subjectId, seconds]) => [subjectId, asNumber(seconds)] as const)
      .filter(([, seconds]) => seconds > 0),
  );
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function isKnownColor(color: string) {
  return PROFILE_COLORS.includes(color as (typeof PROFILE_COLORS)[number]);
}

function isKnownPersonIcon(icon: string) {
  return PERSON_ICON_KEYS.includes(icon as PersonIconKey);
}

function isKnownGroupRole(role: string) {
  return role === "owner" || role === "admin" || role === "member";
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function makeStableId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getLiveRankingSeconds(
  friend: SocialFriend,
  window: RankingWindow | "allTime",
  now = new Date(),
) {
  const baseSeconds =
    window === "allTime"
      ? friend.allTimeSeconds
      : getRankingSeconds(friend, window);

  return baseSeconds + getLiveActiveDelta(friend, window, now);
}

function getLiveActiveDelta(
  friend: SocialFriend,
  window: RankingWindow | "allTime",
  now: Date,
) {
  if (!friend.studying || !friend.activeStartedAt || !friend.activeUpdatedAt) {
    return 0;
  }

  if (!activeSessionCountsForWindow(friend.activeStartedAt, window, now)) {
    return 0;
  }

  return getElapsedSeconds(friend.activeUpdatedAt, now);
}

function activeSessionCountsForWindow(
  activeStartedAt: string,
  window: RankingWindow | "allTime",
  now: Date,
) {
  if (window === "day") {
    return getLocalDateKey(new Date(activeStartedAt)) === getLocalDateKey(now);
  }

  if (window === "week") {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    return new Date(activeStartedAt) >= weekStart;
  }

  if (window === "month") {
    return (
      new Date(activeStartedAt) >=
      new Date(now.getFullYear(), now.getMonth(), 1)
    );
  }

  return true;
}
