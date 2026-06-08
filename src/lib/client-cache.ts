"use client";

import type {
  RemoteSocialSnapshot,
  RemoteTimerState,
} from "@/lib/supabase/app-data";

const REMOTE_TIMER_CACHE_KEY = "mac-study-remote-timer-cache";
const REMOTE_SOCIAL_CACHE_KEY = "mac-study-remote-social-cache";

let timerCache: RemoteTimerState | null = null;
let socialCache: RemoteSocialSnapshot | null = null;

export function getCachedRemoteTimerState() {
  if (timerCache) {
    return timerCache;
  }

  timerCache = readCache<RemoteTimerState>(REMOTE_TIMER_CACHE_KEY);

  return timerCache;
}

export function cacheRemoteTimerState(state: RemoteTimerState) {
  timerCache = state;
  writeCache(REMOTE_TIMER_CACHE_KEY, state);
}

export function getCachedRemoteSocialSnapshot() {
  if (socialCache) {
    return socialCache;
  }

  socialCache = readCache<RemoteSocialSnapshot>(REMOTE_SOCIAL_CACHE_KEY);

  return socialCache;
}

export function cacheRemoteSocialSnapshot(state: RemoteSocialSnapshot) {
  socialCache = state;
  writeCache(REMOTE_SOCIAL_CACHE_KEY, state);
}

function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);

    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cache failure should never block app usage.
  }
}
