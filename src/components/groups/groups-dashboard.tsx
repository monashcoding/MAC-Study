"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowLeft,
  BookOpen,
  Check,
  CircleStop,
  Flame,
  Play,
  Plus,
  Save,
  Settings2,
  Target,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { subjects as defaultSubjects } from "@/lib/demo-data";
import {
  cacheRemoteSocialSnapshot,
  cacheRemoteTimerState,
  getCachedRemoteSocialSnapshot,
  getCachedRemoteTimerState,
} from "@/lib/client-cache";
import {
  GROUP_ICON_KEYS,
  PERSON_ICON_KEYS,
  SOCIAL_STORAGE_KEY,
  defaultSocialState,
  getLiveRankingSeconds,
  normalizeSocialState,
  type GroupIconKey,
  type PersonIconKey,
  type RankingWindow,
  type SocialFriend,
  type SocialGroup,
  type SocialState,
} from "@/lib/social-state";
import {
  createRemoteGroup,
  fetchRemoteTimerState,
  fetchRemoteSocialSnapshot,
  getNudgeDeliveryMessage,
  inviteRemoteFriendToGroup,
  sendRemoteNudge,
  startRemoteStudySession,
  stopRemoteStudySession,
  subscribeToRemoteAppChanges,
  type RemoteActiveSession,
  type RemoteSubject,
  updateRemoteGroupIcon,
  updateRemoteStudyIcon,
} from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { NudgePill } from "@/components/social/nudge-pill";
import { StartStudyDialog } from "@/components/study/start-study-dialog";
import { formatDuration, isLongSession } from "@/lib/timer";
import { cn } from "@/lib/utils";

const rankingWindows = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
] satisfies { id: RankingWindow; label: string }[];

const groupIconComponents = {
  users: Users,
  target: Target,
  flame: Flame,
  book: BookOpen,
  trophy: Trophy,
} satisfies Record<
  GroupIconKey,
  React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>
>;

const groupIconLabels = {
  users: "People",
  target: "Target",
  flame: "Fire",
  book: "Book",
  trophy: "Trophy",
} satisfies Record<GroupIconKey, string>;

const MEMBER_ACTIVE_COLOR = "#ff7a00";
const MEMBER_INACTIVE_COLOR = "#555b6e";
const emptySocialState: SocialState = { friends: [], groups: [] };
const TIMER_STORAGE_KEY = "mac-study-demo-state";
const fallbackStudySubjects = defaultSubjects.map((subject) => ({
  id: subject.id,
  name: subject.code,
  color: subject.color,
})) satisfies RemoteSubject[];

const personIconLabels = {
  "flame-desk": "Flame",
  "clock-desk": "Clock",
  "lamp-desk": "Lamp",
  "spark-desk": "Spark",
} satisfies Record<PersonIconKey, string>;

