import { describe, expect, it } from "vitest";
import {
  filterUnitEnrollments,
  findSpecialUnitByAlias,
  getCohortLabel,
  getUnitMemberCountLabel,
  isPastUnitEnrollment,
  isValidUnitCode,
  normalizeUnitCode,
  uniqueUnitSuggestions,
} from "./units";

describe("unit codes", () => {
  it.each([
    ["fit3077", "FIT3077"],
    ["FIT 3077", "FIT3077"],
    ["fit-3077", "FIT3077"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeUnitCode(input)).toBe(expected);
    expect(isValidUnitCode(input)).toBe(true);
  });

  it.each([
    "FIT307",
    "FITX3077",
    "30FIT77",
    "FIT@3077",
    "FIT30770",
    "FIT----------------3077",
  ])("rejects %s", (input) => expect(isValidUnitCode(input)).toBe(false));

  it("accepts catalogue-backed special unit codes only when supplied", () => {
    expect(isValidUnitCode("IBL")).toBe(false);
    expect(isValidUnitCode("IBL", ["IBL"])).toBe(true);
  });

  it("finds the special unit represented by an alias code", () => {
    const ibl = {
      aliasCodes: ["FIT3045", "FIT4042"],
      code: "IBL",
      description: null,
      name: "Industry Based Learning",
    };

    expect(findSpecialUnitByAlias([ibl], "fit 3045")).toEqual(ibl);
    expect(findSpecialUnitByAlias([ibl], "FIT3077")).toBeNull();
  });

  it("deduplicates suggestions by canonical code", () => {
    expect(
      uniqueUnitSuggestions([
        { code: "fit 3077", nickname: null },
        { code: "FIT3077", nickname: "Software architecture" },
      ]),
    ).toEqual([{ code: "FIT3077", nickname: "Software architecture" }]);
  });
});

describe("unit offerings", () => {
  it("formats the Discord-style cohort label", () => {
    expect(
      getCohortLabel({ code: "FIT3077", period: "semester_1", year: 2027 }),
    ).toBe("2027-Sem1-FIT3077");
  });

  it("keeps past and upcoming offerings separate", () => {
    const now = new Date(2027, 7, 1);

    expect(
      isPastUnitEnrollment({ period: "semester_1", year: 2027 }, now),
    ).toBe(true);
    expect(
      isPastUnitEnrollment({ period: "semester_2", year: 2027 }, now),
    ).toBe(false);
  });

  it("filters offerings by year and teaching period", () => {
    const enrollments = [
      {
        code: "FIT2004",
        joinedAt: "2026-01-01T00:00:00.000Z",
        memberCount: 8,
        nickname: null,
        offeringId: "fit2004-2026-s2",
        period: "semester_2" as const,
        unitId: "fit2004",
        year: 2026,
      },
      {
        code: "FIT3155",
        joinedAt: "2027-01-01T00:00:00.000Z",
        memberCount: 3,
        nickname: null,
        offeringId: "fit3155-2027-s1",
        period: "semester_1" as const,
        unitId: "fit3155",
        year: 2027,
      },
    ];

    expect(
      filterUnitEnrollments(enrollments, {
        period: "semester_1",
        year: 2027,
      }).map((enrollment) => enrollment.code),
    ).toEqual(["FIT3155"]);
    expect(
      filterUnitEnrollments(enrollments, { period: null, year: null }),
    ).toHaveLength(2);
  });

  it("formats cohort sizes with correct singular and plural labels", () => {
    expect(getUnitMemberCountLabel(1)).toBe("1 person");
    expect(getUnitMemberCountLabel(12)).toBe("12 people");
  });
});
