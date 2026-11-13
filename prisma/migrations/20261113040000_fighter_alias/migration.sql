-- Alternate names for pool search and fighter matching. Does not change existing fighter rows.
CREATE TABLE "FighterAlias" (
    "id" TEXT NOT NULL,
    "fighterId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,

    CONSTRAINT "FighterAlias_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FighterAlias_alias_idx" ON "FighterAlias"("alias");

CREATE UNIQUE INDEX "FighterAlias_fighterId_alias_key" ON "FighterAlias"("fighterId", "alias");

ALTER TABLE "FighterAlias" ADD CONSTRAINT "FighterAlias_fighterId_fkey" FOREIGN KEY ("fighterId") REFERENCES "Fighter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
