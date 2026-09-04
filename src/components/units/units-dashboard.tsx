"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowLeft,
  BookOpen,
  BriefcaseBusiness,
  Check,
  Info,
  Link2,
  LoaderCircle,
  Plus,
  Search,
  Send,
  UserPlus,
} from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
import { CustomSelect } from "@/components/custom-select";
import { PaginatedList } from "@/components/paginated-list";
import { TransientToast } from "@/components/transient-toast";
import {
  addRemoteFriend,
  fetchRemoteSocialSnapshot,
  fetchRemoteUnitCohort,
  fetchRemoteUnitState,
  inviteRemoteFriendToGroup,
  leaveRemoteUnitEnrollment,
  requestRemoteSpecialUnit,
  setRemoteSubjectUnitOffering,
  subscribeToRemoteAppChanges,
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
  getCohortLabel,
  getDefaultTeachingPeriod,
  getTeachingPeriodLabel,
  getTeachingPeriodShortLabel,
  getUnitYearOptions,
  isPastUnitEnrollment,
  isValidUnitCode,
  normalizeUnitCode,
  normalizeUnitNickname,
  type SpecialUnit,
  type TeachingPeriod,
  type UnitCohortMember,
  type UnitEnrollment,
} from "@/lib/units";
import { cn } from "@/lib/utils";

type CohortScope = "all" | "friends";
const UNLINKED_SUBJECT_VALUE = "__unlinked__";

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

