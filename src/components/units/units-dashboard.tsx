"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Plus,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import {
  addRemoteFriend,
  fetchRemoteSocialSnapshot,
  fetchRemoteUnitCohort,
  fetchRemoteUnitState,
  inviteRemoteFriendToGroup,
  leaveRemoteUnitEnrollment,
  subscribeToRemoteAppChanges,
  upsertRemoteUnitEnrollment,
  type RemoteUnitState,
} from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  defaultSocialState,
  type SocialGroup,
  type SocialState,
} from "@/lib/social-state";
import {
  TEACHING_PERIODS,
  getCohortLabel,
  getDefaultTeachingPeriod,
  getTeachingPeriodLabel,
  getUnitYearOptions,
  isPastUnitEnrollment,
  isValidUnitCode,
  normalizeUnitCode,
  normalizeUnitNickname,
  type TeachingPeriod,
  type UnitCohortMember,
  type UnitEnrollment,
} from "@/lib/units";
import { cn } from "@/lib/utils";

type CohortScope = "all" | "friends" | "groups";

const demoEnrollments: UnitEnrollment[] = [
  {
    code: "FIT3077",
    joinedAt: new Date().toISOString(),
    nickname: "Software architecture",
    offeringId: "demo-fit3077-2027-s1",
    period: "semester_1",
    unitId: "demo-fit3077",
    year: 2027,
  },
  {
    code: "FIT3159",
    joinedAt: new Date().toISOString(),
    nickname: null,
    offeringId: "demo-fit3159-2027-s1",
    period: "semester_1",
    unitId: "demo-fit3159",
    year: 2027,
  },
];

const demoUnitState: RemoteUnitState = {
  enrollments: demoEnrollments,
  suggestions: [
    { code: "FIT2004", nickname: null },
    { code: "FIT3077", nickname: "Software architecture" },
    { code: "FIT3159", nickname: null },
  ],
};

