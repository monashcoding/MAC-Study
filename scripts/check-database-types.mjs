import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const databaseTypesPath = fileURLToPath(
  new URL("../src/lib/supabase/database.types.ts", import.meta.url),
);
const generatedTypes = execSync(
  "supabase gen types typescript --local --schema public",
  {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  },
);
const committedTypes = readFileSync(databaseTypesPath, "utf8");

if (normalize(generatedTypes) !== normalize(committedTypes)) {
  console.error(
    "Generated database types are stale. Run `npm run db:types` against a reset local database and commit the result.",
  );
  process.exit(1);
}

console.log("Generated database types are current.");

function normalize(value) {
  return value.replaceAll("\r\n", "\n").trim() + "\n";
}
