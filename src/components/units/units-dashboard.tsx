"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import type { AppSupabaseClient as SupabaseClient } from "@/lib/supabase/types";
import {
  ArrowLeft,
  BookOpen,
  CircleHelp,
  History,
  BriefcaseBusiness,
  Check,
  Info,
  Link2,
  LogOut,
  ListFilter,
  LoaderCircle,
  Plus,
  Search,
  Send,
  UserPlus,
  UsersRound,
  Timer,
  Trophy,
  Ellipsis,
} from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
import { EmptyStateCta } from "@/components/empty-state-cta";
import { CustomSelect } from "@/components/custom-select";
import { PaginatedList } from "@/components/paginated-list";
import { TransientToast } from "@/components/transient-toast";
import {
  cacheRemoteUnitState,
  dedupeRemoteRequest,
  getCachedRemoteUnitState,
  subscribeToRemoteTableChanges,
} from "@/lib/client-cache";
import {
  addRemoteFriend,
  fetchRemoteStudyGroups,
  fetchRemoteUnitCohortPage,
  fetchRemoteUnitWeeklyLeaderboard,
  fetchRemoteUnitState,
  inviteRemoteFriendToGroup,
  leaveRemoteUnitEnrollment,
  requestRemoteSpecialUnit,
  setRemoteSubjectUnitOffering,
  createRemoteSubjectForUnit,
  upsertRemoteUnitEnrollment,
  type RemoteUnitState,
} from "@/lib/supabase/app-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useAppHeaderDetail } from "@/components/app-header-detail";
import {
  defaultSocialState,
  type SocialGroup,
  type SocialState,
} from "@/lib/social-state";
import {
  TEACHING_PERIODS,
  findSpecialUnitByAlias,
  filterUnitEnrollments,
  getCohortLabel,
  getDefaultTeachingPeriod,
  getTeachingPeriodLabel,
  getTeachingPeriodShortLabel,
  getUnitMemberCountLabel,
  getUnitYearOptions,
  isPastUnitEnrollment,
  isValidUnitCode,
  normalizeUnitCode,
  normalizeUnitNickname,
  type SpecialUnit,
  type TeachingPeriod,
  type UnitCohortMember,
  type UnitLeaderboardEntry,
  type UnitEnrollment,
  type UnitEnrollmentFilter,
  isUnitPeriodFull,
  MAX_UNITS_PER_PERIOD,
} from "@/lib/units";
import { cn } from "@/lib/utils";
import {
  ListSkeleton,
  Skeleton,
  SkeletonGroup,
} from "@/components/ui/skeleton";
import { getMascotSrc } from "@/lib/mascots";
import { InfiniteScrollSentinel } from "@/components/infinite-scroll-sentinel";

type CohortScope = "all" | "friends";
const UNLINKED_SUBJECT_VALUE = "__unlinked__";
const CREATE_SUBJECT_VALUE = "__create__";
// Same palette as the timer's subject colours.
const NEW_SUBJECT_COLORS = [
  "#FFE330",
  "#6CB6FF",
  "#42D392",
  "#FF8A65",
  "#B388FF",
  "#F06292",
];
const ALL_UNIT_FILTER_VALUE = "all";
const UNIT_CHANGE_TABLES = new Set([
  "group_members",
  "groups",
  "special_unit_aliases",
  "special_units",
  "subjects",
  "unit_enrolments",
]);

const demoEnrollments: UnitEnrollment[] = [
  {
    code: "FIT3077",
    joinedAt: new Date().toISOString(),
    memberCount: 18,
    nickname: "Software architecture",
    offeringId: "demo-fit3077-2027-s1",
    period: "semester_1",
    unitId: "demo-fit3077",
    year: 2027,
  },
  {
    code: "FIT3159",
    joinedAt: new Date().toISOString(),
    memberCount: 7,
    nickname: null,
    offeringId: "demo-fit3159-2027-s1",
    period: "semester_1",
    unitId: "demo-fit3159",
    year: 2027,
  },
];

const demoUnitState: RemoteUnitState = {
  enrollments: demoEnrollments,
  specialUnits: [
    {
      aliasCodes: ["FIT3045", "FIT4042"],
      code: "IBL",
      description: "Industry experience completed as part of your studies.",
      name: "Industry Based Learning",
    },
  ],
  subjects: [
    {
      color: "#6CB6FF",
      id: "demo-subject-fit3077",
      name: "Software architecture",
      canonicalCode: "FIT3077",
      unitOfferingId: "demo-fit3077-2027-s1",
    },
    {
      color: "#42D392",
      id: "demo-subject-algorithms",
      name: "Algorithms",
      unitOfferingId: null,
    },
  ],
  suggestions: [
    { code: "FIT2004", nickname: null },
    { code: "FIT3077", nickname: "Software architecture" },
    { code: "FIT3159", nickname: null },
  ],
};

