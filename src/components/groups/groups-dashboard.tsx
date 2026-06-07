"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Flame,
  Plus,
  Save,
  Settings2,
  Target,
  Trophy,
  Users,
  X,
} from "lucide-react";
import {
  GROUP_ICON_KEYS,
  PERSON_ICON_KEYS,
  SOCIAL_STORAGE_KEY,
  defaultSocialState,
  getRankingSeconds,
  normalizeSocialState,
  type GroupIconKey,
  type PersonIconKey,
  type RankingWindow,
  type SocialFriend,
  type SocialGroup,
  type SocialState,
} from "@/lib/social-state";
import { formatDuration } from "@/lib/timer";
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

const personIconLabels = {
  "flame-desk": "Flame",
  "clock-desk": "Clock",
  "lamp-desk": "Lamp",
  "spark-desk": "Spark",
} satisfies Record<PersonIconKey, string>;

export function GroupsDashboard() {
  const [socialState, setSocialState] =
    useState<SocialState>(defaultSocialState);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditingMemberIcons, setIsEditingMemberIcons] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [rankingWindow, setRankingWindow] = useState<RankingWindow>("day");
  const [groupName, setGroupName] = useState("");
  const [groupIcon, setGroupIcon] = useState<GroupIconKey>("users");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem(SOCIAL_STORAGE_KEY);

    /* eslint-disable react-hooks/set-state-in-effect -- Local demo state is
     * hydrated after mount so the app shell stays deterministic. */
    if (saved) {
      try {
        setSocialState(normalizeSocialState(JSON.parse(saved)));
      } catch {
        setSocialState(defaultSocialState);
      }
    }

    setIsLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    window.localStorage.setItem(
      SOCIAL_STORAGE_KEY,
      JSON.stringify(socialState),
    );
  }, [isLoaded, socialState]);

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

  function createGroup() {
    const name = groupName.trim();

    if (!name) {
      return;
    }

    const newGroup: SocialGroup = {
      id: `group-${crypto.randomUUID()}`,
      name,
      icon: groupIcon,
      memberIds: uniqueIds(["you", ...selectedMembers]),
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

  function updateGroupIcon(icon: GroupIconKey) {
    if (!selectedGroup) {
      return;
    }

    setSocialState((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === selectedGroup.id ? { ...group, icon } : group,
      ),
    }));
  }

  function updateFriendIcon(friendId: string, personIcon: PersonIconKey) {
    setSocialState((current) => ({
      ...current,
      friends: current.friends.map((friend) =>
        friend.id === friendId ? { ...friend, personIcon } : friend,
      ),
    }));
  }

  if (selectedGroup) {
    const members = getGroupMembers(selectedGroup, friendsById).sort(
      (first, second) => second.daySeconds - first.daySeconds,
    );
    const activeNow = members.filter((member) => member.studying).length;
    const ranking = [...members].sort(
      (first, second) =>
        getRankingSeconds(second, rankingWindow) -
        getRankingSeconds(first, rankingWindow),
    );

    return (
      <div className="space-y-5 pt-1">
        <section className="space-y-4">
          <button
            className="mac-focus inline-flex h-10 items-center gap-2 rounded-md text-sm font-semibold text-[var(--color-text-muted)]"
            onClick={() => setSelectedGroupId(null)}
            type="button"
          >
            <ArrowLeft aria-hidden size={17} />
            Groups
          </button>

          <div className="flex min-w-0 items-center gap-4">
            <p className="shrink-0 text-2xl font-semibold tabular-nums">
              <span className="text-[#ff7a00]">{activeNow}</span>
              <span className="text-[var(--color-text-muted)]">
                /{members.length}
              </span>
            </p>
            <h2 className="min-w-0 truncate text-2xl font-semibold">
              {selectedGroup.name}
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
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
                onClick={() => updateGroupIcon(icon)}
                type="button"
              >
                <GroupIconOnly icon={icon} size={17} />
              </button>
            ))}
            <button
              className="mac-focus inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-text)]"
              onClick={() => setIsEditingMemberIcons(true)}
              type="button"
            >
              <Settings2 aria-hidden size={16} />
              Icons
            </button>
          </div>
        </section>

        <section>
          <div className="grid grid-cols-4 gap-x-2 gap-y-8 py-2">
            {members.map((member) => (
              <div
                className={cn(
                  "min-w-0 text-center transition",
                  member.studying
                    ? "text-[#ff7a00]"
                    : "text-[#555b6e] opacity-80",
                )}
                key={member.id}
              >
                <StudyPersonIcon
                  active={member.studying}
                  icon={member.personIcon}
                />
                <p className="mt-2 truncate text-sm font-semibold">
                  {member.name}
                </p>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                  {formatDuration(member.daySeconds)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {isEditingMemberIcons ? (
          <MemberIconDialog
            members={members}
            onClose={() => setIsEditingMemberIcons(false)}
            onUpdate={updateFriendIcon}
          />
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Rankings</h3>
            <div className="grid grid-cols-3 rounded-md border border-[var(--color-border)] p-1">
              {rankingWindows.map((window) => (
                <button
                  className={cn(
                    "mac-focus h-8 rounded px-3 text-xs font-semibold transition",
                    rankingWindow === window.id
                      ? "bg-[var(--color-mac-yellow)] text-[#141414]"
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
          </div>

          <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
            {ranking.map((member, index) => (
              <div
                className="grid min-h-14 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5"
                key={member.id}
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
                  {formatDuration(getRankingSeconds(member, rankingWindow))}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-1">
      <section className="grid grid-cols-3 divide-x divide-[var(--color-border)] border-y border-[var(--color-border)] py-3">
        <SummaryStat label="Groups" value={`${socialState.groups.length}`} />
        <SummaryStat label="Active" value={`${activeTotal}`} />
        <SummaryStat label="Members" value={`${uniqueMemberCount}`} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">Groups</h2>
          <button
            className="mac-focus inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414]"
            onClick={() => setIsCreating(true)}
            type="button"
          >
            <Plus aria-hidden size={17} />
            Create
          </button>
        </div>

        <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
          {groupSummaries.map(({ group, activeNow, memberCount }) => (
            <button
              className="mac-focus grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-4 text-left"
              key={group.id}
              onClick={() => setSelectedGroupId(group.id)}
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
  selectedMembers: string[];
  socialState: SocialState;
}) {
  const inviteableFriends = socialState.friends.filter(
    (friend) => friend.id !== "you",
  );

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-black/58 px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-[calc(var(--safe-area-top)+0.75rem)] backdrop-blur-sm sm:items-center sm:justify-center"
      role="dialog"
    >
      <div className="max-h-[min(88dvh,680px)] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-background)] p-4">
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
              className="mac-focus mt-2 h-12 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]"
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
                    "mac-focus inline-flex h-11 w-11 items-center justify-center rounded-md border transition",
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
            <div className="mt-3 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
              {inviteableFriends.map((friend) => {
                const selected = selectedMembers.includes(friend.id);

                return (
                  <button
                    className="mac-focus grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3 text-left"
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

        <div className="sticky bottom-0 border-t border-[var(--color-border)] bg-[var(--color-background)] p-4">
          <button
            className="mac-focus inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 font-semibold text-[#141414] disabled:opacity-45"
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
    <div className="px-3 text-center">
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

function MemberIconDialog({
  members,
  onClose,
  onUpdate,
}: {
  members: SocialFriend[];
  onClose: () => void;
  onUpdate: (friendId: string, icon: PersonIconKey) => void;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-black/58 px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-[calc(var(--safe-area-top)+0.75rem)] backdrop-blur-sm sm:items-center sm:justify-center"
      role="dialog"
    >
      <div className="max-h-[min(88dvh,680px)] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-background)] p-4">
          <h2 className="text-lg font-semibold">Member icons</h2>
          <button
            className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)]"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden size={18} />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="divide-y divide-[var(--color-border)]">
          {members.map((member) => (
            <div className="space-y-3 px-4 py-4" key={member.id}>
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
                      onClick={() => onUpdate(member.id, icon)}
                      type="button"
                    >
                      <StudyPersonIcon active={member.studying} icon={icon} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
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

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}
