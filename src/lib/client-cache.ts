"use client";

import type {
  RemoteFriendsSnapshot,
  RemoteGroupsSnapshot,
  RemoteTimerState,
} from "@/lib/supabase/app-data/types";

export const REMOTE_CACHE_MAX_AGE_MS = 2 * 60 * 1000;

const REMOTE_TIMER_CACHE_KEY = "mac-study-remote-timer-cache-v2";
const REMOTE_FRIENDS_CACHE_KEY = "mac-study-remote-friends-cache-v2";
const REMOTE_GROUPS_CACHE_KEY = "mac-study-remote-groups-cache-v2";
const LEGACY_CACHE_KEYS = [
  "mac-study-remote-timer-cache",
  "mac-study-remote-social-cache",
];

type CacheEnvelope<T> = {
  cachedAt: number;
  value: T;
  version: 2;
};

let timerCache: CacheEnvelope<RemoteTimerState> | null = null;
let friendsCache: CacheEnvelope<RemoteFriendsSnapshot> | null = null;
let groupsCache: CacheEnvelope<RemoteGroupsSnapshot> | null = null;

export function getCachedRemoteTimerState() {
  timerCache ??= readCache<RemoteTimerState>(REMOTE_TIMER_CACHE_KEY);
  const value = getFreshValue(timerCache, REMOTE_TIMER_CACHE_KEY);
  if (!value) timerCache = null;
  return value;
}

export function cacheRemoteTimerState(state: RemoteTimerState) {
  timerCache = createEnvelope(state);
  writeCache(REMOTE_TIMER_CACHE_KEY, timerCache);
}

export function getCachedRemoteFriendsSnapshot() {
  friendsCache ??= readCache<RemoteFriendsSnapshot>(REMOTE_FRIENDS_CACHE_KEY);
  const value = getFreshValue(friendsCache, REMOTE_FRIENDS_CACHE_KEY);
  if (!value) friendsCache = null;
  return value;
}

export function cacheRemoteFriendsSnapshot(state: RemoteFriendsSnapshot) {
  friendsCache = createEnvelope(state);
  writeCache(REMOTE_FRIENDS_CACHE_KEY, friendsCache);
}

export function getCachedRemoteGroupsSnapshot() {
  groupsCache ??= readCache<RemoteGroupsSnapshot>(REMOTE_GROUPS_CACHE_KEY);
  const value = getFreshValue(groupsCache, REMOTE_GROUPS_CACHE_KEY);
  if (!value) groupsCache = null;
  return value;
}

export function cacheRemoteGroupsSnapshot(state: RemoteGroupsSnapshot) {
  groupsCache = createEnvelope(state);
  writeCache(REMOTE_GROUPS_CACHE_KEY, groupsCache);
}

export function invalidateRemoteTimerCache() {
  timerCache = null;
  removeCache(REMOTE_TIMER_CACHE_KEY);
}

export function invalidateRemoteSocialCaches() {
  friendsCache = null;
  groupsCache = null;
  removeCache(REMOTE_FRIENDS_CACHE_KEY);
  removeCache(REMOTE_GROUPS_CACHE_KEY);
}

export function invalidateRemoteCachesForTable(table?: string) {
  if (!table) {
    invalidateRemoteTimerCache();
    invalidateRemoteSocialCaches();
    return;
  }

  if (
    table === "study_sessions" ||
    table === "subjects" ||
    table === "unit_enrolments" ||
    table === "special_units" ||
    table === "special_unit_aliases"
  ) {
    invalidateRemoteTimerCache();
  }

  if (
    table === "study_sessions" ||
    table === "profiles" ||
    table === "friendships" ||
    table === "friend_requests" ||
    table === "groups" ||
    table === "group_members" ||
    table === "group_invites" ||
    table === "super_nudge_requests"
  ) {
    invalidateRemoteSocialCaches();
  }
}

export function clearRemoteClientCache() {
  invalidateRemoteTimerCache();
  invalidateRemoteSocialCaches();
  LEGACY_CACHE_KEYS.forEach(removeCache);
}

function createEnvelope<T>(value: T): CacheEnvelope<T> {
  return { cachedAt: Date.now(), value, version: 2 };
}

function getFreshValue<T>(
  envelope: CacheEnvelope<T> | null,
  key: string,
): T | null {
  if (!envelope) return null;

  if (Date.now() - envelope.cachedAt > REMOTE_CACHE_MAX_AGE_MS) {
    removeCache(key);
    return null;
  }

  return envelope.value;
}

function readCache<T>(key: string): CacheEnvelope<T> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CacheEnvelope<T>>;
    if (
      parsed.version !== 2 ||
      typeof parsed.cachedAt !== "number" ||
      parsed.value === undefined
    ) {
      removeCache(key);
      return null;
    }

    return parsed as CacheEnvelope<T>;
  } catch {
    removeCache(key);
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    LEGACY_CACHE_KEYS.forEach((legacyKey) =>
      window.localStorage.removeItem(legacyKey),
    );
  } catch {
    // Cache failure should never block app usage.
  }
}

function removeCache(key: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Cache failure should never block app usage.
  }
}
