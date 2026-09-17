import cron from "node-cron";
import { runSundayScoringJob } from "../src/lib/ufcstats";

const TZ = "America/Los_Angeles";

async function run(source: string) {
  console.log(`[${new Date().toISOString()}] starting scoring job (${source})`);
  try {
    const result = await runSundayScoringJob(source);
    console.log(result.log);
  } catch (err) {
    console.error(err);
  }
}

if (process.argv.includes("--now")) {
  run("cli-now").then(() => process.exit(0));
} else {
  cron.schedule("0 15 * * 0", () => run("local-cron"), { timezone: TZ });
  console.log("Armed Sunday 3:00 PM America/Los_Angeles scoring job. Ctrl+C to stop.");
  console.log("Tip: npm run cron -- --now   to run immediately.");
}