export function UnitsDashboard() {
  const [unitState, setUnitState] = useState<RemoteUnitState>({
    enrollments: [],
    suggestions: [],
  });
  const [socialState, setSocialState] =
    useState<SocialState>(defaultSocialState);
  const [remoteClient, setRemoteClient] = useState<SupabaseClient | null>(null);
  const [dataMode, setDataMode] = useState<"loading" | "demo" | "remote">(
    "loading",
  );
  const [selectedOfferingId, setSelectedOfferingId] = useState<string | null>(
    null,
  );
  const [cohort, setCohort] = useState<UnitCohortMember[]>([]);
  const [cohortLoading, setCohortLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<CohortScope>("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refreshRemote = useCallback(async (supabase: SupabaseClient) => {
    const [units, social] = await Promise.all([
      fetchRemoteUnitState(supabase),
      fetchRemoteSocialSnapshot(supabase),
    ]);

    if (units) setUnitState(units);
    if (social) setSocialState(social.socialState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let supabase: SupabaseClient;

    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      void Promise.resolve().then(() => {
        setUnitState(demoUnitState);
        setDataMode("demo");
      });
      return;
    }

    void Promise.resolve().then(() => setRemoteClient(supabase));

    void Promise.resolve()
      .then(() => refreshRemote(supabase))
      .then(() => {
        if (!cancelled) setDataMode("remote");
      })
      .catch(() => {
        if (!cancelled) {
          setFeedback("Run the latest unit discovery migration, then reload.");
          setDataMode("remote");
          setUnitState({ enrollments: [], suggestions: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshRemote]);

  useEffect(() => {
    if (!remoteClient || dataMode !== "remote") return;

    return subscribeToRemoteAppChanges(remoteClient, () => {
      void refreshRemote(remoteClient);
    });
  }, [dataMode, refreshRemote, remoteClient]);

  const selectedEnrollment = unitState.enrollments.find(
    (enrollment) => enrollment.offeringId === selectedOfferingId,
  );

  useEffect(() => {
    if (!selectedOfferingId) {
      return;
    }

    if (!remoteClient || dataMode === "demo") {
      void Promise.resolve().then(() =>
        setCohort(getDemoCohort(selectedOfferingId, socialState.groups)),
      );
      return;
    }

    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setCohortLoading(true);
    });

    void fetchRemoteUnitCohort({
      offeringId: selectedOfferingId,
      supabase: remoteClient,
    })
      .then((members) => {
        if (!cancelled) setCohort(members);
      })
      .catch(() => {
        if (!cancelled) setFeedback("Could not load this unit cohort.");
      })
      .finally(() => {
        if (!cancelled) setCohortLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dataMode, remoteClient, selectedOfferingId, socialState.groups]);

  const manageableGroups = socialState.groups.filter(
    (group) =>
      group.currentUserRole === "owner" || group.currentUserRole === "admin",
  );
  const filteredCohort = useMemo(() => {
    const query = search.trim().toLowerCase();

    return cohort
      .filter(
        (member) =>
          !query ||
          member.displayName.toLowerCase().includes(query) ||
          member.handle.toLowerCase().includes(query),
      )
      .filter((member) => {
        if (scope === "friends") return member.isFriend;
        if (scope !== "groups") return true;
        if (groupFilter === "all") return member.sharedGroupIds.length > 0;
        return member.sharedGroupIds.includes(groupFilter);
      })
      .sort(
        (first, second) =>
          Number(second.isFriend) - Number(first.isFriend) ||
          first.displayName.localeCompare(second.displayName),
      );
  }, [cohort, groupFilter, scope, search]);

  async function addEnrollment(input: {
    code: string;
    nickname: string | null;
    period: TeachingPeriod;
    year: number;
  }) {
    setBusyKey("add-unit");
    setFeedback(null);

    try {
      if (remoteClient) {
        const offeringId = await upsertRemoteUnitEnrollment({
          ...input,
          supabase: remoteClient,
        });
        await refreshRemote(remoteClient);
        setSelectedOfferingId(offeringId);
      } else {
        const offeringId = `demo-${input.code}-${input.year}-${input.period}`;
        setUnitState((current) => ({
          suggestions: current.suggestions,
          enrollments: [
            ...current.enrollments.filter(
              (enrollment) => enrollment.offeringId !== offeringId,
            ),
            {
              ...input,
              joinedAt: new Date().toISOString(),
              offeringId,
              unitId: `demo-${input.code}`,
            },
          ],
        }));
        setSelectedOfferingId(offeringId);
      }

      setIsAdding(false);
      setFeedback("Unit added to your cohort list and study timer.");
    } catch (error) {
      setFeedback(getErrorMessage(error, "Could not add that unit."));
    } finally {
      setBusyKey(null);
    }
  }

  async function leaveEnrollment(enrollment: UnitEnrollment) {
    setBusyKey(`leave:${enrollment.offeringId}`);
    setFeedback(null);

    try {
      if (remoteClient) {
        await leaveRemoteUnitEnrollment({
          offeringId: enrollment.offeringId,
          supabase: remoteClient,
        });
        await refreshRemote(remoteClient);
      } else {
        setUnitState((current) => ({
          ...current,
          enrollments: current.enrollments.filter(
            (item) => item.offeringId !== enrollment.offeringId,
          ),
        }));
      }

      setSelectedOfferingId(null);
      setFeedback("Left the cohort. Your timer history is unchanged.");
    } catch (error) {
      setFeedback(getErrorMessage(error, "Could not leave this cohort."));
    } finally {
      setBusyKey(null);
    }
  }

  async function addFriend(memberId: string) {
    setBusyKey(`friend:${memberId}`);

    try {
      if (remoteClient) {
        await addRemoteFriend({ friendId: memberId, supabase: remoteClient });
        await refreshRemote(remoteClient);
      }

      setCohort((current) =>
        current.map((member) =>
          member.id === memberId ? { ...member, isFriend: true } : member,
        ),
      );
      setFeedback("Friend added. You can now add them to a group.");
    } catch (error) {
      setFeedback(getErrorMessage(error, "Could not add this friend."));
    } finally {
      setBusyKey(null);
    }
  }

  async function addToGroup(memberId: string, groupId: string) {
    if (!groupId) return;
    setBusyKey(`group:${memberId}`);

    try {
      if (remoteClient) {
        await inviteRemoteFriendToGroup({
          friendId: memberId,
          groupId,
          supabase: remoteClient,
        });
        await refreshRemote(remoteClient);
      }

      setCohort((current) =>
        current.map((member) =>
          member.id === memberId
            ? {
                ...member,
                sharedGroupIds: Array.from(
                  new Set([...member.sharedGroupIds, groupId]),
                ),
              }
            : member,
        ),
      );
      setFeedback("Added to group.");
    } catch (error) {
      setFeedback(getErrorMessage(error, "Could not add them to that group."));
    } finally {
      setBusyKey(null);
    }
  }

  if (selectedEnrollment) {
    return (
      <OfferingDetail
        allGroups={socialState.groups}
        busyKey={busyKey}
        cohort={filteredCohort}
        cohortLoading={cohortLoading}
        enrollment={selectedEnrollment}
        feedback={feedback}
        groupFilter={groupFilter}
        manageableGroups={manageableGroups}
        onAddFriend={(memberId) => void addFriend(memberId)}
        onAddToGroup={(memberId, groupId) => void addToGroup(memberId, groupId)}
        onBack={() => {
          setSelectedOfferingId(null);
          setCohort([]);
          setSearch("");
          setScope("all");
        }}
        onGroupFilterChange={setGroupFilter}
        onLeave={() => void leaveEnrollment(selectedEnrollment)}
        onScopeChange={setScope}
        onSearchChange={setSearch}
        scope={scope}
        search={search}
      />
    );
  }

  const current = unitState.enrollments
    .filter((enrollment) => !isPastUnitEnrollment(enrollment))
    .sort(compareUnitEnrollments);
  const past = unitState.enrollments
    .filter((enrollment) => isPastUnitEnrollment(enrollment))
    .sort((first, second) => compareUnitEnrollments(second, first));

  return (
    <div className="space-y-6">
      <section className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-mac-yellow)]">
            Unit cohorts
          </p>
          <h2 className="mt-1 text-2xl font-semibold">Your units</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-text-muted)]">
            Find MAC members taking the same unit in the same teaching period.
          </p>
        </div>
        <button
          className="mac-focus inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-3 text-sm font-semibold text-[#141414]"
          onClick={() => setIsAdding(true)}
          type="button"
        >
          <Plus aria-hidden size={17} />
          Add unit
        </button>
      </section>

      {feedback ? <Feedback message={feedback} /> : null}
      {dataMode === "loading" ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading units…</p>
      ) : null}

      {dataMode !== "loading" ? (
        <>
          <EnrollmentSection
            empty="Add your first current or upcoming unit."
            enrollments={current}
            onOpen={setSelectedOfferingId}
            title="Current and upcoming"
          />
          {past.length ? (
            <EnrollmentSection
              empty=""
              enrollments={past}
              onOpen={setSelectedOfferingId}
              title="Past units"
            />
          ) : null}
        </>
      ) : null}

      {isAdding ? (
        <AddUnitDialog
          isSaving={busyKey === "add-unit"}
          onAdd={(input) => void addEnrollment(input)}
          onClose={() => setIsAdding(false)}
          suggestions={unitState.suggestions}
        />
      ) : null}
    </div>
  );
}

