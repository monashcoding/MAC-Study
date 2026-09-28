import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RemoteFriendsSnapshot,
  RemoteGroupsSnapshot,
  RemoteTimerState,
} from "./supabase/app-data/types";
import {
  REMOTE_CACHE_MAX_AGE_MS,
  cacheRemoteFriendsSnapshot,
  cacheRemoteGroupsSnapshot,
  cacheRemoteTimerState,
  clearRemoteClientCache,
  getCachedRemoteFriendsSnapshot,
  getCachedRemoteGroupsSnapshot,
  getCachedRemoteTimerState,
  invalidateRemoteCachesForTable,
} from "./client-cache";

const timerState: RemoteTimerState = {
  activeSession: null,
  sessions: [],
  subjects: [],
  unitEnrollments: [],
};

const friendsSnapshot: RemoteFriendsSnapshot = {
  availableFriends: [],
  currentUserId: "viewer",
  friendRequests: [],
  socialState: { friends: [], groups: [] },
  superNudges: [],
};

const groupsSnapshot: RemoteGroupsSnapshot = {
  currentUserId: "viewer",
  groupInvites: [],
  socialState: { friends: [], groups: [] },
};

let storage: Map<string, string>;

beforeEach(() => {
  storage = new Map();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T00:00:00Z"));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  clearRemoteClientCache();
});

afterEach(() => {
  clearRemoteClientCache();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("remote client cache freshness", () => {
  it("expires cached data and removes it from persistent storage", () => {
    cacheRemoteFriendsSnapshot(friendsSnapshot);
    expect(getCachedRemoteFriendsSnapshot()).toEqual(friendsSnapshot);
    expect(storage.size).toBe(1);

    vi.advanceTimersByTime(REMOTE_CACHE_MAX_AGE_MS + 1);

    expect(getCachedRemoteFriendsSnapshot()).toBeNull();
    expect(storage.size).toBe(0);
  });

  it("invalidates only the caches affected by a changed table", () => {
    cacheRemoteTimerState(timerState);
    cacheRemoteFriendsSnapshot(friendsSnapshot);
    cacheRemoteGroupsSnapshot(groupsSnapshot);

    invalidateRemoteCachesForTable("friendships");

    expect(getCachedRemoteTimerState()).toEqual(timerState);
    expect(getCachedRemoteFriendsSnapshot()).toBeNull();
    expect(getCachedRemoteGroupsSnapshot()).toBeNull();
  });

  it("invalidates every derived cache when study sessions change", () => {
    cacheRemoteTimerState(timerState);
    cacheRemoteFriendsSnapshot(friendsSnapshot);
    cacheRemoteGroupsSnapshot(groupsSnapshot);

    invalidateRemoteCachesForTable("study_sessions");

    expect(getCachedRemoteTimerState()).toBeNull();
    expect(getCachedRemoteFriendsSnapshot()).toBeNull();
    expect(getCachedRemoteGroupsSnapshot()).toBeNull();
  });
});
