import { ingestEventByUrl, ingestLatestCompletedEvent, persistAndScoreEvent } from "../src/lib/ufcstats";

async function main() {
  const url = process.argv[2];
  const parsed = url ? await ingestEventByUrl(url) : await ingestLatestCompletedEvent();
  const result = await persistAndScoreEvent(parsed, "cli-ingest");
  console.log(`Scored ${parsed.name}`);
  console.log(result.log);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
