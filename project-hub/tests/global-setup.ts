import { execSync } from "node:child_process";
import { TEST_ENV } from "./env";

export default function setup() {
  const env = { ...process.env, ...TEST_ENV };
  const run = (cmd: string) => execSync(cmd, { env, stdio: "inherit" });
  run("npx tsx scripts/db-setup.ts --reset");
  run("npx tsx scripts/migrate.ts");
  run("npx tsx --tsconfig tsconfig.scripts.json scripts/seed.ts");
}
