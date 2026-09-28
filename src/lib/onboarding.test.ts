import { describe, expect, it } from "vitest";
import { shouldAutoOpenWelcome } from "./onboarding";

describe("shouldAutoOpenWelcome", () => {
  it("welcomes a new account with no saved state", () => {
    expect(shouldAutoOpenWelcome(null)).toBe(true);
  });

  it("does not interrupt accounts that existed at rollout", () => {
    expect(
      shouldAutoOpenWelcome({
        is_existing_at_rollout: true,
        welcome_version: 0,
      }),
    ).toBe(false);
  });

  it("does not repeat a completed welcome", () => {
    expect(
      shouldAutoOpenWelcome({
        is_existing_at_rollout: false,
        welcome_version: 1,
      }),
    ).toBe(false);
  });
});