export function GroupsDashboard() {
  const [socialState, setSocialState] = useState<SocialState>(emptySocialState);
  const [timerSubjects, setTimerSubjects] = useState<RemoteSubject[]>(
    fallbackStudySubjects,
  );
  const [activeStudySession, setActiveStudySession] =
    useState<RemoteActiveSession | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isChoosingStudy, setIsChoosingStudy] = useState(false);
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [groupView, setGroupView] = useState<"class" | "rankings">("class");
  const [rankingWindow, setRankingWindow] = useState<RankingWindow>("day");
  const [groupName, setGroupName] = useState("");
  const [groupIcon, setGroupIcon] = useState<GroupIconKey>("users");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [remoteClient, setRemoteClient] = useState<SupabaseClient | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [nudgingUserId, setNudgingUserId] = useState<string | null>(null);
  const [nudgeFeedback, setNudgeFeedback] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const refreshRemoteSocial = useCallback(async (supabase: SupabaseClient) => {
    const snapshot = await fetchRemoteSocialSnapshot(supabase);

    if (snapshot) {
      cacheRemoteSocialSnapshot(snapshot);
      setCurrentUserId(snapshot.currentUserId);
      setSocialState(snapshot.socialState);
    }
  }, []);

  const refreshRemoteTimer = useCallback(async (supabase: SupabaseClient) => {
    const timerState = await fetchRemoteTimerState(supabase);

    if (timerState) {
      cacheRemoteTimerState(timerState);
      setTimerSubjects(timerState.subjects);
      setActiveStudySession(timerState.activeSession);
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
      const cachedTimer = getCachedRemoteTimerState();

      if (cachedSocial) {
        setCurrentUserId(cachedSocial.currentUserId);
        setSocialState(cachedSocial.socialState);
        setIsLoaded(true);
      }

      if (cachedTimer) {
        setTimerSubjects(cachedTimer.subjects);
        setActiveStudySession(cachedTimer.activeSession);
      }

      try {
        supabase = createSupabaseBrowserClient();
        if (!cancelled) {
          setRemoteClient(supabase);
        }
        const [snapshot, timerState] = await Promise.all([
          fetchRemoteSocialSnapshot(supabase),
          fetchRemoteTimerState(supabase),
        ]);

        if (!cancelled && snapshot) {
          cacheRemoteSocialSnapshot(snapshot);
          setCurrentUserId(snapshot.currentUserId);
          setSocialState(snapshot.socialState);
          if (timerState) {
            cacheRemoteTimerState(timerState);
            setTimerSubjects(timerState.subjects);
            setActiveStudySession(timerState.activeSession);
          }
          setIsLoaded(true);
          return;
        }
      } catch {
        if (supabase) {
          setRemoteClient(supabase);
          if (!cachedSocial) {
            setSocialState(emptySocialState);
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

        const localTimerState = readLocalTimerState();
        setTimerSubjects(normalizeTimerSubjects(localTimerState?.subjects));
        setActiveStudySession(localTimerState?.activeSession ?? null);
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
      void refreshRemoteTimer(remoteClient);
    });
  }, [refreshRemoteSocial, refreshRemoteTimer, remoteClient]);

  const selectedGroup = socialState.groups.find(
    (group) => group.id === selectedGroupId,
  );
  const friendsById = useMemo(
    () => new Map(socialState.friends.map((friend) => [friend.id, friend])),
    [socialState.friends],
  );
  const groupSummaries = socialState.groups.map((group) => {
    const members = getGroupMembers(group, friendsById);
    const activeNow = members.filter((member) => member.studying).length;

    return {
      group,
      activeNow,
      memberCount: members.length,
    };
  });
  const activeTotal = groupSummaries.reduce(
    (total, group) => total + group.activeNow,
    0,
  );
  const uniqueMemberCount = new Set(
    socialState.groups.flatMap((group) => group.memberIds),
  ).size;

  async function createGroup() {
    const name = groupName.trim();
    const invitedMemberIds = selectedMembers.filter(
      (memberId) => memberId !== "you" && memberId !== currentUserId,
    );

    if (!name) {
      return;
    }

    if (remoteClient) {
      const newGroupId = await createRemoteGroup({
        icon: groupIcon,
        name,
        supabase: remoteClient,
      });

      if (newGroupId) {
        await Promise.all(
          invitedMemberIds.map((friendId) =>
            inviteRemoteFriendToGroup({
              friendId,
              groupId: newGroupId,
              supabase: remoteClient,
            }),
          ),
        );
        setSelectedGroupId(newGroupId);
      }

      setGroupName("");
      setGroupIcon("users");
      setSelectedMembers([]);
      setIsCreating(false);
      await refreshRemoteSocial(remoteClient);
      return;
    }

    const newGroup: SocialGroup = {
      id: `group-${crypto.randomUUID()}`,
      name,
      icon: groupIcon,
      memberIds: uniqueIds(["you", ...invitedMemberIds]),
    };

    setSocialState((current) => ({
      ...current,
      groups: [newGroup, ...current.groups],
    }));
    setSelectedGroupId(newGroup.id);
    setGroupName("");
    setGroupIcon("users");
    setSelectedMembers([]);
    setIsCreating(false);
  }

  function toggleMember(friendId: string) {
    setSelectedMembers((current) =>
      current.includes(friendId)
        ? current.filter((id) => id !== friendId)
        : [...current, friendId],
    );
  }

  async function startGroupStudy(subjectId: string | null) {
    if (!selectedGroup || activeStudySession) {
      setIsChoosingStudy(false);
      return;
    }

    if (remoteClient) {
      try {
        await startRemoteStudySession({
          groupId: selectedGroup.id,
          subjectId,
          supabase: remoteClient,
        });
      } finally {
        setIsChoosingStudy(false);
        await Promise.all([
          refreshRemoteTimer(remoteClient),
          refreshRemoteSocial(remoteClient),
        ]);
      }

      return;
    }

    const nextSession = {
      groupId: selectedGroup.id,
      subjectId,
      startedAt: new Date().toISOString(),
    };
    const currentTimerState = readLocalTimerState();

    writeLocalTimerState({
      ...currentTimerState,
      activeSession: nextSession,
      subjects: timerSubjects,
    });
    setActiveStudySession(nextSession);
    setIsChoosingStudy(false);
  }

  async function stopGroupStudy() {
    if (!activeStudySession) {
      return;
    }

    if (remoteClient) {
      try {
        await stopRemoteStudySession(remoteClient);
      } finally {
        await Promise.all([
          refreshRemoteTimer(remoteClient),
          refreshRemoteSocial(remoteClient),
        ]);
      }

      return;
    }

    const endedAt = new Date();
    const currentTimerState = readLocalTimerState();

    writeLocalTimerState({
      ...currentTimerState,
      activeSession: null,
      sessions: [
        {
          id: crypto.randomUUID(),
          groupId: activeStudySession.groupId ?? null,
          subjectId: activeStudySession.subjectId,
          startedAt: activeStudySession.startedAt,
          endedAt: endedAt.toISOString(),
          status: isLongSession(activeStudySession.startedAt, endedAt)
            ? "needs_confirmation"
            : "completed",
          source: "timer",
        },
        ...(currentTimerState?.sessions ?? []),
      ],
      subjects: timerSubjects,
    });
    setActiveStudySession(null);
  }

  async function updateGroupIcon(icon: GroupIconKey) {
    if (!selectedGroup) {
      return;
    }

    if (remoteClient) {
      await updateRemoteGroupIcon({
        groupId: selectedGroup.id,
        icon,
        supabase: remoteClient,
      });
      await refreshRemoteSocial(remoteClient);
      return;
    }

    setSocialState((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === selectedGroup.id ? { ...group, icon } : group,
      ),
    }));
  }

  async function updateFriendIcon(friendId: string, personIcon: PersonIconKey) {
    if (remoteClient) {
      await updateRemoteStudyIcon({
        icon: personIcon,
        supabase: remoteClient,
        userId: friendId,
      });
      await refreshRemoteSocial(remoteClient);
      return;
    }

    setSocialState((current) => ({
      ...current,
      friends: current.friends.map((friend) =>
        friend.id === friendId ? { ...friend, personIcon } : friend,
      ),
    }));
  }

  async function nudgeMember(memberId: string, groupId: string) {
    if (!remoteClient) {
      setNudgeFeedback("Sign in to send lock-screen nudges.");
      return;
    }

    setNudgingUserId(memberId);
    setNudgeFeedback(null);

    try {
      const delivery = await sendRemoteNudge({
        groupId,
        recipientId: memberId,
      });
      setNudgeFeedback(getNudgeDeliveryMessage(delivery));
    } catch (error) {
      setNudgeFeedback(getNudgeErrorMessage(error));
    } finally {
      setNudgingUserId(null);
    }
  }

  if (selectedGroup) {
    const members = getGroupMembers(selectedGroup, friendsById).sort(
      (first, second) =>
        getLiveRankingSeconds(second, "day", now) -
        getLiveRankingSeconds(first, "day", now),
    );
    const activeNow = members.filter((member) => member.studying).length;
    const ranking = [...members].sort(
      (first, second) =>
        getLiveRankingSeconds(second, rankingWindow, now) -
        getLiveRankingSeconds(first, rankingWindow, now),
    );
    const activeInSelectedGroup =
      activeStudySession?.groupId === selectedGroup.id;
    const isStudyingElsewhere = Boolean(
      activeStudySession && !activeInSelectedGroup,
    );
    const selectedMember =
      members.find((member) => member.id === selectedMemberId) ?? null;

    return (
      <div className="space-y-5 pb-24 pt-1 lg:pb-0">
        <section className="space-y-4">
          <button
            className="mac-focus inline-flex h-10 items-center gap-2 rounded-md text-sm font-semibold text-[var(--color-text-muted)]"
            onClick={() => {
              setSelectedGroupId(null);
              setSelectedMemberId(null);
              setGroupView("class");
            }}
            type="button"
          >
            <ArrowLeft aria-hidden size={17} />
            Groups
          </button>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-3">
                <GroupIconBadge icon={selectedGroup.icon} />
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-semibold">
                    {selectedGroup.name}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-[var(--color-text-muted)]">
                    <span className="text-[#ff7a00]">{activeNow}</span>
                    <span> active / {members.length} members</span>
                  </p>
                </div>
              </div>
            </div>
            <button
              aria-label="Group settings"
              className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md bg-[rgb(255_255_255/0.045)] text-[var(--color-text)]"
              onClick={() => setIsGroupSettingsOpen(true)}
              type="button"
            >
              <Settings2 aria-hidden size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 rounded-md bg-[rgb(255_255_255/0.045)] p-1">
            {[
              { id: "class", label: "Class view" },
              { id: "rankings", label: "Rankings" },
            ].map((view) => (
              <button
                className={cn(
                  "mac-focus h-10 rounded text-sm font-semibold transition",
                  groupView === view.id
                    ? "bg-[var(--color-mac-yellow)] text-[#141414]"
                    : "text-[var(--color-text-muted)]",
                )}
                key={view.id}
                onClick={() => setGroupView(view.id as "class" | "rankings")}
                type="button"
              >
                {view.label}
              </button>
            ))}
          </div>

          {groupView === "rankings" ? (
            <div className="grid grid-cols-3 rounded-md bg-[rgb(255_255_255/0.035)] p-1">
              {rankingWindows.map((window) => (
                <button
                  className={cn(
                    "mac-focus h-9 rounded px-3 text-xs font-semibold transition",
                    rankingWindow === window.id
                      ? "bg-[var(--color-surface-raised)] text-[var(--color-text)]"
                      : "text-[var(--color-text-muted)]",
                  )}
                  key={window.id}
                  onClick={() => setRankingWindow(window.id)}
                  type="button"
                >
                  {window.label}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        {groupView === "class" ? (
          <section>
            <div className="grid grid-cols-4 gap-x-2 gap-y-8 py-2">
              {members.map((member) => (
                <button
                  className={cn(
                    "mac-focus min-w-0 rounded-md text-center transition active:scale-[0.98]",
                    member.studying
                      ? "text-[#ff7a00]"
                      : "text-[#555b6e] opacity-80",
                  )}
                  key={member.id}
                  onClick={() => {
                    setNudgeFeedback(null);
                    setSelectedMemberId(member.id);
                  }}
                  type="button"
                >
                  <StudyPersonIcon
                    active={member.studying}
                    icon={member.personIcon}
                  />
                  <p className="mt-2 truncate text-sm font-semibold">
                    {member.name}
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                    {formatDuration(getLiveRankingSeconds(member, "day", now))}
                  </p>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {selectedMember ? (
          <GroupMemberDialog
            canNudge={
              selectedMember.id !== (currentUserId ?? "you") &&
              selectedMember.id !== "you"
            }
            group={selectedGroup}
            isNudging={nudgingUserId === selectedMember.id}
            member={selectedMember}
            nudgeFeedback={nudgeFeedback}
            now={now}
            onClose={() => {
              setSelectedMemberId(null);
              setNudgeFeedback(null);
            }}
            onNudge={() =>
              void nudgeMember(selectedMember.id, selectedGroup.id)
            }
          />
        ) : null}

        {isGroupSettingsOpen ? (
          <GroupSettingsDialog
            members={members}
            onClose={() => setIsGroupSettingsOpen(false)}
            selectedGroup={selectedGroup}
            onGroupIconUpdate={updateGroupIcon}
            remoteCurrentUserId={remoteClient ? currentUserId : null}
            onUpdate={updateFriendIcon}
          />
        ) : null}

        {isChoosingStudy ? (
          <StartStudyDialog
            onClose={() => setIsChoosingStudy(false)}
            onStart={(subjectId) => void startGroupStudy(subjectId)}
            subjects={timerSubjects}
            title={`Study in ${selectedGroup.name}`}
          />
        ) : null}

        {groupView === "rankings" ? (
          <section className="space-y-3">
            <div className="grid gap-2">
              {ranking.map((member, index) => (
                <button
                  className="mac-focus grid min-h-14 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-2.5 text-left transition active:scale-[0.99]"
                  key={member.id}
                  onClick={() => {
                    setNudgeFeedback(null);
                    setSelectedMemberId(member.id);
                  }}
                  type="button"
                >
                  <span className="font-mono text-sm font-semibold text-[var(--color-text-muted)]">
                    #{index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{member.name}</p>
                    <p className="truncate text-xs font-medium text-[var(--color-text-muted)]">
                      {member.handle}
                    </p>
                  </div>
                  <p className="font-mono text-sm font-semibold tabular-nums">
                    {formatDuration(
                      getLiveRankingSeconds(member, rankingWindow, now),
                    )}
                  </p>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="fixed inset-x-4 bottom-[calc(var(--mobile-nav-height)+0.75rem)] z-20 mx-auto max-w-lg lg:sticky lg:inset-x-auto lg:bottom-4 lg:max-w-none lg:pt-2">
          <button
            className={cn(
              "mac-focus inline-flex h-12 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold shadow-[0_16px_34px_rgb(0_0_0/0.32)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55",
              activeInSelectedGroup
                ? "bg-[var(--color-danger)] text-white"
                : "bg-[var(--color-mac-yellow)] text-[#141414]",
            )}
            disabled={isStudyingElsewhere}
            onClick={() =>
              void (activeInSelectedGroup
                ? stopGroupStudy()
                : setIsChoosingStudy(true))
            }
            type="button"
          >
            {activeInSelectedGroup ? (
              <CircleStop aria-hidden size={18} />
            ) : (
              <Play aria-hidden size={18} />
            )}
            {activeInSelectedGroup
              ? "Stop study"
              : isStudyingElsewhere
                ? "Studying in another session"
                : "Start study"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-1">
      <section className="grid grid-cols-3 gap-2">
        <SummaryStat label="Groups" value={`${socialState.groups.length}`} />
        <SummaryStat label="Active" value={`${activeTotal}`} />
        <SummaryStat label="Members" value={`${uniqueMemberCount}`} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">Groups</h2>
          <button
            className="mac-focus inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-3 text-sm font-semibold text-[#141414]"
            onClick={() => setIsCreating(true)}
            type="button"
          >
            <Plus aria-hidden size={17} />
            Create
          </button>
        </div>

        <div className="grid gap-2">
          {groupSummaries.map(({ group, activeNow, memberCount }) => (
            <button
              className="mac-focus grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-3 text-left transition active:scale-[0.99]"
              key={group.id}
              onClick={() => {
                setGroupView("class");
                setSelectedGroupId(group.id);
              }}
              type="button"
            >
              <GroupIconBadge icon={group.icon} />
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold">{group.name}</h3>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {activeNow} active
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold tabular-nums">
                  {memberCount}
                </p>
                <p className="text-xs font-medium text-[var(--color-text-muted)]">
                  members
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {isCreating ? (
        <CreateGroupDialog
          groupIcon={groupIcon}
          groupName={groupName}
          onClose={() => setIsCreating(false)}
          onCreate={createGroup}
          onIconChange={setGroupIcon}
          onMemberToggle={toggleMember}
          onNameChange={setGroupName}
          currentUserId={currentUserId}
          selectedMembers={selectedMembers}
          socialState={socialState}
        />
      ) : null}
    </div>
  );
}

function CreateGroupDialog({
  groupIcon,
  groupName,
  onClose,
  onCreate,
  onIconChange,
  onMemberToggle,
  onNameChange,
  currentUserId,
  selectedMembers,
  socialState,
}: {
  groupIcon: GroupIconKey;
  groupName: string;
  onClose: () => void;
  onCreate: () => void;
  onIconChange: (icon: GroupIconKey) => void;
  onMemberToggle: (friendId: string) => void;
  onNameChange: (name: string) => void;
  currentUserId: string | null;
  selectedMembers: string[];
  socialState: SocialState;
}) {
  const inviteableFriends = socialState.friends.filter(
    (friend) => friend.id !== "you" && friend.id !== currentUserId,
  );

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-black/58 px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-[calc(var(--safe-area-top)+0.75rem)] backdrop-blur-sm sm:items-center sm:justify-center"
      role="dialog"
    >
      <div className="max-h-[min(88dvh,680px)] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-[var(--color-background)] p-4">
          <h2 className="text-lg font-semibold">Create group</h2>
          <button
            className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)]"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden size={18} />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="space-y-5 p-4">
          <label className="block text-sm font-medium">
            Name
            <input
              className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]"
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Study group"
              value={groupName}
            />
          </label>

          <div>
            <p className="text-sm font-medium">Icon</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {GROUP_ICON_KEYS.map((icon) => (
                <button
                  aria-label={`Use ${groupIconLabels[icon]} icon`}
                  className={cn(
                    "mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md border transition",
                    groupIcon === icon
                      ? "border-[var(--color-mac-yellow)] bg-[var(--color-mac-yellow)] text-[#141414]"
                      : "border-[var(--color-border)] text-[var(--color-text-muted)]",
                  )}
                  key={icon}
                  onClick={() => onIconChange(icon)}
                  type="button"
                >
                  <GroupIconOnly icon={icon} size={18} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium">Members</p>
            <div className="mt-3 grid gap-2">
              {inviteableFriends.map((friend) => {
                const selected = selectedMembers.includes(friend.id);

                return (
                  <button
                    className="mac-focus grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-[rgb(255_255_255/0.035)] px-3 py-3 text-left"
                    key={friend.id}
                    onClick={() => onMemberToggle(friend.id)}
                    type="button"
                  >
                    <ProfileBadge friend={friend} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{friend.name}</p>
                      <p className="truncate text-sm text-[var(--color-text-muted)]">
                        {friend.handle}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex h-7 w-7 items-center justify-center rounded-full border",
                        selected
                          ? "border-[var(--color-mac-yellow)] bg-[var(--color-mac-yellow)] text-[#141414]"
                          : "border-[var(--color-border)]",
                      )}
                    >
                      {selected ? <Check aria-hidden size={15} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-[var(--color-background)] p-4">
          <button
            className="mac-focus inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-3 text-sm font-semibold text-[#141414] disabled:opacity-45"
            disabled={!groupName.trim()}
            onClick={onCreate}
            type="button"
          >
            <Save aria-hidden size={17} />
            Create group
          </button>
        </div>
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

function GroupIconBadge({ icon }: { icon: GroupIconKey }) {
  return (
    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414]">
      <GroupIconOnly icon={icon} size={20} />
    </span>
  );
}

function GroupIconOnly({ icon, size }: { icon: GroupIconKey; size: number }) {
  const Icon = groupIconComponents[icon];

  return <Icon aria-hidden size={size} />;
}

function ProfileBadge({ friend }: { friend: SocialFriend }) {
  return (
    <span
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-[#141414]",
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

function GroupMemberDialog({
  canNudge,
  group,
  isNudging,
  member,
  now,
  nudgeFeedback,
  onClose,
  onNudge,
}: {
  canNudge: boolean;
  group: SocialGroup;
  isNudging: boolean;
  member: SocialFriend;
  now: Date;
  nudgeFeedback: string | null;
  onClose: () => void;
  onNudge: () => void;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-black/58 px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-[calc(var(--safe-area-top)+0.75rem)] backdrop-blur-sm sm:items-center sm:justify-center"
      role="dialog"
    >
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ProfileBadge friend={member} />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold">{member.name}</h2>
              <p className="truncate text-sm text-[var(--color-text-muted)]">
                {member.handle}
              </p>
            </div>
          </div>
          <button
            className="mac-focus inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)]"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden size={17} />
            <span className="sr-only">Close member details</span>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <NudgePill
            disabled={!canNudge}
            isSending={isNudging}
            onClick={onNudge}
          />
          <p className="text-xs font-medium text-[var(--color-text-muted)]">
            {nudgeFeedback ??
              (canNudge
                ? `Send from ${group.name}`
                : "You cannot nudge yourself.")}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <MemberStat
            label="Today"
            value={formatDuration(getLiveRankingSeconds(member, "day", now))}
          />
          <MemberStat
            label="Week"
            value={formatDuration(getLiveRankingSeconds(member, "week", now))}
          />
          <MemberStat
            label="Month"
            value={formatDuration(getLiveRankingSeconds(member, "month", now))}
          />
        </div>
      </div>
    </div>
  );
}

function MemberStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[rgb(255_255_255/0.035)] px-2 py-2.5 text-center">
      <p className="font-mono text-sm font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </p>
    </div>
  );
}

function GroupSettingsDialog({
  members,
  onClose,
  onGroupIconUpdate,
  onUpdate,
  remoteCurrentUserId,
  selectedGroup,
}: {
  members: SocialFriend[];
  onClose: () => void;
  onGroupIconUpdate: (icon: GroupIconKey) => void | Promise<void>;
  onUpdate: (friendId: string, icon: PersonIconKey) => void | Promise<void>;
  remoteCurrentUserId: string | null;
  selectedGroup: SocialGroup;
}) {
  const editableMembers = remoteCurrentUserId
    ? members.filter((member) => member.id === remoteCurrentUserId)
    : members;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-black/58 px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-[calc(var(--safe-area-top)+0.75rem)] backdrop-blur-sm sm:items-center sm:justify-center"
      role="dialog"
    >
      <div className="max-h-[min(88dvh,680px)] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-[var(--color-background)] p-4">
          <h2 className="text-lg font-semibold">Group settings</h2>
          <button
            className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)]"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden size={18} />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="grid gap-5 p-4">
          <section>
            <p className="text-sm font-semibold">Group icon</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {GROUP_ICON_KEYS.map((icon) => (
                <button
                  aria-label={`Use ${groupIconLabels[icon]} icon`}
                  className={cn(
                    "mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md border transition",
                    selectedGroup.icon === icon
                      ? "border-[var(--color-mac-yellow)] bg-[var(--color-mac-yellow)] text-[#141414]"
                      : "border-[var(--color-border)] text-[var(--color-text-muted)]",
                  )}
                  key={icon}
                  onClick={() => void onGroupIconUpdate(icon)}
                  type="button"
                >
                  <GroupIconOnly icon={icon} size={18} />
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-sm font-semibold">
                {remoteCurrentUserId ? "My class icon" : "Member icons"}
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Choose how you appear in class view.
              </p>
            </div>
            {editableMembers.map((member) => (
              <div
                className="space-y-3 rounded-md bg-[rgb(255_255_255/0.035)] p-3"
                key={member.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate font-semibold">{member.name}</p>
                  <p className="font-mono text-sm font-semibold tabular-nums text-[var(--color-text-muted)]">
                    {formatDuration(member.daySeconds)}
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {PERSON_ICON_KEYS.map((icon) => {
                    const selected = member.personIcon === icon;

                    return (
                      <button
                        aria-label={`Use ${personIconLabels[icon]} icon for ${member.name}`}
                        className={cn(
                          "mac-focus flex h-20 items-center justify-center rounded-md border transition",
                          selected
                            ? "border-[var(--color-mac-yellow)] bg-[rgb(255_227_48/0.1)]"
                            : "border-[var(--color-border)]",
                        )}
                        key={icon}
                        onClick={() => void onUpdate(member.id, icon)}
                        type="button"
                      >
                        <StudyPersonIcon active={member.studying} icon={icon} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

function StudyPersonIcon({
  active,
  icon,
}: {
  active: boolean;
  icon: PersonIconKey;
}) {
  const color = active ? MEMBER_ACTIVE_COLOR : MEMBER_INACTIVE_COLOR;

  return (
    <svg
      aria-hidden
      className="mx-auto h-14 w-14 sm:h-16 sm:w-16"
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="3.2"
      viewBox="0 0 72 72"
    >
      <PersonIconAccent icon={icon} />
      <circle cx="32" cy="25" r="7.5" />
      <path d="M18 53c0-10 6-17 14-17s14 7 14 17" />
      <path d="M12 56h40M17 64V49h31v15" />
      <path d="M52 37h10l3 19H50l2-19Z" />
      <path d="M56 37V28h8" />
    </svg>
  );
}

function PersonIconAccent({ icon }: { icon: PersonIconKey }) {
  if (icon === "clock-desk") {
    return (
      <>
        <circle cx="18" cy="14" r="7" />
        <path d="M18 10v5l4 2" />
      </>
    );
  }

  if (icon === "lamp-desk") {
    return (
      <>
        <path d="M20 13h15" />
        <path d="M23 13 20 23h18l-3-10" />
      </>
    );
  }

  if (icon === "spark-desk") {
    return (
      <>
        <path d="M19 12h.1M24 7h.1M27 15h.1" />
        <path d="M21 21c4-4 8-4 12 0" />
      </>
    );
  }

  return (
    <>
      <path d="M31 6c5 5 1 9 6 13" />
      <path d="M25 10c4 4 1 7 5 10" />
      <path d="M40 10c-3 4-1 7-5 10" />
    </>
  );
}

function getGroupMembers(
  group: SocialGroup,
  friendsById: Map<string, SocialFriend>,
) {
  return group.memberIds
    .map((friendId) => friendsById.get(friendId))
    .filter((friend): friend is SocialFriend => Boolean(friend));
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

type LocalTimerState = {
  activeSession?: RemoteActiveSession | null;
  sessions?: {
    id: string;
    subjectId: string | null;
    groupId?: string | null;
    startedAt: string;
    endedAt: string;
    status: "completed" | "needs_confirmation";
    source: "timer";
  }[];
  subjects?: Partial<RemoteSubject>[];
};

function readLocalTimerState(): LocalTimerState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const saved = window.localStorage.getItem(TIMER_STORAGE_KEY);

  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved) as LocalTimerState;
  } catch {
    return null;
  }
}

function writeLocalTimerState(state: LocalTimerState) {
  window.localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state));
}

function normalizeTimerSubjects(value: LocalTimerState["subjects"]) {
  if (!Array.isArray(value) || !value.length) {
    return fallbackStudySubjects;
  }

  const normalized = value
    .map((subject, index) => ({
      id: subject.id || fallbackStudySubjects[index]?.id || `subject-${index}`,
      name:
        subject.name ||
        fallbackStudySubjects[index]?.name ||
        `Subject ${index + 1}`,
      color: subject.color || fallbackStudySubjects[index]?.color || "#FFE330",
    }))
    .filter((subject) => subject.name);

  return normalized.length ? normalized : fallbackStudySubjects;
}
