-- Inclusive season window. Null on existing leagues keeps every score in the standings.
-- Instants are 12:00 UTC so the America/Los_Angeles calendar day matches the picked date.
ALTER TABLE "League" ADD COLUMN "seasonStart" TIMESTAMP(3),
ADD COLUMN "seasonEnd" TIMESTAMP(3);

-- MMAnomaly League Season 5: 2026-07-01 through 2026-12-31 (Los Angeles, inclusive).
-- Scores are not deleted. Standings filter by this window and still count a seeded baseline event.
UPDATE "League"
SET
  "seasonStart" = TIMESTAMP '2026-07-01 12:00:00',
  "seasonEnd" = TIMESTAMP '2026-12-31 12:00:00'
WHERE "name" ILIKE '%Season 5%'
  AND "seasonStart" IS NULL
  AND "seasonEnd" IS NULL;
