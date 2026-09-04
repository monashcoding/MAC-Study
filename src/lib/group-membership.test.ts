import { describe, expect, it } from "vitest";
import { getGroupLeaveAvailability } from "./group-membership";

describe("getGroupLeaveAvailability", () => {
  it("requires a leader to transfer ownership when other members remain", () => {
    expect(getGroupLeaveAvailability("owner", 2)).toEqual({
      canLeave: false,
      requiresOwnershipTransfer: true,
      willDisband: false,
    });
  });

  it("allows the final leader to leave and disband the group", () => {
    expect(getGroupLeaveAvailability("owner", 1)).toEqual({
      canLeave: true,
      requiresOwnershipTransfer: false,
      willDisband: true,
    });
  });

  it.each(["admin", "member"] as const)(
    "allows a %s to leave without disbanding the group",
    (role) => {
      expect(getGroupLeaveAvailability(role, 3)).toEqual({
        canLeave: true,
        requiresOwnershipTransfer: false,
        willDisband: false,
      });
    },
  );
});
