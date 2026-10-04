import { join } from "node:path";

export const E2E_USERS = {
  owner: {
    email: "phase6-owner@example.test",
    id: "11111111-1111-4111-8111-111111111111",
    macUserId: "phase6-owner",
    name: "Phase Six Owner",
    username: "phase6owner",
  },
  outsider: {
    email: "phase6-outsider@example.test",
    id: "22222222-2222-4222-8222-222222222222",
    macUserId: "phase6-outsider",
    name: "Phase Six Outsider",
    username: "phase6outsider",
  },
} as const;

export const E2E_PRIVATE_GROUP = {
  id: "33333333-3333-4333-8333-333333333333",
  inviteCode: "PHASE6RLS",
  name: "Phase 6 private group",
} as const;

export const E2E_CREATED_GROUP_NAME = "Phase 6 browser group";
export const E2E_AUTH_DIR = join(process.cwd(), "test-results", ".auth");
export const OWNER_STORAGE_STATE = join(E2E_AUTH_DIR, "owner.json");
export const E2E_RUNTIME_STATE = join(E2E_AUTH_DIR, "runtime.json");