export function UnitsDashboard({
  isActive = true,
  userId = null,
}: {
  isActive?: boolean;
  userId?: string | null;
} = {}) {
  const [unitState, setUnitState] = useState<RemoteUnitState>({
    enrollments: [],
    specialUnits: [],
    subjects: [],
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
  const [cohortHasMore, setCohortHasMore] = useState(false);
  const [cohortLoadingMore, setCohortLoadingMore] = useState(false);
  const cohortRequestRef = useRef(0);
  const [isAdding, setIsAdding] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [unitFilter, setUnitFilter] = useState<UnitEnrollmentFilter>({
    period: null,
    year: null,
  });
  const [isRequestingUnit, setIsRequestingUnit] = useState(false);
  const [isSpecialUnitsOpen, setIsSpecialUnitsOpen] = useState(false);
  const [selectedSpecialUnit, setSelectedSpecialUnit] =
    useState<SpecialUnit | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [scope, setScope] = useState<CohortScope>("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sentFriendRequestIds, setSentFriendRequestIds] = useState<string[]>(
    [],
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [requestUnitError, setRequestUnitError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const refreshRemote = useCallback(
    async (supabase: SupabaseClient) => {
      const [units, groups] = await Promise.all([
        userId
          ? dedupeRemoteRequest({
              key: "units",
              load: () => fetchRemoteUnitState(supabase),
              userId,
            })
          : fetchRemoteUnitState(supabase),
        userId
          ? dedupeRemoteRequest({
              key: "study-groups",
              load: () => fetchRemoteStudyGroups(supabase),
              userId,
            })
          : fetchRemoteStudyGroups(supabase),
      ]);

      if (units) {
        setUnitState(units);
        if (userId) cacheRemoteUnitState(units, userId);
      }
      setSocialState({ friends: [], groups });
    },
    [userId],
  );

  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;
    let supabase: SupabaseClient;
    const cachedUnits = getCachedRemoteUnitState(userId);

    if (cachedUnits) {
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setUnitState(cachedUnits);
        setDataMode("remote");
      });
    }

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
          setUnitState({
            enrollments: [],
            specialUnits: [],
            subjects: [],
            suggestions: [],
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isActive, refreshRemote, userId]);

  useEffect(() => {
    if (!isActive || !remoteClient || dataMode !== "remote") return;

    return subscribeToRemoteTableChanges((table) => {
      if (UNIT_CHANGE_TABLES.has(table)) void refreshRemote(remoteClient);
    });
  }, [dataMode, isActive, refreshRemote, remoteClient]);

  const selectedEnrollment = unitState.enrollments.find(
    (enrollment) => enrollment.offeringId === selectedOfferingId,
  );
  useAppHeaderDetail("/app/units", null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const isRemoteCohort = Boolean(remoteClient) && dataMode !== "demo";

  // The class list loads from the database a page at a time; search and the
  // All/Friends filter run there too.
  useEffect(() => {
    if (!isActive || !selectedOfferingId) {
      return;
    }

    if (!remoteClient || dataMode === "demo") {
      void Promise.resolve().then(() =>
        setCohort(getDemoCohort(selectedOfferingId, socialState.groups)),
      );
      return;
    }

    let cancelled = false;
    const requestId = ++cohortRequestRef.current;
    void Promise.resolve().then(() => {
      if (!cancelled) setCohortLoading(true);
    });

    void fetchRemoteUnitCohortPage({
      friendsOnly: scope === "friends",
      offeringId: selectedOfferingId,
      offset: 0,
      query: debouncedSearch,
      supabase: remoteClient,
    })
      .then((page) => {
        if (cancelled || requestId !== cohortRequestRef.current) return;
        setCohort(page.members);
        setCohortHasMore(page.hasMore);
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
  }, [
    dataMode,
    debouncedSearch,
    isActive,
    remoteClient,
    scope,
    selectedOfferingId,
    socialState.groups,
  ]);

  async function loadMoreCohort() {
    if (
      !remoteClient ||
      !selectedOfferingId ||
      !cohortHasMore ||
      cohortLoading ||
      cohortLoadingMore
    ) {
      return;
    }

    const requestId = cohortRequestRef.current;
    setCohortLoadingMore(true);
    try {
      const page = await fetchRemoteUnitCohortPage({
        friendsOnly: scope === "friends",
        offeringId: selectedOfferingId,
        offset: cohort.length,
        query: debouncedSearch,
        supabase: remoteClient,
      });
      if (requestId !== cohortRequestRef.current) return;
      setCohort((current) => {
        const seen = new Set(current.map((member) => member.id));
        return [
          ...current,
          ...page.members.filter((member) => !seen.has(member.id)),
        ];
      });
      setCohortHasMore(page.hasMore);
    } catch {
      setFeedback("Could not load more students.");
    } finally {
      setCohortLoadingMore(false);
    }
  }

  const manageableGroups = socialState.groups;
  const filteredCohort = useMemo(() => {
    if (isRemoteCohort) return cohort;

    const query = search.trim().toLowerCase();

    return cohort
      .filter(
        (member) =>
          !query ||
          member.displayName.toLowerCase().includes(query) ||
          member.handle.toLowerCase().includes(query),
      )
      .filter((member) => (scope === "friends" ? member.isFriend : true))
      .sort(
        (first, second) =>
          Number(second.isFriend) - Number(first.isFriend) ||
          second.mutualFriendCount - first.mutualFriendCount ||
          first.displayName.localeCompare(second.displayName),
      );
  }, [cohort, isRemoteCohort, scope, search]);

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
        await upsertRemoteUnitEnrollment({
          ...input,
          supabase: remoteClient,
        });
        await refreshRemote(remoteClient);
      } else {
        const offeringId = `demo-${input.code}-${input.year}-${input.period}`;
        setUnitState((current) => ({
          ...current,
          suggestions: current.suggestions,
          enrollments: [
            ...current.enrollments.filter(
              (enrollment) => enrollment.offeringId !== offeringId,
            ),
            {
              ...input,
              joinedAt: new Date().toISOString(),
              memberCount: 1,
              offeringId,
              unitId: `demo-${input.code}`,
            },
          ],
        }));
      }

      setIsAdding(false);
      setSelectedSpecialUnit(null);
      setToastMessage("Unit added");
    } catch (error) {
      setFeedback(getErrorMessage(error, "Could not add that unit."));
    } finally {
      setBusyKey(null);
    }
  }

  async function requestSpecialUnit(input: {
    code: string | null;
    comment: string | null;
    name: string;
  }) {
    setBusyKey("request-unit");
    setRequestUnitError(null);

    try {
      if (remoteClient) {
        await requestRemoteSpecialUnit({
          ...input,
          supabase: remoteClient,
        });
      }

      setIsRequestingUnit(false);
      setToastMessage("Unit request sent");
    } catch (error) {
      setRequestUnitError(getUnitRequestError(error));
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
      setUnitFilter({ period: null, year: null });
      setToastMessage("Unit left");
    } catch (error) {
      setFeedback(getErrorMessage(error, "Could not leave this cohort."));
    } finally {
      setBusyKey(null);
    }
  }

  async function createSubjectForUnit(enrollment: UnitEnrollment) {
    const usedColors = new Set(
      unitState.subjects.map((subject) => subject.color.toUpperCase()),
    );
    const color =
      NEW_SUBJECT_COLORS.find((option) => !usedColors.has(option)) ??
      NEW_SUBJECT_COLORS[0];
    const name = enrollment.code;

    setBusyKey("link:new");
    setFeedback(null);

    try {
      if (remoteClient) {
        await createRemoteSubjectForUnit({
          color,
          name,
          offeringId: enrollment.offeringId,
          supabase: remoteClient,
        });
        await refreshRemote(remoteClient);
      } else {
        setUnitState((current) => ({
          ...current,
          subjects: [
            ...current.subjects,
            {
              canonicalCode: enrollment.code,
              color,
              id: crypto.randomUUID(),
              name,
              unitOfferingId: enrollment.offeringId,
            },
          ],
        }));
      }
      setToastMessage(`${name} subject created and linked`);
    } catch (error) {
      setFeedback(getErrorMessage(error, "Could not create that subject."));
    } finally {
      setBusyKey(null);
    }
  }

  async function linkSubject(subjectId: string, offeringId: string | null) {
    setBusyKey(`link:${subjectId}`);
    setFeedback(null);

    try {
      if (remoteClient) {
        await setRemoteSubjectUnitOffering({
          offeringId,
          subjectId,
          supabase: remoteClient,
        });
        await refreshRemote(remoteClient);
      } else {
        setUnitState((current) => ({
          ...current,
          subjects: current.subjects.map((subject) => {
            if (subject.id === subjectId) {
              return {
                ...subject,
                canonicalCode:
                  offeringId === null
                    ? undefined
                    : current.enrollments.find(
                        (enrollment) => enrollment.offeringId === offeringId,
                      )?.code,
                unitOfferingId: offeringId,
              };
            }

            if (offeringId && subject.unitOfferingId === offeringId) {
              return {
                ...subject,
                canonicalCode: undefined,
                unitOfferingId: null,
              };
            }

            return subject;
          }),
        }));
      }

      setToastMessage(
        offeringId ? "Study timer linked." : "Study timer unlinked.",
      );
    } catch (error) {
      setFeedback(
        getErrorMessage(error, "Could not update the study timer link."),
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function addFriend(memberId: string) {
    setBusyKey(`friend:${memberId}`);
    setFeedback(null);
    setSentFriendRequestIds((current) =>
      Array.from(new Set([...current, memberId])),
    );
    setToastMessage("Friend request sent");

    try {
      if (remoteClient) {
        await addRemoteFriend({ friendId: memberId, supabase: remoteClient });
      }
    } catch (error) {
      setSentFriendRequestIds((current) =>
        current.filter((id) => id !== memberId),
      );
      setToastMessage(null);
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
      setToastMessage("Group invite sent");
    } catch (error) {
      setFeedback(getErrorMessage(error, "Could not add them to that group."));
    } finally {
      setBusyKey(null);
    }
  }

  if (selectedEnrollment) {
    return (
      <>
        <OfferingDetail
          allGroups={socialState.groups}
          busyKey={busyKey}
          cohort={filteredCohort}
          cohortHasMore={isRemoteCohort && cohortHasMore}
          cohortLoading={cohortLoading}
          cohortLoadingMore={cohortLoadingMore}
          onLoadMoreCohort={() => void loadMoreCohort()}
          enrollment={selectedEnrollment}
          feedback={feedback}
          manageableGroups={manageableGroups}
          onAddFriend={(memberId) => void addFriend(memberId)}
          onAddToGroup={(memberId, groupId) =>
            void addToGroup(memberId, groupId)
          }
          onBack={() => {
            setSelectedOfferingId(null);
            setCohort([]);
            setCohortHasMore(false);
            setSearch("");
            setDebouncedSearch("");
            setScope("all");
          }}
          onLeave={() => void leaveEnrollment(selectedEnrollment)}
          onCreateSubject={() => void createSubjectForUnit(selectedEnrollment)}
          onLinkSubject={(subjectId, offeringId) =>
            void linkSubject(subjectId, offeringId)
          }
          onScopeChange={setScope}
          onSearchChange={setSearch}
          currentUserId={userId}
          remoteClient={dataMode === "remote" ? remoteClient : null}
          sentFriendRequestIds={sentFriendRequestIds}
          scope={scope}
          search={search}
          subjects={unitState.subjects}
        />
        <TransientToast
          message={toastMessage}
          onDismiss={() => setToastMessage(null)}
        />
      </>
    );
  }

  const filterYears = Array.from(
    new Set(unitState.enrollments.map((enrollment) => enrollment.year)),
  ).sort((first, second) => second - first);
  const filterPeriods = TEACHING_PERIODS.filter((period) =>
    unitState.enrollments.some((enrollment) => enrollment.period === period),
  );
  const effectiveUnitFilter: UnitEnrollmentFilter = {
    period:
      unitFilter.period !== null && filterPeriods.includes(unitFilter.period)
        ? unitFilter.period
        : null,
    year:
      unitFilter.year !== null && filterYears.includes(unitFilter.year)
        ? unitFilter.year
        : null,
  };
  const canFilter = filterYears.length > 1 || filterPeriods.length > 1;
  const activeFilterCount =
    Number(effectiveUnitFilter.year !== null) +
    Number(effectiveUnitFilter.period !== null);
  const visibleEnrollments = filterUnitEnrollments(
    unitState.enrollments,
    effectiveUnitFilter,
  );
  const current = visibleEnrollments
    .filter((enrollment) => !isPastUnitEnrollment(enrollment))
    .sort(compareUnitEnrollments);
  const past = visibleEnrollments
    .filter((enrollment) => isPastUnitEnrollment(enrollment))
    .sort((first, second) => compareUnitEnrollments(second, first));
  const hasEnrollments = unitState.enrollments.length > 0;
  const hasVisibleEnrollments = current.length > 0 || past.length > 0;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        {dataMode === "loading" ? (
          <UnitsLoadingState />
        ) : !hasEnrollments ? (
          <UnitsEmptyState
            onAdd={() => {
              setSelectedSpecialUnit(null);
              setIsAdding(true);
            }}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="hidden truncate text-lg font-semibold lg:block">
                  Your unit groups
                </h2>
                <UnitsHelpButton />
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {canFilter ? (
                  <button
                    aria-label="Filter units"
                    aria-pressed={activeFilterCount > 0}
                    className={cn(
                      "mac-focus inline-flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition",
                      activeFilterCount
                        ? "border-[rgb(255_227_48/0.46)] bg-[rgb(255_227_48/0.08)] text-[var(--color-mac-yellow)]"
                        : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[rgb(255_255_255/0.04)] hover:text-[var(--color-text)]",
                    )}
                    onClick={() => setIsFilterOpen(true)}
                    type="button"
                  >
                    <ListFilter aria-hidden size={17} />
                    <span>Filter</span>
                    {activeFilterCount ? (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-mac-yellow)] px-1 text-[11px] font-bold text-[#141414]">
                        {activeFilterCount}
                      </span>
                    ) : null}
                  </button>
                ) : null}
                <button
                  className="mac-focus inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414]"
                  onClick={() => {
                    setSelectedSpecialUnit(null);
                    setIsAdding(true);
                  }}
                  type="button"
                >
                  <Plus aria-hidden size={17} />
                  Add unit
                </button>
              </div>
            </div>

            {current.length ? (
              <TermGroupedEnrollments
                enrollments={current}
                onOpen={setSelectedOfferingId}
              />
            ) : null}

            {!hasVisibleEnrollments ? (
              <div className="flex min-h-20 flex-col items-start justify-center gap-2 rounded-md bg-[rgb(255_255_255/0.03)] px-4 py-3 text-sm text-[var(--color-text-muted)] sm:flex-row sm:items-center sm:justify-between">
                <p>No units match these filters.</p>
                <button
                  className="mac-focus h-9 rounded-md px-2.5 font-semibold text-[var(--color-mac-yellow)] transition hover:bg-[rgb(255_227_48/0.07)]"
                  onClick={() => setUnitFilter({ period: null, year: null })}
                  type="button"
                >
                  Clear filters
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {feedback ? <Feedback message={feedback} /> : null}

      {dataMode !== "loading" && past.length ? (
        <section className="space-y-4 border-t border-[rgb(255_255_255/0.08)] pt-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text-muted)]">
            <History aria-hidden size={18} />
            Past units
            <span className="text-sm font-medium">({past.length})</span>
          </h2>
          <TermGroupedEnrollments
            enrollments={past}
            muted
            onOpen={setSelectedOfferingId}
          />
        </section>
      ) : null}

      {isAdding ? (
        <AddUnitDialog
          initialSpecialUnit={selectedSpecialUnit}
          enrollments={unitState.enrollments}
          isSaving={busyKey === "add-unit"}
          onAdd={(input) => void addEnrollment(input)}
          onClose={() => {
            setIsAdding(false);
            setSelectedSpecialUnit(null);
          }}
          onOpenSpecialUnits={() => {
            setIsAdding(false);
            setIsSpecialUnitsOpen(true);
          }}
          specialUnits={unitState.specialUnits}
          suggestions={unitState.suggestions}
        />
      ) : null}
      {isFilterOpen ? (
        <UnitFilterDialog
          filter={effectiveUnitFilter}
          onApply={(filter) => {
            setUnitFilter(filter);
            setIsFilterOpen(false);
          }}
          onClose={() => setIsFilterOpen(false)}
          periods={filterPeriods}
          years={filterYears}
        />
      ) : null}
      {isSpecialUnitsOpen ? (
        <SpecialUnitsDialog
          onClose={() => setIsSpecialUnitsOpen(false)}
          onRequest={() => {
            setRequestUnitError(null);
            setIsSpecialUnitsOpen(false);
            setIsRequestingUnit(true);
          }}
          onSelect={(unit) => {
            setSelectedSpecialUnit(unit);
            setIsSpecialUnitsOpen(false);
            setIsAdding(true);
          }}
          units={unitState.specialUnits}
        />
      ) : null}
      {isRequestingUnit ? (
        <RequestUnitDialog
          error={requestUnitError}
          isSaving={busyKey === "request-unit"}
          onClose={() => {
            setIsRequestingUnit(false);
            setRequestUnitError(null);
            setIsSpecialUnitsOpen(true);
          }}
          onSubmit={(input) => void requestSpecialUnit(input)}
        />
      ) : null}
      <TransientToast
        message={toastMessage}
        onDismiss={() => setToastMessage(null)}
      />
    </div>
  );
}

function UnitsEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <EmptyStateCta
      action={
        <button
          className="mac-focus inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414] sm:w-auto"
          onClick={onAdd}
          type="button"
        >
          <Plus aria-hidden size={17} />
          Add your first unit
        </button>
      }
      description="Add the units you're taking to see who else is in them, then link each unit to a subject so your study time counts."
      mascot="min-artist"
      points={[
        { icon: UsersRound, label: "Find classmates" },
        { icon: Trophy, label: "Weekly leaderboard" },
        { icon: Link2, label: "Link to your timer" },
      ]}
      title="Find your classmates"
    />
  );
}

function UnitsLoadingState() {
  return (
    <div
      aria-label="Loading units"
      className="animate-pulse rounded-xl border border-[rgb(255_255_255/0.07)] bg-[var(--color-surface)] px-5 py-7 sm:px-8 sm:py-8"
      role="status"
    >
      <span className="block h-12 w-12 rounded-xl bg-[rgb(255_227_48/0.12)]" />
      <span className="mt-5 block h-7 w-52 rounded bg-[rgb(255_255_255/0.08)]" />
      <span className="mt-3 block h-4 w-full max-w-sm rounded bg-[rgb(255_255_255/0.055)]" />
      <span className="mt-6 block h-12 w-full rounded-lg bg-[rgb(255_227_48/0.1)] sm:w-44" />
      <span className="sr-only">Loading units…</span>
    </div>
  );
}

// One heading per teaching period (e.g. "Semester 1 2026"), in list order.
function groupEnrollmentsByTerm(enrollments: UnitEnrollment[]) {
  const groups: {
    enrollments: UnitEnrollment[];
    key: string;
    label: string;
  }[] = [];

  enrollments.forEach((enrollment) => {
    const key = `${enrollment.year}:${enrollment.period}`;
    const group = groups.find((item) => item.key === key);
    if (group) {
      group.enrollments.push(enrollment);
    } else {
      groups.push({
        enrollments: [enrollment],
        key,
        label: `${getTeachingPeriodLabel(enrollment.period)} ${enrollment.year}`,
      });
    }
  });

  return groups;
}

function UnitsHelpButton() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function close(event: PointerEvent | KeyboardEvent) {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !containerRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-controls="units-help"
        aria-expanded={isOpen}
        aria-label="How unit groups work"
        className={cn(
          "mac-focus inline-flex h-11 w-11 items-center justify-center rounded-md border transition lg:h-9 lg:w-9",
          isOpen
            ? "border-[rgb(255_227_48/0.46)] bg-[rgb(255_227_48/0.08)] text-[var(--color-mac-yellow)]"
            : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[rgb(255_255_255/0.04)] hover:text-[var(--color-text)]",
        )}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <CircleHelp aria-hidden size={17} />
      </button>
      {isOpen ? (
        <p
          className="absolute left-0 top-full z-20 mt-2 w-64 rounded-md border border-[rgb(255_255_255/0.1)] bg-[var(--color-surface)] px-3 py-2.5 text-sm leading-5 text-[var(--color-text)] shadow-[0_16px_34px_rgb(0_0_0/0.4)]"
          id="units-help"
          role="status"
        >
          Open a unit to find classmates in the same cohort.
        </p>
      ) : null}
    </div>
  );
}

function TermGroupedEnrollments({
  enrollments,
  muted = false,
  onOpen,
}: {
  enrollments: UnitEnrollment[];
  muted?: boolean;
  onOpen: (offeringId: string) => void;
}) {
  return (
    <div className="space-y-5">
      {groupEnrollmentsByTerm(enrollments).map((term) => (
        <section className="space-y-2.5" key={term.key}>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-muted)]">
            {term.label}
            <span className="h-px flex-1 bg-[rgb(255_255_255/0.07)]" />
          </h3>
          <PaginatedList
            className="grid gap-1.5 lg:grid-cols-2 lg:gap-2"
            items={term.enrollments}
            pageSize={10}
            renderItem={(enrollment) => (
              <button
                className={cn(
                  "mac-focus grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-[rgb(255_255_255/0.07)] bg-[rgb(255_255_255/0.035)] px-3 py-2.5 text-left transition hover:border-[rgb(255_227_48/0.35)] hover:bg-[rgb(255_255_255/0.05)]",
                  muted && "opacity-70 hover:opacity-100",
                )}
                key={enrollment.offeringId}
                onClick={() => onOpen(enrollment.offeringId)}
                type="button"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[rgb(255_227_48/0.12)] text-[var(--color-mac-yellow)]">
                  <BookOpen aria-hidden size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold leading-tight">
                    {enrollment.code}
                  </span>
                  {enrollment.nickname ? (
                    <span className="mt-0.5 block truncate text-sm text-[var(--color-text-muted)]">
                      {enrollment.nickname}
                    </span>
                  ) : null}
                </span>
                <span className="text-right text-xs font-semibold text-[var(--color-text-muted)]">
                  <span className="flex items-center justify-end gap-1 font-medium text-[var(--color-text-muted)]">
                    <UsersRound aria-hidden size={13} />
                    {getUnitMemberCountLabel(enrollment.memberCount)}
                  </span>
                </span>
              </button>
            )}
            resetKey={term.key}
          />
        </section>
      ))}
    </div>
  );
}

function UnitFilterDialog({
  filter,
  onApply,
  onClose,
  periods,
  years,
}: {
  filter: UnitEnrollmentFilter;
  onApply: (filter: UnitEnrollmentFilter) => void;
  onClose: () => void;
  periods: TeachingPeriod[];
  years: number[];
}) {
  const [year, setYear] = useState(
    filter.year === null ? ALL_UNIT_FILTER_VALUE : String(filter.year),
  );
  const [period, setPeriod] = useState(filter.period ?? ALL_UNIT_FILTER_VALUE);
  const nextFilter: UnitEnrollmentFilter = {
    period:
      period === ALL_UNIT_FILTER_VALUE ? null : (period as TeachingPeriod),
    year: year === ALL_UNIT_FILTER_VALUE ? null : Number(year),
  };
  const isDirty =
    nextFilter.year !== filter.year || nextFilter.period !== filter.period;

  return (
    <AppDialog
      bodyClassName="space-y-5"
      closeLabel="Close unit filters"
      confirmDiscard={false}
      footer={
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <button
            className="mac-focus h-11 rounded-md border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.04)] hover:text-[var(--color-text)]"
            onClick={() => onApply({ period: null, year: null })}
            type="button"
          >
            Reset
          </button>
          <button
            className="mac-focus h-11 rounded-md bg-[var(--color-mac-yellow)] text-sm font-semibold text-[#141414]"
            onClick={() => onApply(nextFilter)}
            type="button"
          >
            Show units
          </button>
        </div>
      }
      isDirty={isDirty}
      maxWidthClassName="max-w-md"
      onClose={onClose}
      title="Filter units"
    >
      {years.length > 1 ? (
        <div className="text-sm font-medium">
          <p className="mb-2">Year</p>
          <CustomSelect
            ariaLabel="Filter units by year"
            onChange={setYear}
            options={[
              { label: "All years", value: ALL_UNIT_FILTER_VALUE },
              ...years.map((optionYear) => ({
                label: String(optionYear),
                value: String(optionYear),
              })),
            ]}
            value={year}
          />
        </div>
      ) : null}

      {periods.length > 1 ? (
        <div className="text-sm font-medium">
          <p className="mb-2">Teaching period</p>
          <CustomSelect
            ariaLabel="Filter units by teaching period"
            onChange={setPeriod}
            options={[
              { label: "All teaching periods", value: ALL_UNIT_FILTER_VALUE },
              ...periods.map((optionPeriod) => ({
                label: getTeachingPeriodLabel(optionPeriod),
                value: optionPeriod,
              })),
            ]}
            value={period}
          />
        </div>
      ) : null}
    </AppDialog>
  );
}

function OfferingDetail({
  allGroups,
  busyKey,
  cohort,
  cohortHasMore,
  cohortLoading,
  cohortLoadingMore,
  currentUserId,
  enrollment,
  feedback,
  manageableGroups,
  onAddFriend,
  onAddToGroup,
  onBack,
  onCreateSubject,
  onLeave,
  onLinkSubject,
  onLoadMoreCohort,
  onScopeChange,
  onSearchChange,
  remoteClient,
  scope,
  search,
  sentFriendRequestIds,
  subjects,
}: {
  allGroups: SocialGroup[];
  busyKey: string | null;
  cohort: UnitCohortMember[];
  cohortHasMore: boolean;
  cohortLoading: boolean;
  cohortLoadingMore: boolean;
  currentUserId: string | null;
  enrollment: UnitEnrollment;
  feedback: string | null;
  manageableGroups: SocialGroup[];
  onAddFriend: (memberId: string) => void;
  onAddToGroup: (memberId: string, groupId: string) => void;
  onBack: () => void;
  onCreateSubject: () => void;
  onLeave: () => void;
  onLinkSubject: (subjectId: string, offeringId: string | null) => void;
  onLoadMoreCohort: () => void;
  onScopeChange: (scope: CohortScope) => void;
  onSearchChange: (value: string) => void;
  remoteClient: SupabaseClient | null;
  scope: CohortScope;
  search: string;
  sentFriendRequestIds: string[];
  subjects: RemoteUnitState["subjects"];
}) {
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);

  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const leaderboard = useUnitWeeklyLeaderboard(
    enrollment.offeringId,
    remoteClient,
  );
  const myWeekSeconds =
    leaderboard?.find((entry) => entry.id === currentUserId)?.weekSeconds ?? 0;
  const linkedSubject =
    subjects.find(
      (subject) => subject.unitOfferingId === enrollment.offeringId,
    ) ?? null;
  const unitMeta = `${enrollment.year} · ${getTeachingPeriodShortLabel(enrollment.period)} · ${getUnitMemberCountLabel(enrollment.memberCount)}`;
  const scopeTabs = (
    <div className="inline-flex rounded-full bg-[rgb(255_255_255/0.06)] p-[3px]">
      {(["all", "friends"] as const).map((item) => (
        <button
          aria-pressed={scope === item}
          className={cn(
            "mac-focus h-8 rounded-full px-3.5 text-[13px] font-semibold transition",
            scope === item
              ? "bg-[rgb(255_255_255/0.14)] text-[var(--color-text)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
          )}
          key={item}
          onClick={() => onScopeChange(item)}
          type="button"
        >
          {item === "all" ? "All" : "Friends"}
        </button>
      ))}
    </div>
  );
  const leaveButton = (
    <button
      className="mac-focus -ml-2 inline-flex h-9 items-center gap-2 rounded-lg px-2 text-[13px] font-semibold text-[var(--color-danger)] transition hover:bg-[rgb(255_107_107/0.08)] disabled:opacity-45"
      disabled={busyKey === `leave:${enrollment.offeringId}`}
      onClick={() => setIsLeaveDialogOpen(true)}
      type="button"
    >
      <LogOut aria-hidden size={15} />
      Leave unit
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Mobile: one header carries the code, period and class size. */}
      <div className="-mx-2 flex items-center gap-1 lg:hidden">
        <button
          aria-label="Back to units"
          className="mac-focus inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-[var(--color-text)] transition hover:bg-[rgb(255_255_255/0.06)]"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft aria-hidden size={20} />
        </button>
        <div className="min-w-0 flex-1 pl-1">
          <h2 className="truncate text-[22px] font-bold leading-[1.1] tracking-[-0.02em]">
            {enrollment.code}
          </h2>
          <p className="mt-0.5 truncate text-[13px] text-[var(--color-text-muted)]">
            {unitMeta}
          </p>
        </div>
        <button
          aria-expanded={isMobileSearchOpen || Boolean(search)}
          aria-label="Search students"
          className="mac-focus inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-[var(--color-text)] transition hover:bg-[rgb(255_255_255/0.06)]"
          onClick={() => {
            if (isMobileSearchOpen && search) onSearchChange("");
            setIsMobileSearchOpen((current) => !current);
          }}
          type="button"
        >
          <Search aria-hidden size={20} />
        </button>
        <button
          aria-haspopup="dialog"
          aria-label="More options"
          className="mac-focus inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-[var(--color-text)] transition hover:bg-[rgb(255_255_255/0.06)]"
          onClick={() => setIsActionSheetOpen(true)}
          type="button"
        >
          <Ellipsis aria-hidden size={20} />
        </button>
      </div>

      {isMobileSearchOpen || search ? (
        <label className="flex h-11 items-center gap-2.5 rounded-[10px] bg-[rgb(255_255_255/0.06)] px-3 text-[var(--color-text-muted)] lg:hidden">
          <Search aria-hidden size={16} />
          <input
            aria-label="Search people in this unit"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search students"
            type="search"
            value={search}
          />
        </label>
      ) : null}

      {/* Mobile: one prompt to link a subject, a slim row once linked. */}
      <div className="lg:hidden">
        {linkedSubject ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-[rgb(255_255_255/0.045)] px-3.5 py-3">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor:
                  linkedSubject.color ?? "var(--color-mac-yellow)",
              }}
            />
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="text-[var(--color-text-muted)]">Counting </span>
              <b className="font-semibold">{linkedSubject.name}</b>
            </span>
            <span className="shrink-0 text-[13px] text-[var(--color-text-muted)]">
              {formatStudyDuration(myWeekSeconds)} this week
            </span>
          </div>
        ) : (
          <div className="relative rounded-[14px] bg-[var(--color-mac-yellow)] py-4 pl-4 pr-[108px] text-[#141414]">
            <span
              aria-hidden
              className="absolute right-3 top-1/2 flex h-[84px] w-[84px] -translate-y-1/2 items-end justify-center overflow-hidden rounded-full bg-[#141414]"
            >
              <Image
                alt=""
                className="-mb-1.5 h-20 w-20 object-contain"
                height={80}
                src={getMascotSrc("max-arms-up-happy")}
                width={80}
              />
            </span>
            <p className="text-base font-bold leading-tight">
              Count your study towards {enrollment.code}
            </p>
            <p className="mt-1 text-[13px] leading-snug">
              Link a timer subject to appear on this week&apos;s board.
            </p>
            <button
              className="mac-focus mt-3 inline-flex h-10 items-center whitespace-nowrap rounded-full bg-[#141414] px-4 text-sm font-semibold text-[var(--color-mac-yellow)]"
              onClick={() => setIsLinkDialogOpen(true)}
              type="button"
            >
              Link a subject
            </button>
          </div>
        )}
      </div>

      <div className="hidden items-center gap-2 text-[13px] font-semibold text-[var(--color-text-muted)] lg:flex">
        <button
          aria-label="Back to units"
          className="mac-focus -ml-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-text)] transition hover:bg-[rgb(255_255_255/0.06)]"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft aria-hidden size={18} />
        </button>
        Units
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-7">
        <aside className="hidden flex-col gap-11 lg:flex">
          <section className="rounded-xl border border-[rgb(255_227_48/0.24)] bg-[#1d1c16] px-4 pb-1 pt-4 lg:px-5 lg:pb-4 lg:pt-5">
            <span className="inline-flex h-6 items-center rounded-full bg-[rgb(255_255_255/0.06)] px-2.5 text-xs font-semibold text-[#cfcfc6]">
              {enrollment.year} ·{" "}
              {getTeachingPeriodShortLabel(enrollment.period)}
            </span>
            <h2 className="mt-3 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] lg:text-[32px]">
              {enrollment.code}
            </h2>
            <p className="mb-4 mt-1 text-sm text-[var(--color-text-muted)]">
              {enrollment.nickname ? `${enrollment.nickname} · ` : ""}
              {getUnitMemberCountLabel(enrollment.memberCount)}
            </p>
            <div className="flex items-center gap-3 border-t border-[#2a2a26] py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgb(255_227_48/0.11)] text-[var(--color-mac-yellow)]">
                <Timer aria-hidden size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {linkedSubject ? "Linked to timer" : "Link to timer"}
                </span>
                <span className="block text-xs leading-4 text-[var(--color-text-muted)]">
                  {linkedSubject
                    ? `Time on your ${linkedSubject.name} subject counts here.`
                    : `Pick a subject to count towards ${enrollment.code}.`}
                </span>
              </div>
              {linkedSubject ? (
                <button
                  className="mac-focus inline-flex h-9 shrink-0 items-center rounded-lg border border-[var(--color-border)] px-3 text-[13px] font-semibold text-[var(--color-text)] transition hover:bg-[rgb(255_255_255/0.04)]"
                  onClick={() => setIsLinkDialogOpen(true)}
                  type="button"
                >
                  Change
                </button>
              ) : (
                <button
                  className="mac-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-mac-yellow)] px-3 text-[13px] font-semibold text-[#141414] transition hover:brightness-105 active:scale-[0.98]"
                  onClick={() => setIsLinkDialogOpen(true)}
                  type="button"
                >
                  <Link2 aria-hidden size={15} />
                  Link
                </button>
              )}
            </div>
            <div className="hidden border-t border-[#2a2a26] pt-3.5 lg:block">
              {leaveButton}
            </div>
          </section>

          <UnitWeeklyLeaderboard
            code={enrollment.code}
            currentUserId={currentUserId}
            entries={leaderboard}
            isRemote={Boolean(remoteClient)}
          />
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="hidden gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <label className="flex h-10 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 transition focus-within:border-[rgb(255_227_48/0.6)]">
              <Search
                aria-hidden
                className="text-[var(--color-text-muted)]"
                size={16}
              />
              <input
                aria-label="Search people in this unit"
                className="mac-focus min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-text-muted)]"
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search students"
                type="search"
                value={search}
              />
            </label>
            <div className="flex items-center gap-5 border-b border-[var(--color-border)] lg:border-0">
              {(["all", "friends"] as const).map((item) => (
                <button
                  className={cn(
                    "mac-focus relative h-10 shrink-0 px-0.5 text-sm font-medium capitalize transition",
                    scope === item
                      ? "font-semibold text-[var(--color-mac-yellow)] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--color-mac-yellow)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
                  )}
                  key={item}
                  onClick={() => onScopeChange(item)}
                  type="button"
                >
                  {item === "all" ? "All" : item}
                </button>
              ))}
            </div>
          </div>

          {feedback ? <Feedback message={feedback} /> : null}

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 pt-2 lg:hidden">
              <h3 className="text-[17px] font-semibold">Students</h3>
              {scopeTabs}
            </div>
            <div className="hidden items-center justify-between gap-3 lg:flex">
              <h3 className="text-base font-semibold">Students</h3>
              <span className="text-xs text-[var(--color-text-muted)]">
                {getUnitMemberCountLabel(enrollment.memberCount)}
              </span>
            </div>
            {cohortLoading ? (
              <ListSkeleton
                avatar
                className="grid gap-2 lg:grid-cols-2 lg:gap-x-6"
                count={4}
                label="Loading cohort"
              />
            ) : cohort.length ? (
              <div>
                <div className="grid lg:grid-cols-2 lg:gap-x-6">
                  {cohort.map((member) => (
                    <CohortMemberCard
                      allGroups={allGroups}
                      busyKey={busyKey}
                      key={member.id}
                      manageableGroups={manageableGroups}
                      member={member}
                      onAddFriend={onAddFriend}
                      onAddToGroup={onAddToGroup}
                      requested={sentFriendRequestIds.includes(member.id)}
                    />
                  ))}
                </div>
                <InfiniteScrollSentinel
                  hasMore={cohortHasMore}
                  isLoading={cohortLoadingMore}
                  onLoadMore={onLoadMoreCohort}
                />
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
                No students found.
              </p>
            )}
          </section>
        </div>
      </div>

      {isActionSheetOpen ? (
        <ActionSheet onClose={() => setIsActionSheetOpen(false)}>
          <button
            className="mac-focus flex h-[52px] w-full items-center gap-3 rounded-[10px] px-3 text-[15px] font-semibold text-[var(--color-text)] transition hover:bg-[rgb(255_255_255/0.05)]"
            onClick={() => {
              setIsActionSheetOpen(false);
              setIsLinkDialogOpen(true);
            }}
            type="button"
          >
            <Timer aria-hidden size={18} />
            {linkedSubject ? "Change linked subject" : "Link a subject"}
          </button>
          <button
            className="mac-focus flex h-[52px] w-full items-center gap-3 rounded-[10px] px-3 text-[15px] font-semibold text-[var(--color-danger)] transition hover:bg-[rgb(255_107_107/0.08)] disabled:opacity-45"
            disabled={busyKey === `leave:${enrollment.offeringId}`}
            onClick={() => {
              setIsActionSheetOpen(false);
              setIsLeaveDialogOpen(true);
            }}
            type="button"
          >
            <LogOut aria-hidden size={18} />
            Leave unit
          </button>
        </ActionSheet>
      ) : null}

      {isLinkDialogOpen ? (
        <StudyTimerLinkDialog
          busyKey={busyKey}
          enrollment={enrollment}
          onClose={() => setIsLinkDialogOpen(false)}
          onCreateSubject={onCreateSubject}
          onLinkSubject={onLinkSubject}
          subjects={subjects}
        />
      ) : null}

      {isLeaveDialogOpen ? (
        <LeaveUnitDialog
          busy={busyKey === `leave:${enrollment.offeringId}`}
          enrollment={enrollment}
          onClose={() => setIsLeaveDialogOpen(false)}
          onConfirm={() => {
            setIsLeaveDialogOpen(false);
            onLeave();
          }}
        />
      ) : null}
    </div>
  );
}

