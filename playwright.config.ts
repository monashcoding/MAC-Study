import { defineConfig, devices } from "@playwright/test";
import { readLocalSupabaseEnvironment } from "./scripts/read-local-supabase-env";

const baseURL = "http://127.0.0.1:3100";
const supabaseEnvironment = readLocalSupabaseEnvironment();

Object.assign(process.env, supabaseEnvironment, {
  NEXT_PUBLIC_MAC_AUTH_URL: baseURL,
  NEXT_PUBLIC_SITE_URL: baseURL,
});

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  globalSetup: "./tests/e2e/global-setup.ts",
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.platform === "win32" && !process.env.CI
          ? { channel: "chrome" }
          : {}),
      },
    },
  ],
  reporter: process.env.CI ? "github" : "list",
  retries: process.env.CI ? 1 : 0,
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    env: {
      ...process.env,
      ...supabaseEnvironment,
      NEXT_PUBLIC_MAC_AUTH_URL: baseURL,
      NEXT_PUBLIC_SITE_URL: baseURL,
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: baseURL,
  },
  workers: 1,
});
