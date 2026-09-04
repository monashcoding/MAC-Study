import type { GroupRole } from "./social-state";

export type GroupLeaveAvailability = {
  canLeave: boolean;
  requiresOwnershipTransfer: boolean;
  willDisband: boolean;
};

export function getGroupLeaveAvailability(
  role: GroupRole,
  activeMemberCount: number,
): GroupLeaveAvailability {
  const willDisband = role === "owner" && activeMemberCount === 1;
  const requiresOwnershipTransfer = role === "owner" && activeMemberCount > 1;

  return {
    canLeave: !requiresOwnershipTransfer,
    requiresOwnershipTransfer,
    willDisband,
  };
}
