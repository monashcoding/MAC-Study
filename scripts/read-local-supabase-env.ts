import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type LocalSupabaseStatus = {
  ANON_KEY: string;
  API_URL: string;
  SERVICE_ROLE_KEY: string;
};

type SigningKey = {
  alg?: string;
  d?: string;
};

function run(command: string, args: string[]) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function getSupabaseCliPath() {
  return join(
    process.cwd(),
    "node_modules",
    "supabase",
    "dist",
    "supabase.js",
  );
}

function getProjectId() {
  const config = readFileSync(
    join(process.cwd(), "supabase", "config.toml"),
    "utf8",
  );
  const match = config.match(/^project_id\s*=\s*"([^"]+)"/m);

  if (!match) {
    throw new Error("supabase/config.toml does not define project_id.");
  }

  return match[1];
}

export function readLocalSupabaseEnvironment() {
  let status: LocalSupabaseStatus;

  try {
    status = JSON.parse(
      run(process.execPath, [
        getSupabaseCliPath(),
        "status",
        "-o",
        "json",
      ]),
    ) as LocalSupabaseStatus;
  } catch (error) {
    throw new Error(
      "The local Supabase stack is not running. Run `npm run db:start:e2e` first.",
      { cause: error },
    );
  }

  const authContainer = `supabase_auth_${getProjectId()}`;
  let containerEnvironment: string[];

  try {
    containerEnvironment = JSON.parse(
      run("docker", [
        "inspect",
        authContainer,
        "--format",
        "{{json .Config.Env}}",
      ]),
    ) as string[];
  } catch (error) {
    throw new Error(
      `Could not read the local Supabase signing key from ${authContainer}.`,
      { cause: error },
    );
  }

  const jwtKeysEntry = containerEnvironment.find((entry) =>
    entry.startsWith("GOTRUE_JWT_KEYS="),
  );
  const jwtKeys = jwtKeysEntry
    ? (JSON.parse(jwtKeysEntry.slice("GOTRUE_JWT_KEYS=".length)) as SigningKey[])
    : [];
  const privateJwk = jwtKeys.find(
    (key) => key.alg === "ES256" && typeof key.d === "string",
  );

  if (!privateJwk) {
    throw new Error(
      "The local Supabase Auth container did not expose an ES256 signing key.",
    );
  }

  return {
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    SUPABASE_JWT_PRIVATE_JWK: JSON.stringify(privateJwk),
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  };
}