function EnrollmentSection({
  empty,
  enrollments,
  onOpen,
  title,
}: {
  empty: string;
  enrollments: UnitEnrollment[];
  onOpen: (offeringId: string) => void;
  title: string;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      {enrollments.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {enrollments.map((enrollment) => (
            <button
              className="mac-focus grid min-h-24 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-[rgb(255_255_255/0.07)] bg-[rgb(255_255_255/0.035)] p-4 text-left transition hover:border-[rgb(255_227_48/0.35)] hover:bg-[rgb(255_255_255/0.05)]"
              key={enrollment.offeringId}
              onClick={() => onOpen(enrollment.offeringId)}
              type="button"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[rgb(255_227_48/0.12)] text-[var(--color-mac-yellow)]">
                <BookOpen aria-hidden size={19} />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold">
                  {enrollment.code}
                </span>
                <span className="mt-1 block truncate text-sm text-[var(--color-text-muted)]">
                  {enrollment.nickname ||
                    getTeachingPeriodLabel(enrollment.period)}
                </span>
              </span>
              <span className="text-right text-xs font-semibold text-[var(--color-text-muted)]">
                <span className="block">{enrollment.year}</span>
                <span className="mt-1 block">
                  {getTeachingPeriodLabel(enrollment.period)}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-[var(--color-border)] p-5 text-sm text-[var(--color-text-muted)]">
          {empty}
        </p>
      )}
    </section>
  );
}

function OfferingDetail({
  allGroups,
  busyKey,
  cohort,
  cohortLoading,
  enrollment,
  feedback,
  groupFilter,
  manageableGroups,
  onAddFriend,
  onAddToGroup,
  onBack,
  onGroupFilterChange,
  onLeave,
  onScopeChange,
  onSearchChange,
  scope,
  search,
}: {
  allGroups: SocialGroup[];
  busyKey: string | null;
  cohort: UnitCohortMember[];
  cohortLoading: boolean;
  enrollment: UnitEnrollment;
  feedback: string | null;
  groupFilter: string;
  manageableGroups: SocialGroup[];
  onAddFriend: (memberId: string) => void;
  onAddToGroup: (memberId: string, groupId: string) => void;
  onBack: () => void;
  onGroupFilterChange: (value: string) => void;
  onLeave: () => void;
  onScopeChange: (scope: CohortScope) => void;
  onSearchChange: (value: string) => void;
  scope: CohortScope;
  search: string;
}) {
  return (
    <div className="space-y-5">
      <button
        className="mac-focus inline-flex h-10 items-center gap-2 rounded-md text-sm font-semibold text-[var(--color-text-muted)]"
        onClick={onBack}
        type="button"
      >
        <ArrowLeft aria-hidden size={17} />
        Your units
      </button>

      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm font-semibold text-[var(--color-mac-yellow)]">
            {getCohortLabel(enrollment)}
          </p>
          <h2 className="mt-1 text-3xl font-semibold">{enrollment.code}</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {enrollment.nickname || "Your unit cohort"} · {enrollment.year} ·{" "}
            {getTeachingPeriodLabel(enrollment.period)}
          </p>
        </div>
        <button
          className="mac-focus inline-flex h-10 items-center rounded-md border border-[rgb(255_107_107/0.45)] px-3 text-sm font-semibold text-[var(--color-danger)] disabled:opacity-45"
          disabled={busyKey === `leave:${enrollment.offeringId}`}
          onClick={onLeave}
          type="button"
        >
          Leave cohort
        </button>
      </section>

      {feedback ? <Feedback message={feedback} /> : null}

      <section className="grid gap-3 rounded-md bg-[rgb(255_255_255/0.03)] p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <label className="flex h-10 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3">
          <Search
            aria-hidden
            className="text-[var(--color-text-muted)]"
            size={16}
          />
          <input
            className="mac-focus min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-text-muted)]"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search names or @usernames"
            value={search}
          />
        </label>
        <div className="grid grid-cols-3 rounded-md bg-[rgb(255_255_255/0.045)] p-1">
          {(["all", "friends", "groups"] as const).map((item) => (
            <button
              className={cn(
                "mac-focus h-8 rounded px-3 text-xs font-semibold capitalize",
                scope === item
                  ? "bg-[var(--color-mac-yellow)] text-[#141414]"
                  : "text-[var(--color-text-muted)]",
              )}
              key={item}
              onClick={() => onScopeChange(item)}
              type="button"
            >
              {item === "all" ? "All MAC" : item}
            </button>
          ))}
        </div>
      </section>

      {scope === "groups" && allGroups.length ? (
        <select
          className="mac-focus h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold sm:max-w-xs"
          onChange={(event) => onGroupFilterChange(event.target.value)}
          value={groupFilter}
        >
          <option value="all">Any shared group</option>
          {allGroups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">People in this unit</h3>
          <span className="text-sm text-[var(--color-text-muted)]">
            {cohort.length} shown
          </span>
        </div>
        {cohortLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            Loading cohort…
          </p>
        ) : cohort.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {cohort.map((member) => (
              <CohortMemberCard
                allGroups={allGroups}
                busyKey={busyKey}
                key={member.id}
                manageableGroups={manageableGroups}
                member={member}
                onAddFriend={onAddFriend}
                onAddToGroup={onAddToGroup}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-[var(--color-border)] p-5 text-sm text-[var(--color-text-muted)]">
            No MAC members match this view yet.
          </p>
        )}
      </section>
    </div>
  );
}

function CohortMemberCard({
  allGroups,
  busyKey,
  manageableGroups,
  member,
  onAddFriend,
  onAddToGroup,
}: {
  allGroups: SocialGroup[];
  busyKey: string | null;
  manageableGroups: SocialGroup[];
  member: UnitCohortMember;
  onAddFriend: (memberId: string) => void;
  onAddToGroup: (memberId: string, groupId: string) => void;
}) {
  const availableGroups = manageableGroups.filter(
    (group) => !member.sharedGroupIds.includes(group.id),
  );

  return (
    <article className="rounded-md border border-[rgb(255_255_255/0.07)] bg-[rgb(255_255_255/0.035)] p-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-[#141414]"
          style={{ backgroundColor: member.color }}
        >
          {getInitials(member.displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{member.displayName}</p>
          <p className="truncate text-sm text-[var(--color-text-muted)]">
            {member.handle}
          </p>
        </div>
        {member.isFriend ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-success)]">
            <Check aria-hidden size={14} /> Friend
          </span>
        ) : null}
      </div>

      {member.sharedGroupIds.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {member.sharedGroupIds.map((groupId) => (
            <span
              className="rounded-full bg-[rgb(255_255_255/0.06)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-muted)]"
              key={groupId}
            >
              {allGroups.find((group) => group.id === groupId)?.name ||
                "Shared group"}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        {!member.isFriend ? (
          <button
            className="mac-focus inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-3 text-xs font-semibold text-[#141414] disabled:opacity-45"
            disabled={busyKey === `friend:${member.id}`}
            onClick={() => onAddFriend(member.id)}
            type="button"
          >
            <UserPlus aria-hidden size={15} />
            Add friend
          </button>
        ) : availableGroups.length ? (
          <select
            aria-label={`Add ${member.displayName} to a group`}
            className="mac-focus h-9 max-w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs font-semibold"
            disabled={busyKey === `group:${member.id}`}
            onChange={(event) => {
              onAddToGroup(member.id, event.target.value);
              event.target.value = "";
            }}
            value=""
          >
            <option value="">Add to group…</option>
            {availableGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">
            {manageableGroups.length
              ? "Already in your managed groups"
              : "No managed groups"}
          </p>
        )}
      </div>
    </article>
  );
}

function AddUnitDialog({
  isSaving,
  onAdd,
  onClose,
  suggestions,
}: {
  isSaving: boolean;
  onAdd: (input: {
    code: string;
    nickname: string | null;
    period: TeachingPeriod;
    year: number;
  }) => void;
  onClose: () => void;
  suggestions: RemoteUnitState["suggestions"];
}) {
  const years = getUnitYearOptions();
  const [codeInput, setCodeInput] = useState("");
  const [nickname, setNickname] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState<TeachingPeriod>(
    getDefaultTeachingPeriod(),
  );
  const normalizedCode = normalizeUnitCode(codeInput);
  const valid = isValidUnitCode(codeInput);

  function updateCode(value: string) {
    setCodeInput(value.toUpperCase());
    const suggestion = suggestions.find(
      (item) => item.code === normalizeUnitCode(value),
    );

    if (suggestion?.nickname && !nickname.trim()) {
      setNickname(suggestion.nickname);
    }
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-black/60 px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-[calc(var(--safe-area-top)+0.75rem)] backdrop-blur-sm sm:items-center sm:justify-center"
      role="dialog"
    >
      <div className="w-full max-w-lg rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] p-4">
          <div>
            <h2 className="text-lg font-semibold">Add a unit</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Join the exact year and teaching-period cohort.
            </p>
          </div>
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
            Unit code
            <input
              autoCapitalize="characters"
              className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 font-mono uppercase"
              list="unit-code-suggestions"
              maxLength={14}
              onChange={(event) => updateCode(event.target.value)}
              placeholder="FIT3077"
              value={codeInput}
            />
            <datalist id="unit-code-suggestions">
              {suggestions.map((suggestion) => (
                <option key={suggestion.code} value={suggestion.code} />
              ))}
            </datalist>
            <span
              className={cn(
                "mt-2 block text-xs",
                codeInput && !valid
                  ? "text-[var(--color-danger)]"
                  : "text-[var(--color-text-muted)]",
              )}
            >
              {codeInput && !valid
                ? "Use three letters and four digits, such as FIT3077."
                : `Canonical code: ${normalizedCode || "—"}`}
            </span>
          </label>

          <label className="block text-sm font-medium">
            Personal name{" "}
            <span className="text-[var(--color-text-muted)]">(optional)</span>
            <input
              className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
              maxLength={60}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="Software architecture"
              value={nickname}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Year
              <select
                className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                onChange={(event) => setYear(Number(event.target.value))}
                value={year}
              >
                {years.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Teaching period
              <select
                className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                onChange={(event) =>
                  setPeriod(event.target.value as TeachingPeriod)
                }
                value={period}
              >
                {TEACHING_PERIODS.map((option) => (
                  <option key={option} value={option}>
                    {getTeachingPeriodLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {valid ? (
            <div className="rounded-md bg-[rgb(255_227_48/0.08)] p-3">
              <p className="text-xs font-medium text-[var(--color-text-muted)]">
                Cohort
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-[var(--color-mac-yellow)]">
                {getCohortLabel({ code: normalizedCode, period, year })}
              </p>
            </div>
          ) : null}
        </div>

        <div className="border-t border-[var(--color-border)] p-4">
          <button
            className="mac-focus inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414] disabled:opacity-45"
            disabled={!valid || isSaving}
            onClick={() =>
              onAdd({
                code: normalizedCode,
                nickname: normalizeUnitNickname(nickname) || null,
                period,
                year,
              })
            }
            type="button"
          >
            <Plus aria-hidden size={17} />
            {isSaving ? "Adding…" : "Add unit and timer subject"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Feedback({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-[rgb(255_227_48/0.22)] bg-[rgb(255_227_48/0.06)] p-3 text-sm text-[var(--color-text-muted)]">
      {message}
    </p>
  );
}

function getDemoCohort(offeringId: string, groups: SocialGroup[]) {
  if (!offeringId.includes("FIT3077") && !offeringId.includes("fit3077")) {
    return [];
  }

  return defaultSocialState.friends
    .filter((friend) => friend.id !== "you")
    .map((friend, index) => ({
      color: friend.color,
      displayName: friend.name,
      handle: friend.handle,
      id: friend.id,
      isFriend: index < 2,
      sharedGroupIds: groups
        .filter((group) => group.memberIds.includes(friend.id))
        .map((group) => group.id),
      studyIcon: friend.personIcon,
    }));
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function compareUnitEnrollments(first: UnitEnrollment, second: UnitEnrollment) {
  return (
    first.year - second.year ||
    TEACHING_PERIODS.indexOf(first.period) -
      TEACHING_PERIODS.indexOf(second.period) ||
    first.code.localeCompare(second.code)
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
