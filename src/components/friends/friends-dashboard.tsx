"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  MessageCircle,
  Plus,
  Send,
  Users,
  Zap,
} from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
import { EmptyStateCta } from "@/components/empty-state-cta";
import { DirectMessages } from "@/components/friends/direct-messages";
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
  fetchRemoteDirectMessageUnreadCount,
  fetchRemoteGlobalNudgeMutes,
  fetchRemoteSocialSnapshot,
  inviteRemoteFriendToGroup,
  removeRemoteFriend,
  requestRemoteSuperNudge,
  setRemoteUserNudgeMute,
  subscribeToRemoteAppChanges,
  updateRemoteFriendRequest,
  updateRemoteSuperNudge,
  type RemoteFriendCandidate,
  type RemoteFriendRequest,
  type RemoteSuperNudge,
} from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { NudgePill } from "@/components/social/nudge-pill";
import { useNudgeQueue } from "@/components/social/use-nudge-queue";
import { TransientToast } from "@/components/transient-toast";
import { addDateKeyDays, formatDuration, getLocalDateKey } from "@/lib/timer";
import { cn } from "@/lib/utils";

const emptySocialState: SocialState = { friends: [], groups: [] };
const friendTimeOptions = [
  { label: "Today", value: "today" },
  { label: "This week", value: "thisWeek" },
  { label: "This month", value: "thisMonth" },
  { label: "This year", value: "thisYear" },
  { label: "All time", value: "allTime" },
] as const;

type FriendTimeRange = (typeof friendTimeOptions)[number]["value"];