const LEADERBOARD_TABLES = new Set([
  "study_sessions",
  "subjects",
  "unit_enrolments",
]);

// One request feeds both the desktop board and the mobile "Counting" row.
function useUnitWeeklyLeaderboard(
  offeringId: string,
  remoteClient: SupabaseClient | null,
) {
  const [entries, setEntries] = useState<UnitLeaderboardEntry[] | null>(null);

  useEffect(() => {
    if (!remoteClient) return;

    let cancelled = false;
    const load = () =>
      fetchRemoteUnitWeeklyLeaderboard({ offeringId, supabase: remoteClient })
        .then((rows) => {
          if (!cancelled) setEntries(rows);
        })
        .catch(() => {
          if (!cancelled) setEntries([]);
        });

    void load();
    const unsubscribe = subscribeToRemoteTableChanges((table) => {
      if (LEADERBOARD_TABLES.has(table)) void load();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [offeringId, remoteClient]);

  return entries;
}

function UnitWeeklyLeaderboard({
  code,
  currentUserId,
  entries,
  isRemote,
}: {
  code: string;
  currentUserId: string | null;
  entries: UnitLeaderboardEntry[] | null;
  isRemote: boolean;
}) {
  const ranked = (entries ?? []).filter((entry) => entry.weekSeconds > 0);
  const topSeconds = ranked[0]?.weekSeconds ?? 0;
  const myIndex = ranked.findIndex((entry) => entry.id === currentUserId);
  // Desktop shows the top 5, swapping 5th for you when you're further down.
  const desktopRows =
    myIndex >= 5
      ? [
          ...ranked
            .slice(0, 4)
            .map((entry, index) => ({ entry, rank: index + 1 })),
          { entry: ranked[myIndex], rank: myIndex + 1 },
        ]
      : ranked.slice(0, 5).map((entry, index) => ({ entry, rank: index + 1 }));
  const isLoading = isRemote && entries === null;

  return (
    <section className="relative rounded-[10px] border border-[#2a2a26] bg-[rgb(255_255_255/0.015)] p-4">
      <Image
        alt=""
        className="pointer-events-none absolute -top-10 right-1.5 h-[76px] w-[76px] object-contain"
        height={76}
        src={getMascotSrc(ranked.length ? "max-arms-up" : "max-arms-down")}
        width={76}
      />
      <h3 className="pr-20 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--color-mac-yellow)]">
        This week in {code}
      </h3>
      {isLoading ? (
        <SkeletonGroup
          className="mt-3.5 grid gap-3"
          label="Loading leaderboard"
        >
          {[0, 1, 2].map((index) => (
            <Skeleton className="h-7 w-full" key={index} />
          ))}
        </SkeletonGroup>
      ) : ranked.length ? (
        <ol className="mt-3.5 grid gap-3">
          {desktopRows.map(({ entry, rank }, index) => {
            const isYou = entry.id === currentUserId;

            return (
              <li
                className={cn(
                  "grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2.5",
                  // Mobile keeps it short: top 3 only.
                  index >= 3 && "hidden lg:grid",
                )}
                key={entry.id}
              >
                <span className="text-xs font-bold tabular-nums text-[var(--color-text-muted)]">
                  {rank}
                </span>
                <div className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-[13px] font-semibold",
                      isYou
                        ? "text-[var(--color-mac-yellow)]"
                        : "text-[var(--color-text)]",
                    )}
                  >
                    {entry.name}
                  </span>
                  <span className="mt-1.5 block h-1 rounded-full bg-[rgb(255_255_255/0.07)]">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        isYou
                          ? "bg-[var(--color-mac-yellow)]"
                          : "bg-[rgb(255_255_255/0.28)]",
                      )}
                      style={{
                        width: `${Math.max(4, (entry.weekSeconds / (topSeconds || 1)) * 100)}%`,
                      }}
                    />
                  </span>
                </div>
                <span className="font-mono text-xs font-semibold tabular-nums text-[var(--color-text-muted)]">
                  {formatStudyDuration(entry.weekSeconds)}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 pr-16 text-[13px] leading-5 text-[var(--color-text-muted)]">
          No study logged for {code} yet this week. Link a subject and start a
          session to lead the board.
        </p>
      )}
    </section>
  );
}

// Mobile bottom sheet for secondary actions.
function ActionSheet({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/55 lg:hidden"
      onClick={onClose}
    >
      <div
        aria-label="Unit options"
        aria-modal
        className="w-full rounded-t-[18px] bg-[#222] px-3 pb-[calc(var(--safe-area-bottom)+1.75rem)] pt-2"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <span
          aria-hidden
          className="mx-auto mb-3 mt-1 block h-1 w-9 rounded-full bg-[rgb(255_255_255/0.2)]"
        />
        {children}
      </div>
    </div>
  );
}

function formatStudyDuration(seconds: number) {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function StudyTimerLinkDialog({
  busyKey,
  enrollment,
  onClose,
  onCreateSubject,
  onLinkSubject,
  subjects,
}: {
  busyKey: string | null;
  enrollment: UnitEnrollment;
  onClose: () => void;
  onCreateSubject: () => void;
  onLinkSubject: (subjectId: string, offeringId: string | null) => void;
  subjects: RemoteUnitState["subjects"];
}) {
  const linkedSubject =
    subjects.find(
      (subject) => subject.unitOfferingId === enrollment.offeringId,
    ) ?? null;
  const availableSubjects = subjects.filter(
    (subject) => !subject.unitOfferingId || subject.id === linkedSubject?.id,
  );
  const initialSubjectId = linkedSubject?.id ?? UNLINKED_SUBJECT_VALUE;
  const [selectedSubjectId, setSelectedSubjectId] = useState(initialSubjectId);
  const isBusy = Boolean(busyKey?.startsWith("link:"));
  const isDirty = selectedSubjectId !== initialSubjectId;

  function saveLink() {
    if (!isDirty) return;

    if (selectedSubjectId === CREATE_SUBJECT_VALUE) {
      onCreateSubject();
    } else if (selectedSubjectId === UNLINKED_SUBJECT_VALUE) {
      if (linkedSubject) onLinkSubject(linkedSubject.id, null);
    } else {
      onLinkSubject(selectedSubjectId, enrollment.offeringId);
    }

    onClose();
  }

  return (
    <AppDialog
      bodyClassName="space-y-4"
      closeLabel="Close study timer link"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            className="mac-focus h-11 rounded-lg border border-[var(--color-border)] text-sm font-semibold"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="mac-focus h-11 rounded-lg bg-[var(--color-mac-yellow)] text-sm font-semibold text-[#141414] disabled:opacity-45"
            disabled={!isDirty || isBusy}
            onClick={saveLink}
            type="button"
          >
            {selectedSubjectId === CREATE_SUBJECT_VALUE
              ? "Create and link"
              : "Save link"}
          </button>
        </div>
      }
      isDirty={isDirty}
      maxWidthClassName="max-w-md"
      onClose={onClose}
      title="Study timer link"
    >
      <div>
        <p className="mb-2 text-sm font-medium">Study subject</p>
        <CustomSelect
          ariaLabel={`Study subject linked to ${enrollment.code}`}
          disabled={isBusy}
          onChange={setSelectedSubjectId}
          options={[
            {
              label: "Not linked",
              value: UNLINKED_SUBJECT_VALUE,
            },
            ...availableSubjects.map((subject) => ({
              label: subject.name,
              value: subject.id,
            })),
            {
              label: `+ Create "${enrollment.code}" subject for me`,
              value: CREATE_SUBJECT_VALUE,
            },
          ]}
          value={selectedSubjectId}
        />
        {selectedSubjectId === CREATE_SUBJECT_VALUE ? (
          <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
            Adds a {enrollment.code} subject to your timer on Home and links it
            here, so time you study on it counts towards this unit.
          </p>
        ) : null}
      </div>
    </AppDialog>
  );
}

function LeaveUnitDialog({
  busy,
  enrollment,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  enrollment: UnitEnrollment;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AppDialog
      closeLabel="Close leave unit confirmation"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            className="mac-focus h-11 rounded-md border border-[var(--color-border)] text-sm font-semibold"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="mac-focus h-11 rounded-md border border-[rgb(255_107_107/0.45)] text-sm font-semibold text-[var(--color-danger)] disabled:opacity-45"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            Leave unit
          </button>
        </div>
      }
      maxWidthClassName="max-w-md"
      onClose={onClose}
      title={`Leave ${enrollment.code}?`}
      variant="confirmation"
    />
  );
}

function CohortMemberCard({
  allGroups,
  busyKey,
  manageableGroups,
  member,
  onAddFriend,
  onAddToGroup,
  requested,
}: {
  allGroups: SocialGroup[];
  busyKey: string | null;
  manageableGroups: SocialGroup[];
  member: UnitCohortMember;
  onAddFriend: (memberId: string) => void;
  onAddToGroup: (memberId: string, groupId: string) => void;
  requested: boolean;
}) {
  const availableGroups = manageableGroups.filter(
    (group) => !member.sharedGroupIds.includes(group.id),
  );
  const isOutgoing = requested || member.friendRequest === "outgoing";
  const isIncoming = !isOutgoing && member.friendRequest === "incoming";
  const isPending = isOutgoing || isIncoming;
  const sharedGroupNames = member.sharedGroupIds
    .map((groupId) => allGroups.find((group) => group.id === groupId)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <article className="grid min-h-14 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-[rgb(255_255_255/0.08)] py-2.5">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-[#141414]"
        style={{ backgroundColor: member.color }}
      >
        {getInitials(member.displayName)}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <p className="min-w-0 break-words text-sm font-semibold">
            {member.displayName}
          </p>
          {member.isFriend ? (
            <span
              aria-label="Friend"
              className="shrink-0 text-[var(--color-success)]"
              title="Friend"
            >
              <Check aria-hidden size={13} />
            </span>
          ) : null}
        </div>
        <p className="flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-[var(--color-text-muted)]">
          <span className="break-words">{member.handle}</span>
          {member.mutualFriendCount ? (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0">
                {member.mutualFriendCount} mutual
              </span>
            </>
          ) : null}
          {sharedGroupNames.length ? (
            <>
              <span aria-hidden>·</span>
              <span className="break-words">{sharedGroupNames.join(", ")}</span>
            </>
          ) : null}
        </p>
      </div>
      {!member.isFriend ? (
        <button
          className={cn(
            "mac-focus inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold disabled:opacity-60",
            isPending
              ? "border border-[var(--color-border)] text-[var(--color-text-muted)]"
              : "bg-[var(--color-mac-yellow)] text-[#141414]",
          )}
          disabled={isPending || busyKey === `friend:${member.id}`}
          onClick={() => onAddFriend(member.id)}
          type="button"
        >
          <UserPlus aria-hidden size={13} />
          {isOutgoing ? "Requested" : isIncoming ? "Requested you" : "Request"}
        </button>
      ) : availableGroups.length ? (
        <CustomSelect
          ariaLabel={`Add ${member.displayName} to a group`}
          className="w-[7.75rem] shrink-0"
          disabled={busyKey === `group:${member.id}`}
          onChange={(groupId) => onAddToGroup(member.id, groupId)}
          options={availableGroups.map((group) => ({
            label: group.name,
            value: group.id,
          }))}
          placement="top"
          placeholder="Add to group"
          size="compact"
          value={null}
        />
      ) : (
        <span
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap text-[11px] font-medium",
            manageableGroups.length
              ? "text-[var(--color-success)]"
              : "text-[var(--color-text-muted)]",
          )}
        >
          {manageableGroups.length ? (
            <>
              <Check aria-hidden size={12} /> In your groups
            </>
          ) : (
            "No groups to add"
          )}
        </span>
      )}
    </article>
  );
}

function AddUnitDialog({
  enrollments,
  initialSpecialUnit,
  isSaving,
  onAdd,
  onClose,
  onOpenSpecialUnits,
  specialUnits,
  suggestions,
}: {
  enrollments: UnitEnrollment[];
  initialSpecialUnit: SpecialUnit | null;
  isSaving: boolean;
  onAdd: (input: {
    code: string;
    nickname: string | null;
    period: TeachingPeriod;
    year: number;
  }) => void;
  onClose: () => void;
  onOpenSpecialUnits: () => void;
  specialUnits: SpecialUnit[];
  suggestions: RemoteUnitState["suggestions"];
}) {
  const years = getUnitYearOptions();
  const initialCode = initialSpecialUnit?.code ?? "";
  const initialNickname = initialSpecialUnit?.name ?? "";
  const [codeInput, setCodeInput] = useState(initialCode);
  const [nickname, setNickname] = useState(initialNickname);
  const [initialYear] = useState(() => new Date().getFullYear());
  const [initialPeriod] = useState<TeachingPeriod>(() =>
    getDefaultTeachingPeriod(),
  );
  const [year, setYear] = useState(initialYear);
  const [period, setPeriod] = useState<TeachingPeriod>(initialPeriod);
  const normalizedCode = normalizeUnitCode(codeInput);
  const aliasSpecialUnit = findSpecialUnitByAlias(specialUnits, normalizedCode);
  const valid = isValidUnitCode(
    codeInput,
    specialUnits.map((unit) => unit.code),
  );
  const isDirty = Boolean(
    codeInput.trim() !== initialCode ||
    nickname.trim() !== initialNickname ||
    year !== initialYear ||
    period !== initialPeriod,
  );
  const offeringOptions = years.flatMap((optionYear) =>
    TEACHING_PERIODS.map((optionPeriod) => ({
      label: `${optionYear} · ${getTeachingPeriodLabel(optionPeriod)}`,
      period: optionPeriod,
      value: `${optionYear}:${optionPeriod}`,
      year: optionYear,
    })),
  );
  const offeringValue = `${year}:${period}`;
  const periodFull = isUnitPeriodFull(enrollments, {
    code: normalizedCode,
    period,
    year,
  });

  function updateCode(value: string) {
    const nextCode = normalizeUnitCode(value);
    const previousSpecialUnit = specialUnits.find(
      (unit) => unit.code === normalizedCode,
    );
    const nextSpecialUnit = specialUnits.find((unit) => unit.code === nextCode);
    const suggestion = suggestions.find((item) => item.code === nextCode);

    setCodeInput(value.toUpperCase());

    if (nextSpecialUnit) {
      setNickname(nextSpecialUnit.name);
    } else if (
      previousSpecialUnit &&
      nickname.trim() === previousSpecialUnit.name
    ) {
      setNickname(suggestion?.nickname ?? "");
    } else if (suggestion?.nickname && !nickname.trim()) {
      setNickname(suggestion.nickname);
    }
  }

  return (
    <AppDialog
      bodyClassName="space-y-5"
      closeLabel="Close add unit"
      footer={
        <button
          className="mac-focus inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414] disabled:opacity-45"
          disabled={!valid || isSaving || periodFull}
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
          {isSaving ? (
            <LoaderCircle aria-hidden className="animate-spin" size={17} />
          ) : (
            <Plus aria-hidden size={17} />
          )}
          {isSaving ? "Adding…" : "Add unit"}
        </button>
      }
      isDirty={isDirty}
      maxWidthClassName="max-w-lg"
      onClose={onClose}
      title="Add a unit"
    >
      <div className="flex gap-2.5 rounded-xl border border-[rgb(108_182_255/0.18)] bg-[rgb(108_182_255/0.08)] p-3 text-sm text-[var(--color-info)]">
        <Info aria-hidden className="mt-0.5 shrink-0" size={17} />
        <p>Adding a unit joins its cohort only. Link a study timer later.</p>
      </div>

      <UnitCodeInput
        invalid={Boolean(codeInput && !valid)}
        onChange={updateCode}
        suggestions={suggestions}
        value={codeInput}
      />

      {aliasSpecialUnit ? (
        <div className="flex items-center gap-2.5 rounded-md border border-[rgb(255_227_48/0.28)] bg-[rgb(255_227_48/0.07)] p-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[rgb(255_227_48/0.14)] text-[var(--color-mac-yellow)]">
            <BriefcaseBusiness aria-hidden size={14} />
          </span>
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-mono font-semibold">{normalizedCode}</span>
            <span className="text-[var(--color-text-muted)]">
              {" "}
              is part of {aliasSpecialUnit.name}.
            </span>
          </p>
          <button
            className="mac-focus h-9 shrink-0 rounded-md bg-[var(--color-mac-yellow)] px-3 text-xs font-semibold text-[#141414]"
            onClick={() => {
              setCodeInput(aliasSpecialUnit.code);
              setNickname(aliasSpecialUnit.name);
            }}
            type="button"
          >
            Join {aliasSpecialUnit.code}
          </button>
        </div>
      ) : null}

      <label className="block text-sm font-medium">
        Nickname{" "}
        <span className="text-[var(--color-text-muted)]">(optional)</span>
        <input
          className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
          maxLength={60}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="Software architecture"
          value={nickname}
        />
      </label>

      <div className="text-sm font-medium">
        <p className="mb-2">Teaching period</p>
        <CustomSelect
          ariaLabel="Teaching period"
          onChange={(value) => {
            const selected = offeringOptions.find(
              (option) => option.value === value,
            );
            if (!selected) return;
            setYear(selected.year);
            setPeriod(selected.period);
          }}
          options={offeringOptions}
          value={offeringValue}
        />
        {periodFull ? (
          <p
            className="mt-2 text-sm font-normal text-[var(--color-danger)]"
            role="alert"
          >
            You already have {MAX_UNITS_PER_PERIOD} units in{" "}
            {getTeachingPeriodLabel(period)} {year}. Leave one to add another.
          </p>
        ) : null}
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

      <button
        className="mac-focus flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[rgb(255_227_48/0.3)] text-sm font-semibold text-[var(--color-mac-yellow)] transition hover:bg-[rgb(255_227_48/0.07)]"
        onClick={onOpenSpecialUnits}
        type="button"
      >
        <BriefcaseBusiness aria-hidden size={16} />
        Special units
      </button>
    </AppDialog>
  );
}

function SpecialUnitsDialog({
  onClose,
  onRequest,
  onSelect,
  units,
}: {
  onClose: () => void;
  onRequest: () => void;
  onSelect: (unit: SpecialUnit) => void;
  units: SpecialUnit[];
}) {
  return (
    <AppDialog
      bodyClassName="grid gap-1.5 p-3"
      closeLabel="Close special units"
      footer={
        <button
          className="mac-focus inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[var(--color-border)] text-sm font-semibold transition hover:bg-[rgb(255_255_255/0.04)]"
          onClick={onRequest}
          type="button"
        >
          <Plus aria-hidden size={16} />
          Request a unit
        </button>
      }
      maxWidthClassName="max-w-md"
      onClose={onClose}
      title="Special units"
    >
      {units.length ? (
        units.map((unit, index) => (
          <button
            className="mac-focus grid min-h-12 w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 rounded-md border border-[rgb(255_227_48/0.22)] bg-[rgb(255_227_48/0.055)] px-3 py-2 text-left transition hover:border-[rgb(255_227_48/0.45)]"
            data-dialog-autofocus={index === 0 ? "" : undefined}
            key={unit.code}
            onClick={() => onSelect(unit)}
            type="button"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414]">
              <BriefcaseBusiness aria-hidden size={14} />
            </span>
            <span className="truncate text-sm font-semibold">{unit.name}</span>
          </button>
        ))
      ) : (
        <p className="py-5 text-center text-sm text-[var(--color-text-muted)]">
          No special units available.
        </p>
      )}
    </AppDialog>
  );
}

