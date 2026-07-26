import { describe, expect, it } from "vitest";
import { normalizeSocialState } from "./social-state";

describe("normalizeSocialState groups", () => {
  it("upgrades cached groups with leader roles and private-only visibility", () => {
    const state = normalizeSocialState({
      friends: [],
      groups: [
        {
          id: "public-study",
          name: "Public study",
          memberIds: ["you"],
          currentUserRole: "owner",
          visibility: "public",
        },
      ],
    });

    expect(state.groups[0]).toMatchObject({
      currentUserRole: "owner",
      memberRoles: { you: "owner" },
      visibility: "private",
    });
  });

  it("keeps older groups private by default", () => {
    const state = normalizeSocialState({
      friends: [],
      groups: [{ id: "legacy", name: "Legacy", memberIds: ["you"] }],
    });

    expect(state.groups[0]?.visibility).toBe("private");
  });
});
