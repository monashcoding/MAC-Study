"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Plus,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
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
  subscribeToRemoteAppChanges,
} from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { NudgePill } from "@/components/social/nudge-pill";
import { useNudgeQueue } from "@/components/social/use-nudge-queue";
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
  const [now, setNow] = useState(() => new Date());
  const nudgeQueue = useNudgeQueue(Boolean(remoteClient));

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

  function nudgeFriend(friendId: string) {
    nudgeQueue.enqueue({
      key: friendId,
      recipientId: friendId,
    });
  }

  if (selectedFriend) {
    const nudgeState = nudgeQueue.getState(selectedFriend.id);
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
            aria-label="Back to friends"
            className="mac-focus inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.045)] hover:text-[var(--color-text)]"
            onClick={() => setSelectedFriendId(null)}
            type="button"
          >
            <ArrowLeft aria-hidden size={19} />
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
                  onClick={() => nudgeFriend(selectedFriend.id)}
                  pendingCount={nudgeState.pending}
                />
                {nudgeState.feedback ? (
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">
                    {nudgeState.feedback}
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
            <GroupPicker
              groups={socialState.groups}
              onChange={setInviteGroupId}
              value={inviteGroupId}
            />
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
    <div className="space-y-5 pt-1 lg:space-y-6 lg:pt-0">
      <section className="grid grid-cols-3 gap-2 lg:gap-4">
        <SummaryStat label="Friends" value={`${friendList.length}`} />
        <SummaryStat label="Studying" value={`${studyingCount}`} />
        <SummaryStat label="Groups" value={`${socialState.groups.length}`} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-[var(--color-text-muted)]">
            {friendList.length
              ? `${friendList.length} ${friendList.length === 1 ? "friend" : "friends"}`
              : "Add someone to get started"}
          </p>
          <button
            className="mac-focus inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414]"
            onClick={() => setIsAdding(true)}
            type="button"
          >
            <Plus aria-hidden size={17} />
            Add
          </button>
        </div>

        <div className="grid gap-2 lg:grid-cols-2 lg:gap-3">
          {friendList.map((friend) => (
            <button
              className="mac-focus grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[rgb(255_255_255/0.055)] bg-[rgb(255_255_255/0.028)] px-3 py-3 text-left transition hover:border-[rgb(255_255_255/0.12)] hover:bg-[rgb(255_255_255/0.045)] active:scale-[0.99] lg:min-h-20 lg:px-4"
              key={friend.id}
              onClick={() => {
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
          onClose={() => {
            setIsAdding(false);
            setFriendName("");
            setFriendHandle("");
            setFriendColor(PROFILE_COLORS[1]);
          }}
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
  const isDirty =
    remoteCandidates === null &&
    Boolean(name.trim() || handle.trim() || color !== PROFILE_COLORS[1]);

  return (
    <AppDialog
      bodyClassName={remoteCandidates ? "grid gap-2" : "space-y-5"}
      closeLabel="Close add friend"
      footer={
        remoteCandidates ? null : (
          <button
            className="mac-focus inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-3 text-sm font-semibold text-[#141414] disabled:opacity-45"
            disabled={!name.trim()}
            onClick={onAdd}
            type="button"
          >
            Add friend
          </button>
        )
      }
      isDirty={isDirty}
      onClose={onClose}
      title="Add a friend"
    >
      {remoteCandidates ? (
        remoteCandidates.length ? (
          remoteCandidates.map((candidate, index) => (
            <button
              className="mac-focus grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-3 text-left"
              data-dialog-autofocus={index === 0 ? "" : undefined}
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
        )
      ) : (
        <>
          <label className="block text-sm font-medium">
            Name
            <input
              className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]"
              data-dialog-autofocus
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="e.g. Alex Chen"
              value={name}
            />
          </label>

          <label className="block text-sm font-medium">
            Handle
            <input
              className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]"
              onChange={(event) => onHandleChange(event.target.value)}
              placeholder="e.g. @alex"
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
                    "mac-focus h-11 w-11 rounded-full border transition",
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
        </>
      )}
    </AppDialog>
  );
}

function GroupPicker({
  groups,
  onChange,
  value,
}: {
  groups: SocialState["groups"];
  onChange: (groupId: string) => void;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedGroup = groups.find((group) => group.id === value) ?? null;

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function selectGroup(groupId: string) {
    onChange(groupId);
    setIsOpen(false);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={cn(
          "mac-focus grid h-12 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-[var(--color-surface)] px-3 text-left transition",
          isOpen
            ? "border-[var(--color-mac-yellow)] bg-[var(--color-surface-raised)]"
            : "border-[var(--color-border)] hover:border-[rgb(255_255_255/0.16)]",
        )}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[rgb(255_227_48/0.1)] text-[var(--color-mac-yellow)]">
          <Users aria-hidden size={16} />
        </span>
        <span className="min-w-0">
          <span
            className={cn(
              "block truncate text-sm font-semibold",
              selectedGroup
                ? "text-[var(--color-text)]"
                : "text-[var(--color-text-muted)]",
            )}
          >
            {selectedGroup?.name ?? "Choose group"}
          </span>
          {selectedGroup ? (
            <span className="block truncate text-xs text-[var(--color-text-muted)]">
              {selectedGroup.memberIds.length}{" "}
              {selectedGroup.memberIds.length === 1 ? "member" : "members"}
            </span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden
          className={cn("transition-transform", isOpen && "rotate-180")}
          size={17}
        />
      </button>

      {isOpen ? (
        <div
          className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 max-h-64 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1.5 shadow-[0_18px_50px_rgb(0_0_0/0.45)]"
          role="listbox"
        >
          {groups.length ? (
            groups.map((group) => {
              const selected = group.id === value;

              return (
                <button
                  aria-selected={selected}
                  className={cn(
                    "mac-focus grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2.5 text-left transition",
                    selected
                      ? "bg-[rgb(255_227_48/0.1)] text-[var(--color-text)]"
                      : "text-[var(--color-text-muted)] hover:bg-[rgb(255_255_255/0.045)] hover:text-[var(--color-text)]",
                  )}
                  key={group.id}
                  onClick={() => selectGroup(group.id)}
                  role="option"
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {group.name}
                    </span>
                    <span className="block text-xs text-[var(--color-text-muted)]">
                      {group.memberIds.length}{" "}
                      {group.memberIds.length === 1 ? "member" : "members"}
                    </span>
                  </span>
                  {selected ? (
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-mac-yellow)] text-[#141414]">
                      <Check aria-hidden size={13} />
                    </span>
                  ) : null}
                </button>
              );
            })
          ) : (
            <p className="px-3 py-4 text-center text-sm text-[var(--color-text-muted)]">
              No groups available
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[rgb(255_255_255/0.055)] bg-[linear-gradient(145deg,rgb(255_255_255/0.045),rgb(255_255_255/0.018))] px-3 py-3 text-center lg:px-4 lg:py-4">
      <p className="text-xl font-semibold tabular-nums lg:text-2xl">{value}</p>
      <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </p>
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[rgb(255_255_255/0.035)] px-3 py-3 text-center">
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

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}