function RequestUnitDialog({
  error,
  isSaving,
  onClose,
  onSubmit,
}: {
  error: string | null;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (input: {
    code: string | null;
    comment: string | null;
    name: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [comment, setComment] = useState("");
  const valid = Boolean(name.trim());

  return (
    <AppDialog
      bodyClassName="space-y-4 p-3"
      closeLabel="Close unit request"
      confirmDiscard={false}
      footer={
        <button
          className="mac-focus inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414] disabled:opacity-45"
          disabled={!valid || isSaving}
          onClick={() =>
            onSubmit({
              code: normalizeUnitCode(code) || null,
              comment: comment.trim() || null,
              name: name.trim(),
            })
          }
          type="button"
        >
          {isSaving ? (
            <LoaderCircle aria-hidden className="animate-spin" size={16} />
          ) : (
            <Send aria-hidden size={16} />
          )}
          {isSaving ? "Sending…" : "Send request"}
        </button>
      }
      maxWidthClassName="max-w-md"
      onClose={onClose}
      title="Request a unit"
    >
      {error ? (
        <p className="rounded-md border border-[rgb(255_107_107/0.35)] bg-[rgb(255_107_107/0.08)] p-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <label className="block text-sm font-medium">
        Unit name
        <input
          className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
          data-dialog-autofocus
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          placeholder="Industry Based Learning"
          value={name}
        />
      </label>

      <label className="block text-sm font-medium">
        Unit code{" "}
        <span className="text-[var(--color-text-muted)]">(if available)</span>
        <input
          autoCapitalize="characters"
          className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 font-mono uppercase"
          maxLength={14}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="IBL"
          value={code}
        />
      </label>

      <label className="block text-sm font-medium">
        Extra information{" "}
        <span className="text-[var(--color-text-muted)]">(optional)</span>
        <textarea
          className="mac-focus mt-2 min-h-24 w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5"
          maxLength={500}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Anything that will help us identify the unit."
          value={comment}
        />
      </label>
    </AppDialog>
  );
}

function UnitCodeInput({
  invalid,
  onChange,
  suggestions,
  value,
}: {
  invalid: boolean;
  onChange: (value: string) => void;
  suggestions: RemoteUnitState["suggestions"];
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const inputId = useId();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const query = normalizeUnitCode(value);
  const filteredSuggestions = suggestions
    .filter(
      (suggestion) =>
        !query ||
        suggestion.code.includes(query) ||
        suggestion.nickname?.toLowerCase().includes(value.toLowerCase()),
    )
    .slice(0, 6);

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          rootRef.current?.contains(event.relatedTarget)
        ) {
          return;
        }

        setIsOpen(false);
      }}
      ref={rootRef}
    >
      <label className="block text-sm font-medium" htmlFor={inputId}>
        Unit code
      </label>
      <input
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        autoCapitalize="characters"
        className="mac-focus mt-2 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 font-mono uppercase"
        data-dialog-autofocus
        id={inputId}
        maxLength={14}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        placeholder="FIT3077"
        role="combobox"
        value={value}
      />

      {isOpen && filteredSuggestions.length ? (
        <div
          className="absolute inset-x-0 top-[calc(100%+0.45rem)] z-50 max-h-60 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[rgb(30_30_30/0.99)] p-1.5 shadow-[0_18px_50px_rgb(0_0_0/0.52)] backdrop-blur-xl"
          id={listboxId}
          role="listbox"
        >
          {filteredSuggestions.map((suggestion) => {
            const selected = suggestion.code === query;

            return (
              <button
                aria-selected={selected}
                className={cn(
                  "mac-focus grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2 text-left transition",
                  selected
                    ? "bg-[rgb(255_227_48/0.12)]"
                    : "hover:bg-[rgb(255_255_255/0.055)]",
                )}
                key={suggestion.code}
                onClick={() => {
                  onChange(suggestion.code);
                  setIsOpen(false);
                }}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-sm font-semibold">
                    {suggestion.code}
                  </span>
                  {suggestion.nickname ? (
                    <span className="mt-0.5 block truncate text-xs text-[var(--color-text-muted)]">
                      {suggestion.nickname}
                    </span>
                  ) : null}
                </span>
                {selected ? (
                  <Check
                    aria-hidden
                    className="text-[var(--color-mac-yellow)]"
                    size={15}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {invalid ? (
        <span className="mt-2 block text-xs text-[var(--color-danger)]">
          Use a code like FIT3077.
        </span>
      ) : null}
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
      friendRequest: null,
      friendRequestId: null,
      handle: friend.handle,
      id: friend.id,
      isFriend: index < 2,
      mutualFriendCount: Math.max(0, 3 - index),
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

function getUnitRequestError(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  ) {
    return "You have already requested this unit.";
  }

  return getErrorMessage(error, "Could not send that request.");
}
