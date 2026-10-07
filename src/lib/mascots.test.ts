import { describe, expect, it } from "vitest";
import {
  getMascotForId,
  getMascotSrc,
  MASCOT_KEYS,
  resolveMascot,
} from "./mascots";

describe("getMascotForId", () => {
  it("returns the same mascot for the same id", () => {
    expect(getMascotForId("user-123")).toBe(getMascotForId("user-123"));
  });

  it("always returns a known mascot", () => {
    for (const id of ["", "a", "b5f0c2d4-1e2f-4a3b-8c9d-0e1f2a3b4c5d"]) {
      expect(MASCOT_KEYS).toContain(getMascotForId(id));
    }
  });

  it("spreads ids across several mascots", () => {
    const picks = new Set(
      Array.from({ length: 60 }, (_, index) => getMascotForId(`user-${index}`)),
    );

    expect(picks.size).toBeGreaterThan(6);
  });
});

describe("resolveMascot", () => {
  it("uses a chosen mascot", () => {
    expect(resolveMascot("min-sad", "user-1")).toBe("min-sad");
  });

  it("falls back to the stable pick for legacy or missing icons", () => {
    expect(resolveMascot("flame-desk", "user-1")).toBe(
      getMascotForId("user-1"),
    );
    expect(resolveMascot(null, "user-1")).toBe(getMascotForId("user-1"));
  });
});

describe("getMascotSrc", () => {
  it("points at the public mascot file", () => {
    expect(getMascotSrc("max-arms-up")).toBe("/mascots/max-arms-up.svg");
  });
});
