-- Booked upcoming UFC cards for the standings "Fighting this week" panel.
CREATE TABLE "UfcCard" (
    "id" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "location" TEXT,
    "tapologyUrl" TEXT,
    "boutsJson" TEXT NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UfcCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UfcCard_externalKey_key" ON "UfcCard"("externalKey");

CREATE INDEX "UfcCard_date_idx" ON "UfcCard"("date");
