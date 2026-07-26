"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Check, Clock3, Plus, Send, Users } from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
import { PaginatedList } from "@/components/paginated-list";
import { StudyHeatmap } from "@/components/study-heatmap";
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
  updateRemoteFriendRequest,
  type RemoteFriendCandidate,
  type RemoteFriendRequest,
} from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { NudgePill } from "@/components/social/nudge-pill";
import { useNudgeQueue } from "@/components/social/use-nudge-queue";
import { TransientToast } from "@/components/transient-toast";
import { formatDuration } from "@/lib/timer";
import { cn } from "@/lib/utils";

const emptySocialState: SocialState = { friends: [], groups: [] };

export function FriendsDashboard() {
  const [socialState, setSocialState] = useState<SocialState>(emptySocialState);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const [isRemovingFriend, setIsRemovingFriend] = useState(false);
  const [invitedGroupIds, setInvitedGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingInviteGroupIds, setPendingInviteGroupIds] = useState<
    Set<string>
  >(() => new Set());
  const [friendName, setFriendName] = useState("");
  const [friendHandle, setFriendHandle] = useState("");
  const [friendColor, setFriendColor] = useState<string>(PROFILE_COLORS[1]);
  const [remoteClient, setRemoteClient] = useState<SupabaseClient | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [availableFriends, setAvailableFriends] = useState<
    RemoteFriendCandidate[]
  >([]);
  const [friendRequests, setFriendRequests] = useState<RemoteFriendRequest[]>(
    [],
  );
  const [activeTab, setActiveTab] = useState<"friends" | "requests">("friends");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const pendingFriendRequestIdsRef = useRef(new Set<string>());
  const pendingCancelledRequestsRef = useRef(new Map<string, string>());
  const nudgeQueue = useNudgeQueue(Boolean(remoteClient));

  const refreshRemoteSocial = useCallback(async (supabase: SupabaseClient) => {
    const snapshot = await fetchRemoteSocialSnapshot(supabase);

    if (snapshot) {
      const cancellingFriendIds = new Set(
        pendingCancelledRequestsRef.current.values(),
      );
      cacheRemoteSocialSnapshot(snapshot);
      setCurrentUserId(snapshot.currentUserId);
      setSocialState(snapshot.socialState);
      setAvailableFriends(
        sortFriendCandidates(
          snapshot.availableFriends.map((friend) => {
            if (cancellingFriendIds.has(friend.id)) {
              return { ...friend, requestDirection: null };
            }

            return pendingFriendRequestIdsRef.current.has(friend.id)
              ? { ...friend, requestDirection: "outgoing" }
              : friend;
          }),
        ),
      );
      setFriendRequests((current) => {
        const remoteRequests = (snapshot.friendRequests ?? []).filter(
          (request) => !pendingCancelledRequestsRef.current.has(request.id),
        );
        const remoteUserIds = new Set(
          remoteRequests.map((request) => request.user.id),
        );
        const pendingRequests = current.filter(
          (request) =>
            request.id.startsWith("optimistic-") &&
            pendingFriendRequestIdsRef.current.has(request.user.id) &&
            !remoteUserIds.has(request.user.id),
        );

        return [...pendingRequests, ...remoteRequests];
      });
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
        setAvailableFriends(
          sortFriendCandidates(cachedSocial.availableFriends ?? []),
        );
        setFriendRequests(cachedSocial.friendRequests ?? []);
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
          setAvailableFriends(sortFriendCandidates(snapshot.availableFriends));
          setFriendRequests(snapshot.friendRequests ?? []);
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

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "requests") {
      setActiveTab("requests");
    }

    const openRequests = () => setActiveTab("requests");
    window.addEventListener("mac-open-friend-requests", openRequests);

    return () =>
      window.removeEventListener("mac-open-friend-requests", openRequests);
  }, []);

  const selfId = currentUserId ?? "you";
  const friendList = socialState.friends.filter(
    (friend) => friend.id !== selfId,
  );
  const selectedFriend =
    friendList.find((friend) => friend.id === selectedFriendId) ?? null;
  useEffect(() => {
    const friendId = new URLSearchParams(window.location.search).get("friend");
    if (!friendId || !friendList.some((friend) => friend.id === friendId)) {
      return;
    }

    setSelectedFriendId(friendId);
    const url = new URL(window.location.href);
    url.searchParams.delete("friend");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [friendList]);

  const studyingCount = friendList.filter((friend) => friend.studying).length;
  const incomingRequests = friendRequests.filter(
    (request) => request.direction === "incoming",
  );
  const outgoingRequests = friendRequests.filter(
    (request) => request.direction === "outgoing",
  );

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
      currentSubject: "General study",
      daySeconds: 0,
      weekSeconds: 0,
      monthSeconds: 0,
      allTimeSeconds: 0,
      subjectSeconds: {},
    };

    setFriendRequests((current) => [
      {
        createdAt: new Date().toISOString(),
        direction: "outgoing",
        id: `request-${crypto.randomUUID()}`,
        user: newFriend,
      },
      ...current,
    ]);
    setActiveTab("requests");
    setFriendName("");
    setFriendHandle("");
    setFriendColor(PROFILE_COLORS[1]);
    setIsAdding(false);
    setToastMessage("Friend request sent");
  }

  async function addRemoteFriendFromCandidate(friendId: string) {
    if (!remoteClient) return;

    const candidate = availableFriends.find((friend) => friend.id === friendId);
    if (!candidate || candidate.requestDirection) return;

    const optimisticRequestId = `optimistic-${friendId}`;
    pendingFriendRequestIdsRef.current.add(friendId);
    setFeedback(null);
    setToastMessage("Friend request sent");
    setAvailableFriends((current) =>
      current.map((friend) =>
        friend.id === friendId
          ? { ...friend, requestDirection: "outgoing" }
          : friend,
      ),
    );
    setFriendRequests((current) => [
      {
        createdAt: new Date().toISOString(),
        direction: "outgoing",
        id: optimisticRequestId,
        user: candidate,
      },
      ...current.filter((request) => request.user.id !== friendId),
    ]);

    try {
      await addRemoteFriend({ friendId, supabase: remoteClient });
      pendingFriendRequestIdsRef.current.delete(friendId);
    } catch (error) {
      pendingFriendRequestIdsRef.current.delete(friendId);
      setAvailableFriends((current) =>
        current.map((friend) =>
          friend.id === friendId
            ? { ...friend, requestDirection: null }
            : friend,
        ),
      );
      setFriendRequests((current) =>
        current.filter((request) => request.id !== optimisticRequestId),
      );
      setToastMessage(null);
      setFeedback(getErrorMessage(error, "Could not send that request."));
    }
  }

  async function cancelFriendRequest(request: RemoteFriendRequest) {
    pendingCancelledRequestsRef.current.set(request.id, request.user.id);
    setFeedback(null);
    setToastMessage("Friend request cancelled");
    setFriendRequests((current) =>
      current.filter((item) => item.id !== request.id),
    );
    setAvailableFriends((current) =>
      current.map((friend) =>
        friend.id === request.user.id
          ? { ...friend, requestDirection: null }
          : friend,
      ),
    );

    try {
      if (remoteClient) {
        await updateRemoteFriendRequest({
          action: "cancel",
          requestId: request.id,
        });
        await refreshRemoteSocial(remoteClient);
      }

      pendingCancelledRequestsRef.current.delete(request.id);
    } catch (error) {
      pendingCancelledRequestsRef.current.delete(request.id);
      setFriendRequests((current) =>
        current.some((item) => item.id === request.id)
          ? current
          : [request, ...current],
      );
      setAvailableFriends((current) =>
        current.map((friend) =>
          friend.id === request.user.id
            ? { ...friend, requestDirection: "outgoing" }
            : friend,
        ),
      );
      setToastMessage(null);
      setFeedback(getErrorMessage(error, "Could not cancel that request."));
    }
  }

  async function updateFriendRequest(
    request: RemoteFriendRequest,
    action: "accept" | "cancel" | "decline",
  ) {
    if (action === "cancel") {
      await cancelFriendRequest(request);
      return;
    }

    setBusyKey(`${action}:${request.id}`);
    setFeedback(null);

    try {
      if (remoteClient) {
        await updateRemoteFriendRequest({ action, requestId: request.id });
        await refreshRemoteSocial(remoteClient);
      } else {
        setFriendRequests((current) =>
          current.filter((item) => item.id !== request.id),
        );

        if (action === "accept") {
          setSocialState((current) => ({
            ...current,
            friends: uniqueFriends([...current.friends, request.user]),
          }));
        }
      }
    } catch (error) {
      setFeedback(getErrorMessage(error, "Could not update that request."));
    } finally {
      setBusyKey(null);
    }
  }

  async function removeFriend(friendId: string) {
    setIsRemovingFriend(true);
    setFeedback(null);

    try {
      if (remoteClient) {
        await removeRemoteFriend({ friendId, supabase: remoteClient });
        setIsRemoveDialogOpen(false);
        setSelectedFriendId(null);
        await refreshRemoteSocial(remoteClient);
        return;
      }

      setSocialState((current) => ({
        friends: current.friends.filter((friend) => friend.id !== friendId),
        groups: current.groups.map((group) => ({
          ...group,
          memberIds: group.memberIds.filter(
            (memberId) => memberId !== friendId,
          ),
        })),
      }));
      setIsRemoveDialogOpen(false);
      setSelectedFriendId(null);
    } catch (error) {
      setFeedback(getErrorMessage(error, "Could not remove that friend."));
    } finally {
      setIsRemovingFriend(false);
    }
  }

  async function inviteFriendToGroup(friendId: string, groupId: string) {
    if (invitedGroupIds.has(groupId) || pendingInviteGroupIds.has(groupId)) {
      return;
    }

    setFeedback(null);
    setInvitedGroupIds((current) => new Set(current).add(groupId));
    setPendingInviteGroupIds((current) => new Set(current).add(groupId));

    setSocialState((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? { ...group, memberIds: uniqueIds([...group.memberIds, friendId]) }
          : group,
      ),
    }));

    try {
      if (remoteClient) {
        await inviteRemoteFriendToGroup({
          friendId,
          groupId,
          supabase: remoteClient,
        });
      }
    } catch (error) {
      setInvitedGroupIds((current) => {
        const next = new Set(current);
        next.delete(groupId);
        return next;
      });
      setSocialState((current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? {
                ...group,
                memberIds: group.memberIds.filter(
                  (memberId) => memberId !== friendId,
                ),
              }
            : group,
        ),
      }));
      setFeedback(getErrorMessage(error, "Could not send that group invite."));
    } finally {
      setPendingInviteGroupIds((current) => {
        const next = new Set(current);
        next.delete(groupId);
        return next;
      });
    }
  }

  function nudgeFriend(friendId: string) {
    nudgeQueue.enqueue({
      key: friendId,
      recipientId: friendId,
    });
  }

  if (selectedFriend) {
    const nudgeState = nudgeQueue.getState(selectedFriend.id);
    const timeStats = [
      {
        label: "Today",
        value: getLiveRankingSeconds(selectedFriend, "day", now),
      },
      {
        label: "Week",
        value: getLiveRankingSeconds(selectedFriend, "week", now),
      },
      {
        label: "Month",
        value: getLiveRankingSeconds(selectedFriend, "month", now),
      },
      {
        label: "All time",
        value: getLiveRankingSeconds(selectedFriend, "allTime", now),
      },
    ];

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

        <section>
          <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-muted)]">
            Time studied
          </h3>
          <div className="grid grid-cols-4 divide-x divide-[rgb(255_255_255/0.08)] rounded-lg border border-[rgb(255_255_255/0.07)] bg-[rgb(255_255_255/0.02)]">
            {timeStats.map((stat) => (
              <div className="min-w-0 px-2 py-3 text-center" key={stat.label}>
                <p className="truncate text-sm font-semibold tabular-nums">
                  {formatCompactStudyTime(stat.value)}
                </p>
                <p className="mt-1 truncate text-[10px] font-medium text-[var(--color-text-muted)] sm:text-xs">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <StudyHeatmap
          dailySeconds={selectedFriend.dailyStudySeconds ?? {}}
          title={`${selectedFriend.name}'s activity`}
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            className="mac-focus h-11 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414]"
            onClick={() => setIsInviteDialogOpen(true)}
            type="button"
          >
            Invite to group
          </button>
          <button
            className="mac-focus h-11 rounded-md border border-[rgb(255_107_107/0.45)] px-4 text-sm font-semibold text-[var(--color-danger)]"
            onClick={() => setIsRemoveDialogOpen(true)}
            type="button"
          >
            Remove friend
          </button>
        </div>

        {feedback ? (
          <p
            className="rounded-md bg-[rgb(255_107_107/0.08)] px-3 py-2 text-sm text-[var(--color-danger)]"
            role="alert"
          >
            {feedback}
          </p>
        ) : null}

        {isInviteDialogOpen ? (
          <GroupInviteDialog
            friend={selectedFriend}
            groups={socialState.groups}
            invitedGroupIds={invitedGroupIds}
            onClose={() => setIsInviteDialogOpen(false)}
            onInvite={(groupId) =>
              void inviteFriendToGroup(selectedFriend.id, groupId)
            }
            pendingGroupIds={pendingInviteGroupIds}
          />
        ) : null}

        {isRemoveDialogOpen ? (
          <AppDialog
            bodyClassName="space-y-2"
            footer={
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="mac-focus h-11 rounded-md border border-[var(--color-border)] text-sm font-semibold"
                  disabled={isRemovingFriend}
                  onClick={() => setIsRemoveDialogOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="mac-focus h-11 rounded-md border border-[rgb(255_107_107/0.45)] text-sm font-semibold text-[var(--color-danger)] disabled:opacity-45"
                  disabled={isRemovingFriend}
                  onClick={() => void removeFriend(selectedFriend.id)}
                  type="button"
                >
                  {isRemovingFriend ? "Removing…" : "Remove friend"}
                </button>
              </div>
            }
            maxWidthClassName="max-w-sm"
            onClose={() => {
              if (!isRemovingFriend) setIsRemoveDialogOpen(false);
            }}
            title={`Remove ${selectedFriend.name}?`}
          >
            <p className="text-sm leading-6 text-[var(--color-text-muted)]">
              You will both disappear from each other&apos;s friends lists.
            </p>
          </AppDialog>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <section className="hidden grid-cols-3 gap-4 lg:grid">
        <SummaryStat label="Friends" value={`${friendList.length}`} />
        <SummaryStat label="Studying" value={`${studyingCount}`} />
        <SummaryStat label="Groups" value={`${socialState.groups.length}`} />
      </section>

      <div className="flex justify-end">
        <button
          className="mac-focus inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414] transition active:scale-[0.98]"
          onClick={() => setIsAdding(true)}
          type="button"
        >
          <Plus aria-hidden size={17} />
          Add
        </button>
      </div>

      <div
        aria-label="Friends view"
        className="grid grid-cols-2 rounded-xl bg-[rgb(255_255_255/0.04)] p-1"
        role="tablist"
      >
        <button
          aria-selected={activeTab === "friends"}
          className={cn(
            "mac-focus h-11 rounded-lg text-sm font-semibold transition",
            activeTab === "friends"
              ? "bg-[var(--color-surface-raised)] text-[var(--color-text)]"
              : "text-[var(--color-text-muted)]",
          )}
          onClick={() => setActiveTab("friends")}
          role="tab"
          type="button"
        >
          Friends
        </button>
        <button
          aria-selected={activeTab === "requests"}
          className={cn(
            "mac-focus flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition",
            activeTab === "requests"
              ? "bg-[var(--color-surface-raised)] text-[var(--color-text)]"
              : "text-[var(--color-text-muted)]",
          )}
          onClick={() => setActiveTab("requests")}
          role="tab"
          type="button"
        >
          Requests
          {incomingRequests.length ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold text-white">
              {incomingRequests.length}
            </span>
          ) : null}
        </button>
      </div>

      {feedback ? (
        <p
          className="rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-2 text-sm text-[var(--color-text-muted)]"
          role="status"
        >
          {feedback}
        </p>
      ) : null}

      {activeTab === "friends" ? (
        <section className="space-y-3" role="tabpanel">
          <p className="text-sm font-medium text-[var(--color-text-muted)]">
            {friendList.length
              ? `${friendList.length} ${friendList.length === 1 ? "friend" : "friends"}`
              : "Add someone to get started"}
          </p>

          <PaginatedList
            className="grid gap-2 lg:grid-cols-2 lg:gap-3"
            items={friendList}
            pageSize={12}
            renderItem={(friend) => (
              <button
                className="mac-focus grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[rgb(255_255_255/0.055)] bg-[rgb(255_255_255/0.028)] px-3 py-3 text-left transition hover:border-[rgb(255_255_255/0.12)] hover:bg-[rgb(255_255_255/0.045)] active:scale-[0.99] lg:min-h-20 lg:px-4"
                key={friend.id}
                onClick={() => {
                  setSelectedFriendId(friend.id);
                  setInvitedGroupIds(new Set());
                  setPendingInviteGroupIds(new Set());
                  setIsInviteDialogOpen(false);
                  setIsRemoveDialogOpen(false);
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
            )}
            resetKey="friends"
          />
        </section>
      ) : (
        <section className="space-y-6" role="tabpanel">
          {incomingRequests.length ? (
            <RequestSection title={`Incoming (${incomingRequests.length})`}>
              <PaginatedList
                className="grid gap-2"
                items={incomingRequests}
                pageSize={10}
                renderItem={(request) => (
                  <FriendRequestRow
                    busyKey={busyKey}
                    key={request.id}
                    onAction={(action) =>
                      void updateFriendRequest(request, action)
                    }
                    request={request}
                  />
                )}
                resetKey="incoming"
              />
            </RequestSection>
          ) : null}

          {outgoingRequests.length ? (
            <RequestSection title={`Sent (${outgoingRequests.length})`}>
              <PaginatedList
                className="grid gap-2"
                items={outgoingRequests}
                pageSize={10}
                renderItem={(request) => (
                  <FriendRequestRow
                    busyKey={busyKey}
                    key={request.id}
                    onAction={(action) =>
                      void updateFriendRequest(request, action)
                    }
                    request={request}
                  />
                )}
                resetKey="outgoing"
              />
            </RequestSection>
          ) : null}

          {!friendRequests.length ? (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-8 text-center">
              <p className="font-semibold">No friend requests</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Incoming and sent requests will appear here.
              </p>
            </div>
          ) : null}
        </section>
      )}

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
          onShowRequests={() => {
            setIsAdding(false);
            setActiveTab("requests");
          }}
          remoteCandidates={remoteClient ? availableFriends : null}
        />
      ) : null}

      <TransientToast
        message={toastMessage}
        onDismiss={() => setToastMessage(null)}
      />
    </div>
  );
}

function RequestSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="space-y-2.5">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
        {title}
      </h2>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}

function FriendRequestRow({
  busyKey,
  onAction,
  request,
}: {
  busyKey: string | null;
  onAction: (action: "accept" | "cancel" | "decline") => void;
  request: RemoteFriendRequest;
}) {
  const isBusy = busyKey?.endsWith(`:${request.id}`) ?? false;
  const isOptimistic = request.id.startsWith("optimistic-");

  return (
    <article className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border border-[rgb(255_255_255/0.065)] bg-[rgb(255_255_255/0.028)] p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <ProfileBadge friend={request.user} />
      <div className="min-w-0">
        <p className="truncate font-semibold">{request.user.name}</p>
        <p className="truncate text-sm text-[var(--color-text-muted)]">
          {request.user.handle}
        </p>
      </div>

      {request.direction === "incoming" ? (
        <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1 sm:flex">
          <button
            className="mac-focus h-11 rounded-lg bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414] disabled:opacity-45"
            disabled={isBusy}
            onClick={() => onAction("accept")}
            type="button"
          >
            {busyKey === `accept:${request.id}` ? "Accepting…" : "Accept"}
          </button>
          <button
            className="mac-focus h-11 rounded-lg border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-text-muted)] disabled:opacity-45"
            disabled={isBusy}
            onClick={() => onAction("decline")}
            type="button"
          >
            Decline
          </button>
        </div>
      ) : (
        <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:justify-end">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-muted)]">
            <Clock3 aria-hidden size={15} />
            Pending
          </span>
          <button
            className="mac-focus h-11 rounded-lg px-3 text-sm font-semibold text-[var(--color-danger)] disabled:opacity-45"
            disabled={isBusy || isOptimistic}
            onClick={() => onAction("cancel")}
            type="button"
          >
            Cancel
          </button>
        </div>
      )}
    </article>
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
  onShowRequests,
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
  onShowRequests: () => void;
  remoteCandidates: RemoteFriendCandidate[] | null;
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
            Send request
          </button>
        )
      }
      isDirty={isDirty}
      onClose={onClose}
      title="Add a friend"
    >
      {remoteCandidates ? (
        remoteCandidates.length ? (
          <PaginatedList
            className="grid gap-2"
            items={sortFriendCandidates(remoteCandidates)}
            pageSize={10}
            renderItem={(candidate, index) => (
              <div
                className="grid min-h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[rgb(255_255_255/0.055)] bg-[rgb(255_255_255/0.028)] px-3 py-3"
                key={candidate.id}
              >
                <ProfileBadge friend={candidate} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{candidate.handle}</p>
                  <p className="truncate text-sm text-[var(--color-text-muted)]">
                    {candidate.mutualFriendCount} mutual{" "}
                    {candidate.mutualFriendCount === 1 ? "friend" : "friends"}
                  </p>
                </div>
                {candidate.requestDirection === "incoming" ? (
                  <button
                    className="mac-focus h-11 rounded-lg border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-mac-yellow)]"
                    data-dialog-autofocus={index === 0 ? "" : undefined}
                    onClick={onShowRequests}
                    type="button"
                  >
                    View request
                  </button>
                ) : candidate.requestDirection === "outgoing" ? (
                  <span className="inline-flex h-11 items-center gap-1.5 px-2 text-sm font-semibold text-[var(--color-text-muted)]">
                    <Clock3 aria-hidden size={15} />
                    Sent
                  </span>
                ) : (
                  <button
                    className="mac-focus h-11 rounded-lg border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-mac-yellow)] disabled:opacity-45"
                    data-dialog-autofocus={index === 0 ? "" : undefined}
                    onClick={() => onAddRemote(candidate.id)}
                    type="button"
                  >
                    Request
                  </button>
                )}
              </div>
            )}
            resetKey="friend-candidates"
          />
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

function GroupInviteDialog({
  friend,
  groups,
  invitedGroupIds,
  onClose,
  onInvite,
  pendingGroupIds,
}: {
  friend: SocialFriend;
  groups: SocialState["groups"];
  invitedGroupIds: Set<string>;
  onClose: () => void;
  onInvite: (groupId: string) => void;
  pendingGroupIds: Set<string>;
}) {
  return (
    <AppDialog
      bodyClassName="grid gap-2"
      closeLabel="Close group invitations"
      footer={
        <button
          className="mac-focus h-11 w-full rounded-md bg-[var(--color-mac-yellow)] text-sm font-semibold text-[#141414]"
          onClick={onClose}
          type="button"
        >
          Done
        </button>
      }
      maxWidthClassName="max-w-md"
      onClose={onClose}
      title={`Invite ${friend.name}`}
    >
      {groups.length ? (
        groups.map((group, index) => {
          const canInvite =
            group.currentUserRole === "owner" ||
            group.currentUserRole === "admin";
          const alreadyMember = group.memberIds.includes(friend.id);
          const invited = invitedGroupIds.has(group.id);
          const pending = pendingGroupIds.has(group.id);
          const disabled = !canInvite || alreadyMember || invited || pending;

          return (
            <div
              className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[rgb(255_255_255/0.07)] bg-[rgb(255_255_255/0.025)] p-3"
              key={group.id}
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[rgb(255_227_48/0.1)] text-[var(--color-mac-yellow)]">
                <Users aria-hidden size={18} />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {group.name}
                </span>
                <span className="block text-xs text-[var(--color-text-muted)]">
                  {!canInvite
                    ? "Leader or moderator required"
                    : `${group.memberIds.length} ${
                        group.memberIds.length === 1 ? "member" : "members"
                      }`}
                </span>
              </span>
              <button
                className={cn(
                  "mac-focus h-10 min-w-24 rounded-md px-3 text-xs font-semibold transition disabled:cursor-default",
                  invited || alreadyMember
                    ? "border border-[var(--color-border)] text-[var(--color-text-muted)]"
                    : "bg-[var(--color-mac-yellow)] text-[#141414] disabled:opacity-40",
                )}
                data-dialog-autofocus={index === 0 ? "" : undefined}
                disabled={disabled}
                onClick={() => onInvite(group.id)}
                type="button"
              >
                {invited ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Check aria-hidden size={14} />
                    Invite sent
                  </span>
                ) : alreadyMember ? (
                  "Already joined"
                ) : pending ? (
                  "Sending…"
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Send aria-hidden size={14} />
                    Invite
                  </span>
                )}
              </button>
            </div>
          );
        })
      ) : (
        <p className="rounded-md bg-[rgb(255_255_255/0.035)] p-4 text-sm text-[var(--color-text-muted)]">
          You are not in any groups yet.
        </p>
      )}
    </AppDialog>
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

function formatCompactStudyTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
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

function uniqueFriends(friends: SocialFriend[]) {
  return friends.filter(
    (friend, index) =>
      friends.findIndex((candidate) => candidate.id === friend.id) === index,
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function sortFriendCandidates(candidates: RemoteFriendCandidate[]) {
  return [...candidates].sort(
    (first, second) =>
      second.mutualFriendCount - first.mutualFriendCount ||
      first.handle.localeCompare(second.handle),
  );
}
