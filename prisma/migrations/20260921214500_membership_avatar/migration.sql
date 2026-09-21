-- Team display pictures. Existing rows stay initials-only until a member sets one.
ALTER TABLE "Membership" ADD COLUMN "avatarUrl" TEXT;

-- Case-insensitive team names are unique inside a league.
-- If a league already has duplicates, keep the earliest row and suffix the rest.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "leagueId", lower("teamName")
      ORDER BY "createdAt", id
    ) AS n
  FROM "Membership"
)
UPDATE "Membership" AS m
SET "teamName" = left(m."teamName", 12) || ' #' || m.id
FROM ranked
WHERE m.id = ranked.id AND ranked.n > 1;

CREATE UNIQUE INDEX "Membership_leagueId_teamName_ci_key"
ON "Membership" ("leagueId", lower("teamName"));
