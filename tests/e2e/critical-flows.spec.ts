import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../../src/lib/supabase/types";
import {
  E2E_CREATED_GROUP_NAME,
  E2E_PRIVATE_GROUP,
  E2E_RUNTIME_STATE,
  E2E_USERS,
  OWNER_STORAGE_STATE,
} from "./fixtures";

test.describe("authentication routing", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("redirects a signed-out visitor to login", async ({ page }) => {
    await page.goto("/app");

    await expect(page).toHaveURL(/\/auth\/login\?next=%2Fapp$/);
    await expect(page.getByRole("heading", { name: "MAC Study" })).toBeVisible();
  });
});

test.describe("signed-in critical flows", () => {
  test.use({ storageState: OWNER_STORAGE_STATE });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((userId) => {
      window.localStorage.setItem(`mac-install-onboarding-v3:${userId}`, "seen");
      window.localStorage.setItem(
        `mac-notification-onboarding:${userId}`,
        "seen",
      );
    }, E2E_USERS.owner.id);
  });

  test("starts a general study timer", async ({ page }) => {
    await page.goto("/app");
    await page.getByRole("button", { name: "Start session" }).click();
    await page.getByRole("button", { name: "General study" }).click();

    await expect(
      page.getByRole("button", { name: "Pause session" }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const { data, error } = await adminClient()
          .from("study_sessions")
          .select("status")
          .eq("user_id", E2E_USERS.owner.id)
          .is("ended_at", null)
          .is("deleted_at", null)
          .maybeSingle();

        if (error) throw error;
        return data?.status;
      })
      .toBe("active");
  });

  test("creates a private study group", async ({ page }) => {
    await page.goto("/app/groups");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill(E2E_CREATED_GROUP_NAME);
    await page
      .getByRole("button", { name: "Create group", exact: true })
      .click();

    await expect(
      page.getByRole("heading", { name: E2E_CREATED_GROUP_NAME }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const { data, error } = await adminClient()
          .from("groups")
          .select("name, owner_id, visibility")
          .eq("name", E2E_CREATED_GROUP_NAME)
          .eq("owner_id", E2E_USERS.owner.id)
          .maybeSingle();

        if (error) throw error;
        return data;
      })
      .toEqual({
        name: E2E_CREATED_GROUP_NAME,
        owner_id: E2E_USERS.owner.id,
        visibility: "invite_only",
      });
  });
});

test("RLS hides a private group from a signed-in non-member", async ({
  request,
}) => {
  const runtime = JSON.parse(await readFile(E2E_RUNTIME_STATE, "utf8")) as {
    outsiderToken: string;
    ownerToken: string;
  };
  const url = `${requireEnvironment("NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/groups?id=eq.${E2E_PRIVATE_GROUP.id}&select=id,name`;
  const apiKey = requireEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const ownerResponse = await request.get(url, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${runtime.ownerToken}`,
    },
  });
  const outsiderResponse = await request.get(url, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${runtime.outsiderToken}`,
    },
  });

  expect(ownerResponse.ok()).toBe(true);
  expect(await ownerResponse.json()).toEqual([
    { id: E2E_PRIVATE_GROUP.id, name: E2E_PRIVATE_GROUP.name },
  ]);
  expect(outsiderResponse.ok()).toBe(true);
  expect(await outsiderResponse.json()).toEqual([]);
});

function adminClient() {
  return createClient<Database>(
    requireEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function requireEnvironment(name: string) {
  const value = process.env[name];

  if (!value) throw new Error(`${name} is required for the Playwright suite.`);

  return value;
}