export function UnitsDashboard() {
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
  const [isAdding, setIsAdding] = useState(false);
  const [isRequestingUnit, setIsRequestingUnit] = useState(false);
  const [isSpecialUnitsOpen, setIsSpecialUnitsOpen] = useState(false);
  const [selectedSpecialUnit, setSelectedSpecialUnit] =
    useState<SpecialUnit | null>(null);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<CohortScope>("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sentFriendRequestIds, setSentFriendRequestIds] = useState<string[]>(
    [],
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [requestUnitError, setRequestUnitError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
  }, [refreshRemote]);

  useEffect(() => {
    if (!remoteClient || dataMode !== "remote") return;

    return subscribeToRemoteAppChanges(remoteClient, (table) => {
      if (table === "friend_requests" || table === "app_notifications") {
        return;
      }

      void refreshRemote(remoteClient);
    });
  }, [dataMode, refreshRemote, remoteClient]);

  const selectedEnrollment = unitState.enrollments.find(
    (enrollment) => enrollment.offeringId === selectedOfferingId,
  );
  useAppHeaderDetail("/app/units", selectedEnrollment?.code ?? null);

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
      .filter((member) => (scope === "friends" ? member.isFriend : true))
      .sort(
        (first, second) =>
          Number(second.isFriend) - Number(first.isFriend) ||
          second.mutualFriendCount - first.mutualFriendCount ||
          first.displayName.localeCompare(second.displayName),
      );
  }, [cohort, scope, search]);

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
      setToastMessage("Unit left");
    } catch (error) {
      setFeedback(getErrorMessage(error, "Could not leave this cohort."));
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
          cohortLoading={cohortLoading}
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
            setSearch("");
            setScope("all");
          }}
          onLeave={() => void leaveEnrollment(selectedEnrollment)}
          onLinkSubject={(subjectId, offeringId) =>
            void linkSubject(subjectId, offeringId)
          }
          onScopeChange={setScope}
          onSearchChange={setSearch}
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

  const current = unitState.enrollments
    .filter((enrollment) => !isPastUnitEnrollment(enrollment))
    .sort(compareUnitEnrollments);
  const past = unitState.enrollments
    .filter((enrollment) => isPastUnitEnrollment(enrollment))
    .sort((first, second) => compareUnitEnrollments(second, first));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <h2 className="truncate text-base font-semibold sm:text-lg">
            Current and upcoming
          </h2>
          {current.length ? (
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
          ) : null}
        </div>

        {dataMode !== "loading" && current.length ? (
          <EnrollmentSection
            enrollments={current}
            onOpen={setSelectedOfferingId}
            title={null}
          />
        ) : dataMode !== "loading" ? (
          <button
            className="mac-focus inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-mac-yellow)] px-4 text-sm font-semibold text-[#141414] sm:w-auto"
            onClick={() => {
              setSelectedSpecialUnit(null);
              setIsAdding(true);
            }}
            type="button"
          >
            <Plus aria-hidden size={17} />
            Add unit
          </button>
        ) : null}
      </section>

      {feedback ? <Feedback message={feedback} /> : null}
      {dataMode === "loading" ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading units…</p>
      ) : null}

      {dataMode !== "loading" && past.length ? (
        <EnrollmentSection
          enrollments={past}
          onOpen={setSelectedOfferingId}
          title="Past units"
        />
      ) : null}

      {isAdding ? (
        <AddUnitDialog
          initialSpecialUnit={selectedSpecialUnit}
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

function EnrollmentSection({
  enrollments,
  onOpen,
  title,
}: {
  enrollments: UnitEnrollment[];
  onOpen: (offeringId: string) => void;
  title: string | null;
}) {
  return (
    <section className="space-y-3">
      {title ? <h3 className="text-lg font-semibold">{title}</h3> : null}
      {enrollments.length ? (
        <PaginatedList
          className="grid gap-3 lg:grid-cols-2"
          items={enrollments}
          pageSize={10}
          renderItem={(enrollment) => (
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
                {enrollment.nickname ? (
                  <span className="mt-1 block truncate text-sm text-[var(--color-text-muted)]">
                    {enrollment.nickname}
                  </span>
                ) : null}
              </span>
              <span className="text-right text-xs font-semibold text-[var(--color-text-muted)]">
                <span className="block">{enrollment.year}</span>
                <span className="mt-1 block">
                  {getTeachingPeriodLabel(enrollment.period)}
                </span>
              </span>
            </button>
          )}
          resetKey={title ?? "current-units"}
        />
      ) : null}
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
  manageableGroups,
  onAddFriend,
  onAddToGroup,
  onBack,
  onLeave,
  onLinkSubject,
  onScopeChange,
  onSearchChange,
  scope,
  search,
  sentFriendRequestIds,
  subjects,
}: {
  allGroups: SocialGroup[];
  busyKey: string | null;
  cohort: UnitCohortMember[];
  cohortLoading: boolean;
  enrollment: UnitEnrollment;
  feedback: string | null;
  manageableGroups: SocialGroup[];
  onAddFriend: (memberId: string) => void;
  onAddToGroup: (memberId: string, groupId: string) => void;
  onBack: () => void;
  onLeave: () => void;
  onLinkSubject: (subjectId: string, offeringId: string | null) => void;
  onScopeChange: (scope: CohortScope) => void;
  onSearchChange: (value: string) => void;
  scope: CohortScope;
  search: string;
  sentFriendRequestIds: string[];
  subjects: RemoteUnitState["subjects"];
}) {
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="grid gap-2 sm:flex sm:items-center">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              aria-label="Back to units"
              className="mac-focus -ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.045)] hover:text-[var(--color-text)]"
              onClick={onBack}
              type="button"
            >
              <ArrowLeft aria-hidden size={19} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[var(--color-text-muted)]">
                {enrollment.year} ·{" "}
                {getTeachingPeriodShortLabel(enrollment.period)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:ml-auto">
            <button
              className="mac-focus inline-flex h-10 items-center gap-1.5 rounded-md border border-[rgb(255_227_48/0.34)] px-2.5 text-xs font-semibold text-[var(--color-mac-yellow)] transition hover:bg-[rgb(255_227_48/0.07)]"
              onClick={() => setIsLinkDialogOpen(true)}
              type="button"
            >
              <Link2 aria-hidden size={14} />
              Link to timer
            </button>
            <button
              className="mac-focus inline-flex h-10 items-center rounded-md px-2 text-xs font-semibold text-[var(--color-danger)] transition hover:bg-[rgb(255_107_107/0.08)] disabled:opacity-45"
              disabled={busyKey === `leave:${enrollment.offeringId}`}
              onClick={() => setIsLeaveDialogOpen(true)}
              type="button"
            >
              Leave
            </button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
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
      </section>

      {feedback ? <Feedback message={feedback} /> : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Students</h3>
          <span className="text-xs text-[var(--color-text-muted)]">
            {cohort.length} {cohort.length === 1 ? "member" : "members"}
          </span>
        </div>
        {cohortLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            Loading cohort…
          </p>
        ) : cohort.length ? (
          <PaginatedList
            className="grid lg:grid-cols-2 lg:gap-x-6"
            items={cohort}
            pageSize={12}
            renderItem={(member) => (
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
            )}
            resetKey={`${enrollment.offeringId}:${scope}:${search}`}
          />
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
            No students found.
          </p>
        )}
      </section>

      {isLinkDialogOpen ? (
        <StudyTimerLinkDialog
          busyKey={busyKey}
          enrollment={enrollment}
          onClose={() => setIsLinkDialogOpen(false)}
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

function StudyTimerLinkDialog({
  busyKey,
  enrollment,
  onClose,
  onLinkSubject,
  subjects,
}: {
  busyKey: string | null;
  enrollment: UnitEnrollment;
  onClose: () => void;
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

    if (selectedSubjectId === UNLINKED_SUBJECT_VALUE) {
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
            Save link
          </button>
        </div>
      }
      isDirty={isDirty}
      maxWidthClassName="max-w-md"
      onClose={onClose}
      title="Study timer link"
    >
      {availableSubjects.length ? (
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
            ]}
            value={selectedSubjectId}
          />
        </div>
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">
          Create a study subject before linking this unit.
        </p>
      )}
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
  const sharedGroupNames = member.sharedGroupIds
    .map((groupId) => allGroups.find((group) => group.id === groupId)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <article className="grid min-h-16 grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2.5 border-b border-[rgb(255_255_255/0.08)] py-3 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto] sm:gap-y-0 sm:py-2.5">
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
            "mac-focus col-span-2 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold disabled:opacity-60 sm:col-span-1 sm:w-auto",
            requested
              ? "border border-[var(--color-border)] text-[var(--color-text-muted)]"
              : "bg-[var(--color-mac-yellow)] text-[#141414]",
          )}
          disabled={requested || busyKey === `friend:${member.id}`}
          onClick={() => onAddFriend(member.id)}
          type="button"
        >
          <UserPlus aria-hidden size={13} />
          {requested ? "Requested" : "Request"}
        </button>
      ) : availableGroups.length ? (
        <CustomSelect
          ariaLabel={`Add ${member.displayName} to a group`}
          className="col-span-2 w-full sm:col-span-1 sm:w-[10rem]"
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
            "col-span-2 inline-flex h-8 items-center gap-1 text-[11px] font-medium sm:col-span-1",
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
  initialSpecialUnit,
  isSaving,
  onAdd,
  onClose,
  onOpenSpecialUnits,
  specialUnits,
  suggestions,
}: {
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
  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState<TeachingPeriod>(
    getDefaultTeachingPeriod(),
  );
  const initialYearRef = useRef(year);
  const initialPeriodRef = useRef(period);
  const normalizedCode = normalizeUnitCode(codeInput);
  const aliasSpecialUnit = findSpecialUnitByAlias(specialUnits, normalizedCode);
  const valid = isValidUnitCode(
    codeInput,
    specialUnits.map((unit) => unit.code),
  );
  const isDirty = Boolean(
    codeInput.trim() !== initialCode ||
    nickname.trim() !== initialNickname ||
    year !== initialYearRef.current ||
    period !== initialPeriodRef.current,
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
