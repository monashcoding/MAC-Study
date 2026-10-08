"use client";

import type {
  RemoteFriendsSnapshot,
  RemoteGroupsSnapshot,
  RemoteTimerState,
  RemoteUnitState,
} from "@/lib/supabase/app-data/types";

export const REMOTE_CACHE_MAX_AGE_MS = 2 * 60 * 1000;
// Past the fresh window, data is still good enough to paint on launch while
// a refetch runs, so the app opens straight onto the last-known screen.
export const REMOTE_STALE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const REMOTE_TIMER_CACHE_KEY = "mac-study-remote-timer-cache-v3";
const REMOTE_FRIENDS_CACHE_KEY = "mac-study-remote-friends-cache-v3";
const REMOTE_GROUPS_CACHE_KEY = "mac-study-remote-groups-cache-v3";
const REMOTE_UNITS_CACHE_KEY = "mac-study-remote-units-cache-v3";
const LEGACY_CACHE_KEYS = [
  "mac-study-remote-timer-cache",
  "mac-study-remote-social-cache",
  "mac-study-remote-timer-cache-v2",
  "mac-study-remote-friends-cache-v2",
  "mac-study-remote-groups-cache-v2",
];

type CacheEnvelope<T> = {
  cachedAt: number;
  userId: string;
  value: T;
  version: 3;
};

type RemoteTableChangeListener = (table: string) => void;

let timerCache: CacheEnvelope<RemoteTimerState> | null = null;
let friendsCache: CacheEnvelope<RemoteFriendsSnapshot> | null = null;
let groupsCache: CacheEnvelope<RemoteGroupsSnapshot> | null = null;
let unitsCache: CacheEnvelope<RemoteUnitState> | null = null;

const inFlightRemoteRequests = new Map<string, Promise<unknown>>();
const remoteTableChangeListeners = new Set<RemoteTableChangeListener>();

export function getCachedRemoteTimerState(userId: string | null) {
  if (!userId) return null;
  timerCache ??= readCache<RemoteTimerState>(REMOTE_TIMER_CACHE_KEY);
  const value = getFreshValue(timerCache, REMOTE_TIMER_CACHE_KEY, userId);
  if (!value) timerCache = null;
  return value;
}

/** Last-known timer state up to a day old, for painting before a refetch. */
export function getStaleRemoteTimerState(userId: string | null) {
  if (!userId) return null;
  timerCache ??= readCache<RemoteTimerState>(REMOTE_TIMER_CACHE_KEY);
  if (!timerCache || timerCache.userId !== userId) return null;
  if (Date.now() - timerCache.cachedAt > REMOTE_STALE_CACHE_MAX_AGE_MS) {
    return null;
  }
  return timerCache.value;
}

export function cacheRemoteTimerState(state: RemoteTimerState) {
  timerCache = createEnvelope(state, state.currentUserId);
  writeCache(REMOTE_TIMER_CACHE_KEY, timerCache);
}

export function getCachedRemoteFriendsSnapshot(userId: string | null) {
  if (!userId) return null;
  friendsCache ??= readCache<RemoteFriendsSnapshot>(REMOTE_FRIENDS_CACHE_KEY);
  const value = getFreshValue(friendsCache, REMOTE_FRIENDS_CACHE_KEY, userId);
  if (!value) friendsCache = null;
  return value;
}

export function cacheRemoteFriendsSnapshot(state: RemoteFriendsSnapshot) {
  friendsCache = createEnvelope(state, state.currentUserId);
  writeCache(REMOTE_FRIENDS_CACHE_KEY, friendsCache);
}

export function getCachedRemoteGroupsSnapshot(userId: string | null) {
  if (!userId) return null;
  groupsCache ??= readCache<RemoteGroupsSnapshot>(REMOTE_GROUPS_CACHE_KEY);
  const value = getFreshValue(groupsCache, REMOTE_GROUPS_CACHE_KEY, userId);
  if (!value) groupsCache = null;
  return value;
}

