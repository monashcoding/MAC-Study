import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RemoteFriendsSnapshot,
  RemoteGroupsSnapshot,
  RemoteTimerState,
  RemoteUnitState,
} from "./supabase/app-data/types";
import {
  REMOTE_CACHE_MAX_AGE_MS,
  cacheRemoteFriendsSnapshot,
  cacheRemoteGroupsSnapshot,
  cacheRemoteTimerState,
  cacheRemoteUnitState,
  clearRemoteClientCache,
  dedupeRemoteRequest,
  getCachedRemoteFriendsSnapshot,
  getCachedRemoteGroupsSnapshot,
  getCachedRemoteTimerState,
  getCachedRemoteUnitState,
  invalidateRemoteCachesForTable,
  subscribeToRemoteTableChanges,
} from "./client-cache";

const timerState: RemoteTimerState = {
  activeSession: null,
  currentUserId: "viewer",
  sessions: [],
  subjects: [],
  unitEnrollments: [],
};

const friendsSnapshot: RemoteFriendsSnapshot = {
  availableFriends: [],
  currentUserId: "viewer",
  friendRequests: [],
  socialState: { friends: [], groups: [] },
};

const groupsSnapshot: RemoteGroupsSnapshot = {
  currentUserId: "viewer",
  groupInvites: [],
  socialState: { friends: [], groups: [] },
};

const unitState: RemoteUnitState = {
  enrollments: [],
  specialUnits: [],
  subjects: [],
  suggestions: [],
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
    expect(getCachedRemoteFriendsSnapshot("viewer")).toEqual(friendsSnapshot);
    expect(storage.size).toBe(1);

    vi.advanceTimersByTime(REMOTE_CACHE_MAX_AGE_MS + 1);

    expect(getCachedRemoteFriendsSnapshot("viewer")).toBeNull();
    expect(storage.size).toBe(0);
  });

  it("invalidates only the caches affected by a changed table", () => {
    cacheRemoteTimerState(timerState);
    cacheRemoteFriendsSnapshot(friendsSnapshot);
    cacheRemoteGroupsSnapshot(groupsSnapshot);
    cacheRemoteUnitState(unitState, "viewer");

    invalidateRemoteCachesForTable("friendships");

    expect(getCachedRemoteTimerState("viewer")).toEqual(timerState);
    expect(getCachedRemoteFriendsSnapshot("viewer")).toBeNull();
    expect(getCachedRemoteGroupsSnapshot("viewer")).toBeNull();
    expect(getCachedRemoteUnitState("viewer")).toEqual(unitState);
  });

  it("invalidates every derived cache when study sessions change", () => {
    cacheRemoteTimerState(timerState);
    cacheRemoteFriendsSnapshot(friendsSnapshot);
    cacheRemoteGroupsSnapshot(groupsSnapshot);
    cacheRemoteUnitState(unitState, "viewer");

    invalidateRemoteCachesForTable("study_sessions");

    expect(getCachedRemoteTimerState("viewer")).toBeNull();
    expect(getCachedRemoteFriendsSnapshot("viewer")).toBeNull();
    expect(getCachedRemoteGroupsSnapshot("viewer")).toBeNull();
    expect(getCachedRemoteUnitState("viewer")).toEqual(unitState);
  });

  it("invalidates social caches when pins or favourites change", () => {
    for (const table of ["user_pinned_groups", "user_favourite_friends"]) {
      cacheRemoteTimerState(timerState);
      cacheRemoteFriendsSnapshot(friendsSnapshot);
      cacheRemoteGroupsSnapshot(groupsSnapshot);

      invalidateRemoteCachesForTable(table);

      expect(getCachedRemoteTimerState("viewer")).toEqual(timerState);
      expect(getCachedRemoteFriendsSnapshot("viewer")).toBeNull();
      expect(getCachedRemoteGroupsSnapshot("viewer")).toBeNull();
    }
  });

  it("invalidates the units cache when an enrolment changes", () => {
    cacheRemoteUnitState(unitState, "viewer");

    invalidateRemoteCachesForTable("unit_enrolments");

    expect(getCachedRemoteUnitState("viewer")).toBeNull();
  });

  it("rejects every cache entry when the signed-in account changes", () => {
    cacheRemoteTimerState(timerState);
    cacheRemoteFriendsSnapshot(friendsSnapshot);
    cacheRemoteGroupsSnapshot(groupsSnapshot);
    cacheRemoteUnitState(unitState, "viewer");

    expect(getCachedRemoteTimerState("another-user")).toBeNull();
    expect(getCachedRemoteFriendsSnapshot("another-user")).toBeNull();
    expect(getCachedRemoteGroupsSnapshot("another-user")).toBeNull();
    expect(getCachedRemoteUnitState("another-user")).toBeNull();
    expect(storage.size).toBe(0);
  });

  it("deduplicates simultaneous requests within one account", async () => {
    const load = vi.fn().mockResolvedValue({ value: "fresh" });
    const first = dedupeRemoteRequest({ key: "timer", load, userId: "viewer" });
    const second = dedupeRemoteRequest({
      key: "timer",
      load,
      userId: "viewer",
    });

    expect(first).toBe(second);
    await expect(first).resolves.toEqual({ value: "fresh" });
    expect(load).toHaveBeenCalledOnce();

    await dedupeRemoteRequest({ key: "timer", load, userId: "viewer" });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("notifies mounted consumers when a relevant table changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToRemoteTableChanges(listener);

    invalidateRemoteCachesForTable("study_sessions");
    expect(listener).toHaveBeenCalledWith("study_sessions");

    unsubscribe();
    invalidateRemoteCachesForTable("friendships");
    expect(listener).toHaveBeenCalledOnce();
  });
});
