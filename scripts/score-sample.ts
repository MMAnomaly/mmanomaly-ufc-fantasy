import { persistAndScoreEvent } from "../src/lib/ufcstats";
import { loadSampleEvent } from "../src/lib/sample-event";

async function main() {
  const result = await persistAndScoreEvent(loadSampleEvent(), "cli-sample");
  console.log(result.log);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
