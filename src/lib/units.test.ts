import { describe, expect, it } from "vitest";
import {
  getCohortLabel,
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
});
