"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Check, Plus, Save, Send, Trash2, X } from "lucide-react";
import {
  PROFILE_COLORS,
  SOCIAL_STORAGE_KEY,
  defaultSocialState,
  getLiveRankingSeconds,
  normalizeSocialState,
  type SocialFriend,
  type SocialState,
} from "@/lib/social-state";
import {
  cacheRemoteSocialSnapshot,
  getCachedRemoteSocialSnapshot,
} from "@/lib/client-cache";
import {
  addRemoteFriend,
  fetchRemoteSocialSnapshot,
  inviteRemoteFriendToGroup,
  removeRemoteFriend,
  sendRemoteNudge,
  subscribeToRemoteAppChanges,
} from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { NudgePill } from "@/components/social/nudge-pill";
import { formatDuration } from "@/lib/timer";
import { cn } from "@/lib/utils";

const emptySocialState: SocialState = { friends: [], groups: [] };

export function FriendsDashboard() {
  const [socialState, setSocialState] = useState<SocialState>(emptySocialState);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [inviteGroupId, setInviteGroupId] = useState("");
  const [friendName, setFriendName] = useState("");
  const [friendHandle, setFriendHandle] = useState("");
  const [friendColor, setFriendColor] = useState<string>(PROFILE_COLORS[1]);
  const [remoteClient, setRemoteClient] = useState<SupabaseClient | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [availableFriends, setAvailableFriends] = useState<SocialFriend[]>([]);
  const [nudgingFriendId, setNudgingFriendId] = useState<string | null>(null);
  const [nudgeFeedback, setNudgeFeedback] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const refreshRemoteSocial = useCallback(async (supabase: SupabaseClient) => {
    const snapshot = await fetchRemoteSocialSnapshot(supabase);

    if (snapshot) {
      cacheRemoteSocialSnapshot(snapshot);
      setCurrentUserId(snapshot.currentUserId);
      setSocialState(snapshot.socialState);
      setAvailableFriends(snapshot.availableFriends);
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialState() {
      let supabase: SupabaseClient | null = null;
      const cachedSocial = getCachedRemoteSocialSnapshot();

      if (cachedSocial) {
        setCurrentUserId(cachedSocial.currentUserId);
        setSocialState(cachedSocial.socialState);
        setAvailableFriends(cachedSocial.availableFriends);
        setIsLoaded(true);
      }

      try {
        supabase = createSupabaseBrowserClient();
        if (!cancelled) {
          setRemoteClient(supabase);
        }
        const snapshot = await fetchRemoteSocialSnapshot(supabase);

        if (!cancelled && snapshot) {
          cacheRemoteSocialSnapshot(snapshot);
          setCurrentUserId(snapshot.currentUserId);
          setSocialState(snapshot.socialState);
          setAvailableFriends(snapshot.availableFriends);
          setIsLoaded(true);
          return;
        }
      } catch {
        if (supabase) {
          setRemoteClient(supabase);
          if (!cachedSocial) {
            setSocialState(emptySocialState);
            setAvailableFriends([]);
            setIsLoaded(true);
          }
          return;
        }
      }

      if (cachedSocial) {
        return;
      }

      if (!cancelled) {
        const saved = window.localStorage.getItem(SOCIAL_STORAGE_KEY);

        if (saved) {
          try {
            setSocialState(normalizeSocialState(JSON.parse(saved)));
          } catch {
            setSocialState(defaultSocialState);
          }
        } else {
          setSocialState(defaultSocialState);
        }

        setIsLoaded(true);
      }
    }

    void loadInitialState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || remoteClient) {
      return;
    }

    window.localStorage.setItem(
      SOCIAL_STORAGE_KEY,
      JSON.stringify(socialState),
    );
  }, [isLoaded, remoteClient, socialState]);

  useEffect(() => {
    if (!remoteClient) {
      return;
    }

    return subscribeToRemoteAppChanges(remoteClient, () => {
      void refreshRemoteSocial(remoteClient);
    });
  }, [refreshRemoteSocial, remoteClient]);

  const selfId = currentUserId ?? "you";
  const friendList = socialState.friends.filter(
    (friend) => friend.id !== selfId,
  );
  const selectedFriend =
    friendList.find((friend) => friend.id === selectedFriendId) ?? null;
  const studyingCount = friendList.filter((friend) => friend.studying).length;

  function addFriend() {
    const name = friendName.trim();

    if (!name) {
      return;
    }

    const newFriend: SocialFriend = {
      id: `friend-${crypto.randomUUID()}`,
      name,
      handle: normalizeHandle(friendHandle || name),
      initials: getInitials(name),
      color: friendColor,
      personIcon: "flame-desk",
      studying: false,
      currentSubject: "MAC Study",
      daySeconds: 0,
      weekSeconds: 0,
      monthSeconds: 0,
      allTimeSeconds: 0,
      subjectSeconds: {},
    };

    setSocialState((current) => ({
      ...current,
      friends: [...current.friends, newFriend],
    }));
    setSelectedFriendId(newFriend.id);
    setFriendName("");
    setFriendHandle("");
    setFriendColor(PROFILE_COLORS[1]);
    setIsAdding(false);
  }

  async function addRemoteFriendFromCandidate(friendId: string) {
    if (!remoteClient) {
      return;
    }

    await addRemoteFriend({ friendId, supabase: remoteClient });
    setIsAdding(false);
    await refreshRemoteSocial(remoteClient);
  }

  async function removeFriend(friendId: string) {
    if (remoteClient) {
      await removeRemoteFriend({ friendId, supabase: remoteClient });
      setSelectedFriendId(null);
      await refreshRemoteSocial(remoteClient);
      return;
    }

    setSocialState((current) => ({
      friends: current.friends.filter((friend) => friend.id !== friendId),
      groups: current.groups.map((group) => ({
        ...group,
        memberIds: group.memberIds.filter((memberId) => memberId !== friendId),
      })),
    }));
    setSelectedFriendId(null);
  }

  async function inviteFriendToGroup(friendId: string) {
    if (!inviteGroupId) {
      return;
    }

    if (remoteClient) {
      await inviteRemoteFriendToGroup({
        friendId,
        groupId: inviteGroupId,
        supabase: remoteClient,
      });
      await refreshRemoteSocial(remoteClient);
      return;
    }

    setSocialState((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === inviteGroupId
          ? { ...group, memberIds: uniqueIds([...group.memberIds, friendId]) }
          : group,
      ),
    }));
  }

  async function nudgeFriend(friendId: string) {
    if (!remoteClient) {
      setNudgeFeedback("Sign in to send lock-screen nudges.");
      return;
    }

    setNudgingFriendId(friendId);
    setNudgeFeedback(null);

    try {
      await sendRemoteNudge({ recipientId: friendId });
      setNudgeFeedback("Nudge sent.");
    } catch (error) {
      setNudgeFeedback(getNudgeErrorMessage(error));
    } finally {
      setNudgingFriendId(null);
    }
  }

  if (selectedFriend) {
    const selectedGroup = socialState.groups.find(
      (group) => group.id === inviteGroupId,
    );
    const alreadyInSelectedGroup = Boolean(
      selectedGroup?.memberIds.includes(selectedFriend.id),
    );

    return (
      <div className="space-y-5 pt-1">
        <section className="space-y-4">
          <button
            className="mac-focus inline-flex h-10 items-center gap-2 rounded-md text-sm font-semibold text-[var(--color-text-muted)]"
            onClick={() => setSelectedFriendId(null)}
            type="button"
          >
            <ArrowLeft aria-hidden size={17} />
            Friends
          </button>

          <div className="flex items-center gap-4">
            <ProfileBadge friend={selectedFriend} size="lg" />
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-semibold">
                {selectedFriend.name}
              </h2>
              <p className="mt-1 truncate text-sm font-medium text-[var(--color-text-muted)]">
                {selectedFriend.handle}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <NudgePill
                  disabled={!remoteClient}
                  isSending={nudgingFriendId === selectedFriend.id}
                  onClick={() => void nudgeFriend(selectedFriend.id)}
                />
                {nudgeFeedback ? (
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">
                    {nudgeFeedback}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ProfileStat
            label="Today"
            value={formatDuration(
              getLiveRankingSeconds(selectedFriend, "day", now),
            )}
          />
          <ProfileStat
            label="Week"
            value={formatDuration(
              getLiveRankingSeconds(selectedFriend, "week", now),
            )}
          />
          <ProfileStat
            label="Month"
            value={formatDuration(
              getLiveRankingSeconds(selectedFriend, "month", now),
            )}
          />
          <ProfileStat
            label="All time"
            value={formatDuration(
              getLiveRankingSeconds(selectedFriend, "allTime", now),
            )}
          />
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Groups</h3>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <select
              className="mac-focus h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]"
              onChange={(event) => setInviteGroupId(event.target.value)}
              value={inviteGroupId}
            >
              <option value="">Choose group</option>
              {socialState.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <button
              className="mac-focus inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-3 text-sm font-semibold text-[#141414] disabled:opacity-45"
              disabled={!inviteGroupId || alreadyInSelectedGroup}
              onClick={() => void inviteFriendToGroup(selectedFriend.id)}
              type="button"
            >
              {alreadyInSelectedGroup ? (
                <Check aria-hidden size={17} />
              ) : (
                <Send aria-hidden size={17} />
              )}
              {alreadyInSelectedGroup ? "Invited" : "Invite"}
            </button>
          </div>
        </section>

        <button
          className="mac-focus inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[rgb(255_107_107/0.45)] px-3 text-sm font-semibold text-[var(--color-danger)]"
          onClick={() => void removeFriend(selectedFriend.id)}
          type="button"
        >
          <Trash2 aria-hidden size={16} />
          Remove friend
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-1">
      <section className="grid grid-cols-3 gap-2">
        <SummaryStat label="Friends" value={`${friendList.length}`} />
        <SummaryStat label="Studying" value={`${studyingCount}`} />
        <SummaryStat label="Groups" value={`${socialState.groups.length}`} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">Friends</h2>
          <button
            className="mac-focus inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-3 text-sm font-semibold text-[#141414]"
            onClick={() => setIsAdding(true)}
            type="button"
          >
            <Plus aria-hidden size={17} />
            Add
          </button>
        </div>

        <div className="grid gap-2">
          {friendList.map((friend) => (
            <button
              className="mac-focus grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-3 text-left transition active:scale-[0.99]"
              key={friend.id}
              onClick={() => {
                setNudgeFeedback(null);
                setSelectedFriendId(friend.id);
                setInviteGroupId("");
              }}
              type="button"
            >
              <ProfileBadge friend={friend} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{friend.name}</p>
                <p className="truncate text-sm text-[var(--color-text-muted)]">
                  {friend.handle}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-semibold tabular-nums">
                  {formatDuration(getLiveRankingSeconds(friend, "day", now))}
                </p>
                <p className="text-xs font-medium text-[var(--color-text-muted)]">
                  today
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {isAdding ? (
        <AddFriendDialog
          color={friendColor}
          handle={friendHandle}
          name={friendName}
          onAdd={addFriend}
          onAddRemote={(friendId) =>
            void addRemoteFriendFromCandidate(friendId)
          }
          onClose={() => setIsAdding(false)}
          onColorChange={setFriendColor}
          onHandleChange={setFriendHandle}
          onNameChange={setFriendName}
          remoteCandidates={remoteClient ? availableFriends : null}
        />
      ) : null}
    </div>
  );
}

function AddFriendDialog({
  color,
  handle,
  name,
  onAdd,
  onAddRemote,
  onClose,
  onColorChange,
  onHandleChange,
  onNameChange,
  remoteCandidates,
}: {
  color: string;
  handle: string;
  name: string;
  onAdd: () => void;
  onAddRemote: (friendId: string) => void;
  onClose: () => void;
  onColorChange: (color: string) => void;
  onHandleChange: (handle: string) => void;
  onNameChange: (name: string) => void;
  remoteCandidates: SocialFriend[] | null;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-black/58 px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-[calc(var(--safe-area-top)+0.75rem)] backdrop-blur-sm sm:items-center sm:justify-center"
      role="dialog"
    >
      <div className="w-full max-w-xl rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 p-4">
          <h2 className="text-lg font-semibold">Add friend</h2>
          <button
            className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)]"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden size={18} />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {remoteCandidates ? (
          <div className="grid gap-2 p-4">
            {remoteCandidates.length ? (
              remoteCandidates.map((candidate) => (
                <button
                  className="mac-focus grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-3 text-left"
                  key={candidate.id}
                  onClick={() => onAddRemote(candidate.id)}
                  type="button"
                >
                  <ProfileBadge friend={candidate} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{candidate.name}</p>
                    <p className="truncate text-sm text-[var(--color-text-muted)]">
                      {candidate.handle}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-[var(--color-mac-yellow)]">
                    Add
                  </span>
                </button>
              ))
            ) : (
              <p className="rounded-md bg-[rgb(255_255_255/0.035)] p-4 text-sm text-[var(--color-text-muted)]">
                No new profiles available.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-5 p-4">
              <label className="block text-sm font-medium">
                Name
                <input
                  className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]"
                  onChange={(event) => onNameChange(event.target.value)}
                  placeholder="Friend name"
                  value={name}
                />
              </label>

              <label className="block text-sm font-medium">
                Handle
                <input
                  className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]"
                  onChange={(event) => onHandleChange(event.target.value)}
                  placeholder="@friend"
                  value={handle}
                />
              </label>

              <div>
                <p className="text-sm font-medium">Colour</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {PROFILE_COLORS.map((profileColor) => (
                    <button
                      aria-label={`Use colour ${profileColor}`}
                      className={cn(
                        "mac-focus h-10 w-10 rounded-full border transition",
                        profileColor === color
                          ? "border-white ring-2 ring-[var(--color-mac-yellow)] ring-offset-2 ring-offset-[var(--color-background)]"
                          : "border-[var(--color-border)]",
                      )}
                      key={profileColor}
                      onClick={() => onColorChange(profileColor)}
                      style={{ backgroundColor: profileColor }}
                      type="button"
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4">
              <button
                className="mac-focus inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-3 text-sm font-semibold text-[#141414] disabled:opacity-45"
                disabled={!name.trim()}
                onClick={onAdd}
                type="button"
              >
                <Save aria-hidden size={17} />
                Add friend
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-3 text-center">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </p>
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-3 text-center">
      <p className="font-mono text-sm font-semibold tabular-nums sm:text-base">
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </p>
    </div>
  );
}

function ProfileBadge({
  friend,
  size = "md",
}: {
  friend: SocialFriend;
  size?: "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[#141414]",
        size === "lg" ? "h-16 w-16 text-lg" : "h-11 w-11 text-sm",
        friend.studying
          ? "ring-2 ring-[var(--color-success)] ring-offset-2 ring-offset-[var(--color-background)]"
          : "grayscale",
      )}
      style={{ backgroundColor: friend.color }}
    >
      {friend.initials}
    </span>
  );
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function normalizeHandle(value: string) {
  const handle = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_@]+/g, "");

  if (!handle) {
    return "@friend";
  }

  return handle.startsWith("@") ? handle : `@${handle}`;
}

function getNudgeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    if (error.message.includes("send_nudge")) {
      return "Run the nudge migration first.";
    }

    return error.message;
  }

  return "Could not send nudge.";
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}