export function cacheRemoteGroupsSnapshot(state: RemoteGroupsSnapshot) {
  groupsCache = createEnvelope(state, state.currentUserId);
  writeCache(REMOTE_GROUPS_CACHE_KEY, groupsCache);
}

export function getCachedRemoteUnitState(userId: string | null) {
  if (!userId) return null;
  unitsCache ??= readCache<RemoteUnitState>(REMOTE_UNITS_CACHE_KEY);
  const value = getFreshValue(unitsCache, REMOTE_UNITS_CACHE_KEY, userId);
  if (!value) unitsCache = null;
  return value;
}

export function cacheRemoteUnitState(state: RemoteUnitState, userId: string) {
  unitsCache = createEnvelope(state, userId);
  writeCache(REMOTE_UNITS_CACHE_KEY, unitsCache);
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

export function invalidateRemoteUnitCache() {
  unitsCache = null;
  removeCache(REMOTE_UNITS_CACHE_KEY);
}

export function invalidateRemoteCachesForTable(table?: string) {
  if (!table) {
    invalidateRemoteTimerCache();
    invalidateRemoteSocialCaches();
    invalidateRemoteUnitCache();
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
    table === "subjects" ||
    table === "unit_enrolments" ||
    table === "units" ||
    table === "unit_offerings" ||
    table === "special_units" ||
    table === "special_unit_aliases"
  ) {
    invalidateRemoteUnitCache();
  }

  if (
    table === "study_sessions" ||
    table === "profiles" ||
    table === "friendships" ||
    table === "friend_requests" ||
    table === "groups" ||
    table === "group_members" ||
    table === "group_invites" ||
    table === "user_pinned_groups" ||
    table === "user_favourite_friends"
  ) {
    invalidateRemoteSocialCaches();
  }

  remoteTableChangeListeners.forEach((listener) => {
    try {
      listener(table);
    } catch {
      // A mounted consumer must not block cache invalidation or a mutation.
    }
  });
}

export function subscribeToRemoteTableChanges(
  listener: RemoteTableChangeListener,
) {
  remoteTableChangeListeners.add(listener);
  return () => {
    remoteTableChangeListeners.delete(listener);
  };
}

export function dedupeRemoteRequest<T>({
  key,
  load,
  userId,
}: {
  key: string;
  load: () => Promise<T>;
  userId: string;
}): Promise<T> {
  const scopedKey = `${userId}:${key}`;
  const existing = inFlightRemoteRequests.get(scopedKey) as
    Promise<T> | undefined;

  if (existing) return existing;

  const request = Promise.resolve().then(load);
  inFlightRemoteRequests.set(scopedKey, request);

  const clearRequest = () => {
    if (inFlightRemoteRequests.get(scopedKey) === request) {
      inFlightRemoteRequests.delete(scopedKey);
    }
  };

  void request.then(clearRequest, clearRequest);
  return request;
}

export function clearRemoteClientCache() {
  invalidateRemoteTimerCache();
  invalidateRemoteSocialCaches();
  invalidateRemoteUnitCache();
  inFlightRemoteRequests.clear();
  LEGACY_CACHE_KEYS.forEach(removeCache);
}

function createEnvelope<T>(value: T, userId: string): CacheEnvelope<T> {
  return { cachedAt: Date.now(), userId, value, version: 3 };
}

function getFreshValue<T>(
  envelope: CacheEnvelope<T> | null,
  key: string,
  userId: string,
): T | null {
  if (!envelope) return null;

  const age = Date.now() - envelope.cachedAt;

  if (envelope.userId !== userId || age > REMOTE_STALE_CACHE_MAX_AGE_MS) {
    removeCache(key);
    return null;
  }

  // Expired but within the stale window: keep it stored for stale readers.
  if (age > REMOTE_CACHE_MAX_AGE_MS) return null;

  return envelope.value;
}

function readCache<T>(key: string): CacheEnvelope<T> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CacheEnvelope<T>>;
    if (
      parsed.version !== 3 ||
      typeof parsed.cachedAt !== "number" ||
      typeof parsed.userId !== "string" ||
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
