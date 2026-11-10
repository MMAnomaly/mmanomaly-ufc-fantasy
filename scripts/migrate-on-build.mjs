/**
 * Apply pending Prisma migrations during the Vercel build.
 * The ops machine cannot open Postgres on port 5432. Vercel has DATABASE_URL.
 * Local `npm run build` without that variable skips this step.
 * `prisma migrate deploy` only runs migrations that are not recorded yet.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL is unset; skipping prisma migrate deploy.");
  process.exit(0);
}

if (!process.env.DIRECT_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  console.log("DIRECT_URL is unset; prisma migrate deploy will use DATABASE_URL.");
}

const prismaBin = path.join(process.cwd(), "node_modules", ".bin", "prisma");
const result = spawnSync(prismaBin, ["migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
