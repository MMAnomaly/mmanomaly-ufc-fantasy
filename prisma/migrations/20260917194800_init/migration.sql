-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "commissionerId" TEXT NOT NULL,
    "maxTeams" INTEGER NOT NULL DEFAULT 8,
    "pickClockSeconds" INTEGER NOT NULL DEFAULT 90,
    "status" TEXT NOT NULL DEFAULT 'SETUP',
    "currentPickIndex" INTEGER NOT NULL DEFAULT 0,
    "pickDeadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "draftPosition" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fighter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classKey" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "sex" TEXT NOT NULL,
    "weightClass" TEXT NOT NULL,
    "record" TEXT,
    "rankingJson" TEXT,
    "lastFightDate" TIMESTAMP(3),
    "lastFightClass" TEXT,
    "lastFightNote" TEXT,
    "upcomingFightClass" TEXT,
    "nextBoutJson" TEXT,
    "tapologyUrl" TEXT,
    "wikipediaUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "activityNotes" TEXT,

    CONSTRAINT "Fighter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterSlot" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "fighterId" TEXT NOT NULL,
    "pickNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPick" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "pickNumber" INTEGER NOT NULL,
    "membershipId" TEXT NOT NULL,
    "fighterId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "autoPick" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UfcEvent" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "url" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ufcstats',
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UfcEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fight" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "boutOrder" INTEGER NOT NULL DEFAULT 0,
    "weightClass" TEXT,
    "method" TEXT,
    "round" INTEGER,
    "time" TEXT,
    "winnerName" TEXT,
    "fighter1Name" TEXT NOT NULL,
    "fighter2Name" TEXT NOT NULL,
    "fighter1Id" TEXT,
    "fighter2Id" TEXT,
    "ufcStatsUrl" TEXT,

    CONSTRAINT "Fight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FightStatLine" (
    "id" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "fighterId" TEXT,
    "fighterName" TEXT NOT NULL,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "knockdowns" INTEGER NOT NULL DEFAULT 0,
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "sigStrikes" INTEGER NOT NULL DEFAULT 0,
    "takedowns" INTEGER NOT NULL DEFAULT 0,
    "reversals" INTEGER NOT NULL DEFAULT 0,
    "controlTimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "result" TEXT NOT NULL,
    "method" TEXT,
    "round" INTEGER,
    "timeSecondsInRound" INTEGER,
    "finish" BOOLEAN NOT NULL DEFAULT false,
    "rawJson" TEXT,

    CONSTRAINT "FightStatLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyScore" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fighterId" TEXT NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "breakdown" TEXT NOT NULL,

    CONSTRAINT "FantasyScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringJob" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "log" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ScoringJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_leagueId_draftPosition_idx" ON "Membership"("leagueId", "draftPosition");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_leagueId_userId_key" ON "Membership"("leagueId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");

-- CreateIndex
CREATE INDEX "Invite_leagueId_idx" ON "Invite"("leagueId");

-- CreateIndex
CREATE INDEX "Fighter_classKey_idx" ON "Fighter"("classKey");

-- CreateIndex
CREATE INDEX "Fighter_name_idx" ON "Fighter"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RosterSlot_membershipId_slot_key" ON "RosterSlot"("membershipId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_leagueId_pickNumber_key" ON "DraftPick"("leagueId", "pickNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_leagueId_fighterId_key" ON "DraftPick"("leagueId", "fighterId");

-- CreateIndex
CREATE UNIQUE INDEX "UfcEvent_externalId_key" ON "UfcEvent"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "FightStatLine_fightId_fighterName_key" ON "FightStatLine"("fightId", "fighterName");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyScore_eventId_fighterId_key" ON "FantasyScore"("eventId", "fighterId");

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_commissionerId_fkey" FOREIGN KEY ("commissionerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterSlot" ADD CONSTRAINT "RosterSlot_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterSlot" ADD CONSTRAINT "RosterSlot_fighterId_fkey" FOREIGN KEY ("fighterId") REFERENCES "Fighter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_fighterId_fkey" FOREIGN KEY ("fighterId") REFERENCES "Fighter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fight" ADD CONSTRAINT "Fight_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "UfcEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FightStatLine" ADD CONSTRAINT "FightStatLine_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "Fight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FightStatLine" ADD CONSTRAINT "FightStatLine_fighterId_fkey" FOREIGN KEY ("fighterId") REFERENCES "Fighter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyScore" ADD CONSTRAINT "FantasyScore_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "UfcEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyScore" ADD CONSTRAINT "FantasyScore_fighterId_fkey" FOREIGN KEY ("fighterId") REFERENCES "Fighter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringJob" ADD CONSTRAINT "ScoringJob_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "UfcEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

