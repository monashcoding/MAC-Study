export const TEACHING_PERIODS = [
  "semester_1",
  "semester_2",
  "summer",
  "winter",
] as const;

export type TeachingPeriod = (typeof TEACHING_PERIODS)[number];

export type UnitEnrollment = {
  code: string;
  joinedAt: string;
  nickname: string | null;
  offeringId: string;
  period: TeachingPeriod;
  unitId: string;
  year: number;
};

export type UnitCohortMember = {
  color: string;
  displayName: string;
  handle: string;
  id: string;
  isFriend: boolean;
  sharedGroupIds: string[];
  studyIcon: string;
};

export type UnitSuggestion = {
  code: string;
  nickname: string | null;
};

const UNIT_CODE_PATTERN = /^[A-Z]{3}[0-9]{4}$/;

const periodLabels: Record<TeachingPeriod, string> = {
  semester_1: "Semester 1",
  semester_2: "Semester 2",
  summer: "Summer",
  winter: "Winter",
};

const periodShortLabels: Record<TeachingPeriod, string> = {
  semester_1: "Sem1",
  semester_2: "Sem2",
  summer: "Summer",
  winter: "Winter",
};

export function normalizeUnitCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
}

export function isValidUnitCode(value: string) {
  return (
    value.trim().length <= 14 &&
    UNIT_CODE_PATTERN.test(normalizeUnitCode(value))
  );
}

export function normalizeUnitNickname(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 60);
}

export function getTeachingPeriodLabel(period: TeachingPeriod) {
  return periodLabels[period];
}

export function getCohortLabel({
  code,
  period,
  year,
}: Pick<UnitEnrollment, "code" | "period" | "year">) {
  return `${year}-${periodShortLabels[period]}-${code}`;
}

export function getUnitYearOptions(now = new Date()) {
  const currentYear = now.getFullYear();

  return Array.from({ length: 6 }, (_, index) => currentYear - 2 + index);
}

export function getDefaultTeachingPeriod(now = new Date()): TeachingPeriod {
  return now.getMonth() < 6 ? "semester_1" : "semester_2";
}

export function isPastUnitEnrollment(
  enrollment: Pick<UnitEnrollment, "period" | "year">,
  now = new Date(),
) {
  const periodEndMonth: Record<TeachingPeriod, number> = {
    summer: 1,
    semester_1: 5,
    winter: 6,
    semester_2: 11,
  };
  const end = new Date(
    enrollment.year,
    periodEndMonth[enrollment.period] + 1,
    0,
    23,
    59,
    59,
    999,
  );

  return end < now;
}

export function uniqueUnitSuggestions(suggestions: UnitSuggestion[]) {
  const byCode = new Map<string, UnitSuggestion>();

  suggestions.forEach((suggestion) => {
    const code = normalizeUnitCode(suggestion.code);

    if (!isValidUnitCode(code)) {
      return;
    }

    const current = byCode.get(code);
    const nickname = suggestion.nickname
      ? normalizeUnitNickname(suggestion.nickname)
      : null;

    if (!current || (!current.nickname && nickname)) {
      byCode.set(code, { code, nickname: nickname || null });
    }
  });

  return Array.from(byCode.values()).sort((first, second) =>
    first.code.localeCompare(second.code),
  );
}