export function FriendsDashboard({
  onUnreadChange,
}: {
  onUnreadChange?: (hasUnread: boolean) => void;
}) {
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
  const [activeTab, setActiveTab] = useState<
    "friends" | "messages" | "requests"
  >("friends");
  const [messageFriendId, setMessageFriendId] = useState<string | null>(null);
  const [isDirectConversationOpen, setIsDirectConversationOpen] =
    useState(false);
  const [directMessageUnreadCount, setDirectMessageUnreadCount] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [mutedFriendIds, setMutedFriendIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [nudgeMuteBusyIds, setNudgeMuteBusyIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [superNudges, setSuperNudges] = useState<RemoteSuperNudge[]>([]);
  const [superNudgeBusyIds, setSuperNudgeBusyIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isSuperNudgeInfoOpen, setIsSuperNudgeInfoOpen] = useState(false);
  const [friendTimeRange, setFriendTimeRange] =
    useState<FriendTimeRange>("today");
  const [friendTimeDirection, setFriendTimeDirection] = useState<
    "back" | "forward"
  >("forward");
  const [now, setNow] = useState(() => new Date());
  const studyDateKey = getLocalDateKey(now);
  const previousStudyDateKeyRef = useRef(studyDateKey);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const pendingFriendRequestIdsRef = useRef(new Set<string>());
  const pendingCancelledRequestsRef = useRef(new Map<string, string>());
  const nudgeQueue = useNudgeQueue(Boolean(remoteClient));

  useEffect(() => {
    onUnreadChange?.(directMessageUnreadCount > 0);
  }, [directMessageUnreadCount, onUnreadChange]);

  useLayoutEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

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
      setSuperNudges(snapshot.superNudges ?? []);
    }
  }, []);

  const refreshDirectMessageUnreadCount = useCallback(
    async (supabase: SupabaseClient, userId: string | null) => {
      if (!userId) return;

      try {
        setDirectMessageUnreadCount(
          await fetchRemoteDirectMessageUnreadCount({ supabase, userId }),
        );
      } catch {
        // Keep the last known count when realtime or the network is unavailable.
      }
    },
    [],
  );

  useEffect(() => {
    if (activeTab !== "friends") return;

    const interval = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    if (previousStudyDateKeyRef.current === studyDateKey) return;

    previousStudyDateKeyRef.current = studyDateKey;
    if (remoteClient) {
      window.queueMicrotask(() => void refreshRemoteSocial(remoteClient));
    }
  }, [refreshRemoteSocial, remoteClient, studyDateKey]);

  useEffect(() => {
    if (!remoteClient) return;

    let cancelled = false;

    void fetchRemoteGlobalNudgeMutes({ supabase: remoteClient })
      .then((userIds) => {
        if (!cancelled) setMutedFriendIds(new Set(userIds));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [remoteClient]);

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
        setSuperNudges(cachedSocial.superNudges ?? []);
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
          setSuperNudges(snapshot.superNudges ?? []);
          setIsLoaded(true);
          void refreshDirectMessageUnreadCount(
            supabase,
            snapshot.currentUserId,
          );
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
  }, [refreshDirectMessageUnreadCount]);

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

    return subscribeToRemoteAppChanges(remoteClient, (table) => {
      if (table === "direct_messages") {
        void refreshDirectMessageUnreadCount(remoteClient, currentUserId);
        return;
      }

      void refreshRemoteSocial(remoteClient);
    });
  }, [
    currentUserId,
    refreshDirectMessageUnreadCount,
    refreshRemoteSocial,
    remoteClient,
  ]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    const requestedMessageFriendId = params.get("message");

    window.queueMicrotask(() => {
      if (requestedTab === "requests") {
        setActiveTab("requests");
      } else if (requestedTab === "messages") {
        setActiveTab("messages");
        setMessageFriendId(requestedMessageFriendId);
      }
    });

    const openRequests = () => setActiveTab("requests");
    const openDirectMessage = (event: Event) => {
      setMessageFriendId((event as CustomEvent<string>).detail ?? null);
      setActiveTab("messages");
    };
    window.addEventListener("mac-open-friend-requests", openRequests);
    window.addEventListener("mac-open-direct-message", openDirectMessage);

    return () => {
      window.removeEventListener("mac-open-friend-requests", openRequests);
      window.removeEventListener("mac-open-direct-message", openDirectMessage);
    };
  }, []);

  const selfId = currentUserId ?? "you";
  const friendList = useMemo(
    () =>
      socialState.friends
        .filter((friend) => friend.id !== selfId)
        .sort(
          (first, second) => Number(second.studying) - Number(first.studying),
        ),
    [selfId, socialState.friends],
  );
  const selectedFriend =
    friendList.find((friend) => friend.id === selectedFriendId) ?? null;
  useEffect(() => {
    const friendId = new URLSearchParams(window.location.search).get("friend");
    if (!friendId || !friendList.some((friend) => friend.id === friendId)) {
      return;
    }

    window.queueMicrotask(() => {
      setSelectedFriendId(friendId);
      const url = new URL(window.location.href);
      url.searchParams.delete("friend");
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    });
  }, [friendList]);

  const incomingRequests = friendRequests.filter(
    (request) => request.direction === "incoming",
  );
  const outgoingRequests = friendRequests.filter(
    (request) => request.direction === "outgoing",
  );
  const incomingSuperNudges = superNudges.filter(
    (request) =>
      request.direction === "incoming" && request.status === "pending",
  );
  const directConversationVisible =
    isDirectConversationOpen || Boolean(messageFriendId);
  const outgoingSuperNudges = superNudges.filter(
    (request) =>
      request.direction === "outgoing" && request.status === "pending",
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

  function nudgeFriend(friendId: string, superNudgeMode: boolean) {
    nudgeQueue.enqueue({
      key: friendId,
      maxPerMinute: superNudgeMode ? 10 : 1,
      recipientId: friendId,
    });
  }

  async function toggleFriendNudgeMute(friend: SocialFriend) {
    if (!remoteClient || nudgeMuteBusyIds.has(friend.id)) return;

    const wasMuted = mutedFriendIds.has(friend.id);
    setMutedFriendIds((current) => {
      const next = new Set(current);
      if (wasMuted) next.delete(friend.id);
      else next.add(friend.id);
      return next;
    });
    setNudgeMuteBusyIds((current) => new Set(current).add(friend.id));

    try {
      await setRemoteUserNudgeMute({
        groupId: null,
        muted: !wasMuted,
        supabase: remoteClient,
        userId: friend.id,
      });
      setToastMessage(
        wasMuted
          ? `Nudges from ${friend.handle} enabled`
          : `Nudges from ${friend.handle} muted`,
      );
    } catch {
      setMutedFriendIds((current) => {
        const next = new Set(current);
        if (wasMuted) next.add(friend.id);
        else next.delete(friend.id);
        return next;
      });
      setFeedback("Nudge setting could not be saved.");
    } finally {
      setNudgeMuteBusyIds((current) => {
        const next = new Set(current);
        next.delete(friend.id);
        return next;
      });
    }
  }

  async function requestSuperNudge(friend: SocialFriend) {
    if (!remoteClient || superNudgeBusyIds.has(friend.id)) return;

    const optimisticId = `optimistic-super-${crypto.randomUUID()}`;
    const optimisticRequest: RemoteSuperNudge = {
      createdAt: new Date().toISOString(),
      direction: "outgoing",
      friendId: friend.id,
      id: optimisticId,
      status: "pending",
    };

    setSuperNudgeBusyIds((current) => new Set(current).add(friend.id));
    setSuperNudges((current) => [
      optimisticRequest,
      ...current.filter((request) => request.friendId !== friend.id),
    ]);
    setToastMessage("Super Nudge request sent");

    try {
      const requestId = await requestRemoteSuperNudge({
        friendId: friend.id,
        supabase: remoteClient,
      });
      setSuperNudges((current) =>
        current.map((request) =>
          request.friendId === friend.id
            ? { ...request, id: requestId }
            : request,
        ),
      );
    } catch {
      setSuperNudges((current) =>
        current.filter((request) => request.id !== optimisticId),
      );
      setToastMessage(null);
      setFeedback("Super Nudge request could not be sent.");
    } finally {
      setSuperNudgeBusyIds((current) => {
        const next = new Set(current);
        next.delete(friend.id);
        return next;
      });
    }
  }

  async function changeSuperNudge(
    request: RemoteSuperNudge,
    action: "accept" | "cancel" | "decline" | "disable",
  ) {
    if (!remoteClient || superNudgeBusyIds.has(request.friendId)) return;

    const previous = superNudges;
    setSuperNudgeBusyIds((current) => new Set(current).add(request.friendId));
    setSuperNudges((current) =>
      action === "accept"
        ? current.map((item) =>
            item.id === request.id ? { ...item, status: "active" } : item,
          )
        : current.filter((item) => item.id !== request.id),
    );
    setToastMessage(
      action === "accept"
        ? "Super Nudge is on"
        : action === "disable"
          ? "Super Nudge turned off"
          : action === "cancel"
            ? "Request cancelled"
            : "Request declined",
    );

    try {
      await updateRemoteSuperNudge({
        action,
        requestId: request.id,
        supabase: remoteClient,
      });
    } catch {
      setSuperNudges(previous);
      setToastMessage(null);
      setFeedback("Super Nudge setting could not be changed.");
    } finally {
      setSuperNudgeBusyIds((current) => {
        const next = new Set(current);
        next.delete(request.friendId);
        return next;
      });
    }
  }

  if (selectedFriend) {
    const nudgeState = nudgeQueue.getState(selectedFriend.id);
    const superNudge =
      superNudges.find((request) => request.friendId === selectedFriend.id) ??
      null;
    const superNudgeIsBusy = superNudgeBusyIds.has(selectedFriend.id);
    const superNudgeMode = superNudge?.status === "active";
    const studyBlockActive = selectedFriend.studying && !superNudgeMode;
    const selectedTimeSeconds = getFriendTimeSeconds(
      selectedFriend,
      friendTimeRange,
      now,
    );
    const selectedTimeIndex = friendTimeOptions.findIndex(
      (option) => option.value === friendTimeRange,
    );

    function moveFriendTimeRange(direction: -1 | 1) {
      const nextOption = friendTimeOptions[selectedTimeIndex + direction];
      if (!nextOption) return;

      setFriendTimeDirection(direction > 0 ? "forward" : "back");
      setFriendTimeRange(nextOption.value);
    }

    return (
      <div className="space-y-3 sm:space-y-5 sm:pt-1">
        <section className="grid grid-cols-[2.25rem_auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2 sm:gap-x-3 sm:gap-y-3">
          <button
            aria-label="Back to friends"
            className="mac-focus inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.045)] hover:text-[var(--color-text)] sm:h-11 sm:w-11 sm:rounded-xl"
            onClick={() => setSelectedFriendId(null)}
            type="button"
          >
            <ArrowLeft aria-hidden size={19} />
          </button>

          <ProfileBadge friend={selectedFriend} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold sm:text-2xl">
              {selectedFriend.name}
            </h2>
            <p className="truncate text-sm font-medium text-[var(--color-text-muted)] sm:mt-1">
              {selectedFriend.handle}
            </p>
          </div>

          <NudgePill
            burstCount={nudgeState.burstCount}
            disabled={!remoteClient || studyBlockActive || nudgeState.atLimit}
            disabledLabel={studyBlockActive ? "Studying…" : undefined}
            mode={superNudgeMode ? "super" : "standard"}
            onClick={() => nudgeFriend(selectedFriend.id, superNudgeMode)}
            pendingCount={nudgeState.pending}
          />

          <div className="col-span-4 mt-4 flex min-w-0 items-center justify-between gap-3">
            <button
              aria-label={
                mutedFriendIds.has(selectedFriend.id)
                  ? "Enable nudges from this friend"
                  : "Mute nudges from this friend"
              }
              aria-pressed={mutedFriendIds.has(selectedFriend.id)}
              className={cn(
                "mac-focus inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition disabled:opacity-55 sm:h-11 sm:px-3",
                mutedFriendIds.has(selectedFriend.id)
                  ? "border-[rgb(255_227_48/0.4)] bg-[rgb(255_227_48/0.1)] text-[var(--color-mac-yellow)]"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)]",
              )}
              disabled={
                !remoteClient || nudgeMuteBusyIds.has(selectedFriend.id)
              }
              onClick={() => void toggleFriendNudgeMute(selectedFriend)}
              type="button"
            >
              {mutedFriendIds.has(selectedFriend.id) ? (
                <BellOff aria-hidden size={15} />
              ) : (
                <Bell aria-hidden size={15} />
              )}
              <span>
                {mutedFriendIds.has(selectedFriend.id) ? "Muted" : "Mute"}
              </span>
            </button>
            <div
              className={cn(
                "inline-flex h-10 w-fit shrink-0 items-stretch overflow-hidden rounded-md border sm:h-11",
                superNudgeMode
                  ? "border-[rgb(255_227_48/0.4)] bg-[rgb(255_227_48/0.1)] text-[var(--color-mac-yellow)]"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)]",
              )}
            >
              <button
                aria-label={
                  superNudgeMode
                    ? "Super Nudge on"
                    : superNudge?.direction === "outgoing"
                      ? "Super Nudge request sent"
                      : superNudge?.direction === "incoming"
                        ? "Accept Super Nudge"
                        : "Super Nudge"
                }
                aria-pressed={superNudgeMode}
                className="mac-focus inline-flex items-center justify-center gap-1 px-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 sm:gap-1.5 sm:px-3"
                disabled={
                  !remoteClient ||
                  superNudgeIsBusy ||
                  (superNudge?.direction === "outgoing" &&
                    superNudge.status === "pending")
                }
                onClick={() => {
                  if (!superNudge) {
                    void requestSuperNudge(selectedFriend);
                  } else if (superNudge.status === "active") {
                    void changeSuperNudge(superNudge, "disable");
                  } else if (superNudge.direction === "incoming") {
                    void changeSuperNudge(superNudge, "accept");
                  }
                }}
                type="button"
              >
                <Zap
                  aria-hidden
                  className="shrink-0"
                  fill={superNudgeMode ? "currentColor" : "none"}
                  size={15}
                />
                <span className="whitespace-nowrap sm:hidden">
                  {superNudgeMode
                    ? "Super Nudge on"
                    : superNudge?.direction === "outgoing"
                      ? "Request sent"
                      : superNudge?.direction === "incoming"
                        ? "Accept"
                        : "Super Nudge"}
                </span>
                <span className="hidden whitespace-nowrap sm:inline">
                  {superNudgeMode
                    ? "Super Nudge on"
                    : superNudge?.direction === "outgoing"
                      ? "Request sent"
                      : superNudge?.direction === "incoming"
                        ? "Accept Super Nudge"
                        : "Super Nudge"}
                </span>
              </button>
              <button
                aria-label="What is Super Nudge?"
                className="mac-focus inline-flex w-8 shrink-0 items-center justify-center border-l border-[var(--color-border)] sm:w-10"
                onClick={() => setIsSuperNudgeInfoOpen(true)}
                type="button"
              >
                <CircleHelp aria-hidden size={16} />
              </button>
            </div>
          </div>
          {nudgeState.feedback ? (
            <p className="col-span-4 text-xs font-medium text-[var(--color-text-muted)]">
              {nudgeState.feedback}
            </p>
          ) : null}
        </section>

        <button
          className="mac-focus inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[rgb(255_227_48/0.4)] bg-[rgb(255_227_48/0.08)] px-4 text-sm font-semibold text-[var(--color-mac-yellow)] transition hover:bg-[rgb(255_227_48/0.13)]"
          onClick={() => {
            setMessageFriendId(selectedFriend.id);
            setSelectedFriendId(null);
            setActiveTab("messages");
          }}
          type="button"
        >
          <MessageCircle aria-hidden size={17} />
          Message
        </button>

        <section>
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center rounded-lg border border-[rgb(255_255_255/0.07)] bg-[rgb(255_255_255/0.02)] px-1.5 py-2">
            <button
              aria-label="Previous study period"
              className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.05)] hover:text-[var(--color-text)] disabled:opacity-25"
              disabled={selectedTimeIndex === 0}
              onClick={() => moveFriendTimeRange(-1)}
              type="button"
            >
              <ChevronLeft aria-hidden size={18} />
            </button>
            <div
              className={cn(
                "min-w-0 overflow-hidden text-center",
                friendTimeDirection === "forward"
                  ? "mac-study-period-forward"
                  : "mac-study-period-back",
              )}
              key={friendTimeRange}
            >
              <h3 className="truncate text-xs font-semibold text-[var(--color-text-muted)]">
                {friendTimeOptions[selectedTimeIndex]?.label}
              </h3>
              <p className="mt-0.5 truncate text-lg font-semibold tabular-nums">
                {formatCompactStudyTime(selectedTimeSeconds)}
              </p>
            </div>
            <button
              aria-label="Next study period"
              className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.05)] hover:text-[var(--color-text)] disabled:opacity-25"
              disabled={selectedTimeIndex === friendTimeOptions.length - 1}
              onClick={() => moveFriendTimeRange(1)}
              type="button"
            >
              <ChevronRight aria-hidden size={18} />
            </button>
          </div>
        </section>

        <div className="max-sm:[&>section]:p-3 max-sm:[&>section>div:nth-child(2)]:mt-2 max-sm:[&>section>div:last-child]:mt-1 max-sm:[&_button]:h-2.5 max-sm:[&_button]:aspect-auto">
          <StudyHeatmap
            dailySeconds={selectedFriend.dailyStudySeconds ?? {}}
            title={`${selectedFriend.name}'s activity`}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
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

        {isSuperNudgeInfoOpen ? (
          <AppDialog
            bodyClassName="space-y-3"
            confirmDiscard={false}
            maxWidthClassName="max-w-sm"
            onClose={() => setIsSuperNudgeInfoOpen(false)}
            title="Super Nudge"
          >
            <p className="text-sm leading-6 text-[var(--color-text-muted)]">
              Send a request to a friend. If they accept, you can nudge each
              other up to 10 times a minute and while either person is studying.
            </p>
            <p className="text-sm leading-6 text-[var(--color-text-muted)]">
              Either person can turn it off at any time.
            </p>
          </AppDialog>
        ) : null}

        <TransientToast
          message={toastMessage}
          onDismiss={() => setToastMessage(null)}
        />
      </div>
    );
  }

  return (
    <div className="mac-friends-dashboard flex min-h-0 flex-1 flex-col overflow-hidden lg:block lg:overflow-visible">
      {!directConversationVisible ? (
        <div className="shrink-0 space-y-4 lg:space-y-6">
          <div
            aria-label="Friends view"
            className="flex flex-wrap items-center gap-2 min-[24rem]:flex-nowrap"
            role="tablist"
          >
            <div className="grid w-full grid-cols-2 rounded-full bg-[rgb(255_255_255/0.04)] p-1 min-[24rem]:min-w-0 min-[24rem]:flex-1">
              <button
                aria-selected={activeTab === "friends"}
                className={cn(
                  "mac-focus h-11 rounded-full border text-sm font-semibold transition",
                  activeTab === "friends"
                    ? "border-[var(--color-mac-yellow)] bg-[rgb(255_227_48/0.08)] text-[var(--color-mac-yellow)]"
                    : "border-transparent text-[var(--color-text-muted)]",
                )}
                onClick={() => setActiveTab("friends")}
                role="tab"
                type="button"
              >
                Friends
              </button>
              <button
                aria-selected={activeTab === "messages"}
                className={cn(
                  "mac-focus h-11 rounded-full border text-sm font-semibold transition",
                  activeTab === "messages"
                    ? "border-[var(--color-mac-yellow)] bg-[rgb(255_227_48/0.08)] text-[var(--color-mac-yellow)]"
                    : "border-transparent text-[var(--color-text-muted)]",
                )}
                onClick={() => {
                  setMessageFriendId(null);
                  setActiveTab("messages");
                }}
                role="tab"
                type="button"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  Messages
                  {directMessageUnreadCount ? (
                    <UnreadBadge count={directMessageUnreadCount} />
                  ) : null}
                </span>
              </button>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button
                aria-selected={activeTab === "requests"}
                className={cn(
                  "mac-focus inline-grid h-11 shrink-0 grid-flow-col place-items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold leading-none transition hover:bg-[rgb(255_255_255/0.04)]",
                  activeTab === "requests"
                    ? "text-[var(--color-mac-yellow)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
                )}
                onClick={() => setActiveTab("requests")}
                role="tab"
                type="button"
              >
                <span className="inline-flex items-center leading-none">
                  Requests
                </span>
                {incomingRequests.length + incomingSuperNudges.length ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold leading-none text-white">
                    {incomingRequests.length + incomingSuperNudges.length}
                  </span>
                ) : null}
              </button>
              {friendList.length ? (
                <button
                  className="mac-focus inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414] transition active:scale-[0.98]"
                  onClick={() => setIsAdding(true)}
                  type="button"
                >
                  <Plus aria-hidden size={17} />
                  Add
                </button>
              ) : null}
            </div>
          </div>

          {activeTab === "friends" ? (
            <p className="text-sm font-medium text-[var(--color-text-muted)]">
              {friendList.length
                ? `${friendList.length} ${friendList.length === 1 ? "friend" : "friends"}`
                : "No friends yet"}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className="mac-friends-list-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 pt-4 [-webkit-overflow-scrolling:touch] lg:overflow-visible lg:pb-0 lg:pt-6"
        ref={listScrollRef}
      >
        {feedback && !directConversationVisible ? (
          <p
            className="mb-4 rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-2 text-sm text-[var(--color-text-muted)]"
            role="status"
          >
            {feedback}
          </p>
        ) : null}

        {activeTab === "friends" ? (
          <section className="space-y-3" role="tabpanel">
            {friendList.length ? (
              <PaginatedList
                className="grid gap-2 lg:grid-cols-2 lg:gap-3"
                items={friendList}
                pageSize={12}
                renderItem={(friend) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center rounded-lg border border-[rgb(255_255_255/0.055)] bg-[rgb(255_255_255/0.028)] transition hover:border-[rgb(255_255_255/0.12)] hover:bg-[rgb(255_255_255/0.045)]"
                    key={friend.id}
                  >
                    <button
                      className="mac-focus grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-3 text-left active:scale-[0.99] lg:min-h-20 lg:px-4"
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
                          {formatDuration(
                            getLiveRankingSeconds(friend, "day", now),
                          )}
                        </p>
                        <p className="text-xs font-medium text-[var(--color-text-muted)]">
                          today
                        </p>
                      </div>
                    </button>
                    <button
                      aria-label={
                        mutedFriendIds.has(friend.id)
                          ? `Enable nudges from ${friend.handle}`
                          : `Mute all nudges from ${friend.handle}`
                      }
                      aria-pressed={mutedFriendIds.has(friend.id)}
                      className={cn(
                        "mac-focus mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md transition disabled:opacity-55",
                        mutedFriendIds.has(friend.id)
                          ? "bg-[rgb(255_227_48/0.12)] text-[var(--color-mac-yellow)]"
                          : "text-[var(--color-text-muted)] hover:bg-[rgb(255_255_255/0.055)] hover:text-[var(--color-text)]",
                      )}
                      disabled={
                        !remoteClient || nudgeMuteBusyIds.has(friend.id)
                      }
                      onClick={() => void toggleFriendNudgeMute(friend)}
                      type="button"
                    >
                      {mutedFriendIds.has(friend.id) ? (
                        <BellOff aria-hidden size={17} />
                      ) : (
                        <Bell aria-hidden size={17} />
                      )}
                    </button>
                  </div>
                )}
                resetKey="friends"
              />
            ) : (
              <EmptyStateCta
                action={
                  <button
                    className="mac-focus inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414] sm:w-auto"
                    onClick={() => setIsAdding(true)}
                    type="button"
                  >
                    <Plus aria-hidden size={17} />
                    Add friend
                  </button>
                }
                description="Find someone by username and send a request."
                icon={<Users aria-hidden size={18} />}
                title="Build your study circle"
              />
            )}
          </section>
        ) : activeTab === "messages" ? (
          <DirectMessages
            currentUserId={currentUserId}
            friends={friendList}
            initialFriendId={messageFriendId}
            key={`messages-${messageFriendId ?? "list"}`}
            onConversationClosed={() => setMessageFriendId(null)}
            onConversationOpenChange={setIsDirectConversationOpen}
            onUnreadCountChange={setDirectMessageUnreadCount}
            remoteClient={remoteClient}
          />
        ) : (
          <section className="space-y-6" role="tabpanel">
            {incomingSuperNudges.length ? (
              <RequestSection
                title={`Super Nudge (${incomingSuperNudges.length})`}
              >
                {incomingSuperNudges.map((request) => {
                  const friend = friendList.find(
                    (item) => item.id === request.friendId,
                  );

                  return friend ? (
                    <SuperNudgeRequestRow
                      busy={superNudgeBusyIds.has(friend.id)}
                      friend={friend}
                      key={request.id}
                      onAccept={() => void changeSuperNudge(request, "accept")}
                      onSecondary={() =>
                        void changeSuperNudge(request, "decline")
                      }
                      secondaryLabel="Decline"
                    />
                  ) : null;
                })}
              </RequestSection>
            ) : null}

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

            {outgoingSuperNudges.length ? (
              <RequestSection
                title={`Super Nudge sent (${outgoingSuperNudges.length})`}
              >
                {outgoingSuperNudges.map((request) => {
                  const friend = friendList.find(
                    (item) => item.id === request.friendId,
                  );

                  return friend ? (
                    <SuperNudgeRequestRow
                      busy={superNudgeBusyIds.has(friend.id)}
                      friend={friend}
                      key={request.id}
                      onSecondary={() =>
                        void changeSuperNudge(request, "cancel")
                      }
                      secondaryLabel="Cancel"
                    />
                  ) : null;
                })}
              </RequestSection>
            ) : null}

            {!friendRequests.length &&
            !incomingSuperNudges.length &&
            !outgoingSuperNudges.length ? (
              <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-8 text-center">
                <p className="font-semibold">No friend requests</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Incoming and sent requests will appear here.
                </p>
              </div>
            ) : null}
          </section>
        )}
      </div>

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

function SuperNudgeRequestRow({
  busy,
  friend,
  onAccept,
  onSecondary,
  secondaryLabel,
}: {
  busy: boolean;
  friend: SocialFriend;
  onAccept?: () => void;
  onSecondary: () => void;
  secondaryLabel: "Cancel" | "Decline";
}) {
  return (
    <article className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[rgb(255_227_48/0.16)] bg-[rgb(255_227_48/0.035)] px-3 py-2.5">
      <ProfileBadge friend={friend} />
      <div className="min-w-0">
        <p className="truncate font-semibold">{friend.name}</p>
        <p className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-mac-yellow)]">
          <Zap aria-hidden size={13} />
          Super Nudge
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {onAccept ? (
          <button
            className="mac-focus h-10 rounded-md bg-[var(--color-mac-yellow)] px-3 text-xs font-semibold text-[#141414] disabled:opacity-45"
            disabled={busy}
            onClick={onAccept}
            type="button"
          >
            Accept
          </button>
        ) : (
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            Pending
          </span>
        )}
        <button
          className="mac-focus h-10 rounded-md px-2 text-xs font-semibold text-[var(--color-danger)] disabled:opacity-45"
          disabled={busy}
          onClick={onSecondary}
          type="button"
        >
          {secondaryLabel}
        </button>
      </div>
    </article>
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
    <article
      className={
        request.direction === "incoming"
          ? "grid min-h-16 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border border-[rgb(255_255_255/0.065)] bg-[rgb(255_255_255/0.028)] p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
          : "grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[rgb(255_255_255/0.065)] bg-[rgb(255_255_255/0.028)] px-3 py-2.5"
      }
    >
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
        <div className="flex items-center justify-end gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-muted)]">
            <Clock3 aria-hidden size={15} />
            Pending
          </span>
          <button
            className="mac-focus h-9 rounded-md px-2 text-sm font-semibold text-[var(--color-danger)] disabled:opacity-45"
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
  const [revealedCandidateIds, setRevealedCandidateIds] = useState<Set<string>>(
    () => new Set(),
  );
  const isDirty =
    remoteCandidates === null &&
    Boolean(name.trim() || handle.trim() || color !== PROFILE_COLORS[1]);

  return (
    <AppDialog
      bodyClassName={remoteCandidates ? "grid gap-1.5 p-3" : "space-y-4 p-3"}
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
            className="grid gap-1.5"
            items={sortFriendCandidates(remoteCandidates)}
            pageSize={10}
            renderItem={(candidate, index) => (
              <div
                className="grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md border border-[rgb(255_255_255/0.055)] bg-[rgb(255_255_255/0.028)] px-2.5 py-2"
                key={candidate.id}
              >
                <ProfileBadge friend={candidate} size="sm" />
                <button
                  aria-expanded={revealedCandidateIds.has(candidate.id)}
                  className="mac-focus min-w-0 rounded-md text-left"
                  onClick={() =>
                    setRevealedCandidateIds((current) => {
                      const next = new Set(current);
                      if (next.has(candidate.id)) {
                        next.delete(candidate.id);
                      } else {
                        next.add(candidate.id);
                      }
                      return next;
                    })
                  }
                  title={
                    revealedCandidateIds.has(candidate.id)
                      ? candidate.name
                      : `Show ${candidate.handle}'s display name`
                  }
                  type="button"
                >
                  <p className="truncate font-semibold">{candidate.handle}</p>
                  {revealedCandidateIds.has(candidate.id) ? (
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">
                      {candidate.name}
                    </p>
                  ) : null}
                  <p className="truncate text-xs text-[var(--color-text-muted)]">
                    {candidate.mutualFriendCount} mutual{" "}
                    {candidate.mutualFriendCount === 1 ? "friend" : "friends"}
                  </p>
                </button>
                {candidate.requestDirection === "incoming" ? (
                  <button
                    className="mac-focus h-10 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-mac-yellow)]"
                    data-dialog-autofocus={index === 0 ? "" : undefined}
                    onClick={onShowRequests}
                    type="button"
                  >
                    View request
                  </button>
                ) : candidate.requestDirection === "outgoing" ? (
                  <span className="inline-flex h-10 items-center gap-1.5 px-2 text-sm font-semibold text-[var(--color-text-muted)]">
                    <Clock3 aria-hidden size={15} />
                    Sent
                  </span>
                ) : (
                  <button
                    className="mac-focus h-10 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-mac-yellow)] disabled:opacity-45"
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

function formatCompactStudyTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function getFriendTimeSeconds(
  friend: SocialFriend,
  range: FriendTimeRange,
  now: Date,
) {
  if (range === "allTime") {
    return getLiveRankingSeconds(friend, "allTime", now);
  }

  const dailySeconds = friend.dailyStudySeconds ?? {};
  if (!Object.keys(dailySeconds).length) {
    if (range === "today") {
      return getLiveRankingSeconds(friend, "day", now);
    }

    if (range === "thisWeek") {
      return getLiveRankingSeconds(friend, "week", now);
    }

    if (range === "thisMonth") {
      return getLiveRankingSeconds(friend, "month", now);
    }

    return getLiveRankingSeconds(friend, "allTime", now);
  }

  const todayKey = getLocalDateKey(now);
  const calendarDay = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  const startKey =
    range === "today"
      ? todayKey
      : range === "thisWeek"
        ? addDateKeyDays(todayKey, -((calendarDay + 6) % 7))
        : range === "thisMonth"
          ? `${todayKey.slice(0, 7)}-01`
          : `${todayKey.slice(0, 4)}-01-01`;
  const storedSeconds = Object.entries(dailySeconds).reduce(
    (total, [dateKey, seconds]) =>
      dateKey >= startKey && dateKey <= todayKey ? total + seconds : total,
    0,
  );
  const liveDelta = Math.max(
    0,
    getLiveRankingSeconds(friend, "allTime", now) - friend.allTimeSeconds,
  );

  return storedSeconds + liveDelta;
}

function ProfileBadge({
  friend,
  size = "md",
}: {
  friend: SocialFriend;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[#141414]",
        size === "lg"
          ? "h-16 w-16 text-lg"
          : size === "sm"
            ? "h-10 w-10 text-xs"
            : "h-11 w-11 text-sm",
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

function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold leading-none text-white">
      {count > 9 ? "9+" : count}
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
