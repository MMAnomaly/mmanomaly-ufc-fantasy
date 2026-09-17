import "server-only";

import { prisma } from "./prisma";
import {
  eligibleSlotsForFighter,
  firstEligibleSlot,
  openSlotsForTeam,
  snakeDraftPosition,
  totalPicks,
} from "./draft";
import { fighterFitsSlot, isRosterSlot } from "./slots";

export class DraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftError";
  }
}

export async function getLeagueOrThrow(leagueId: string) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      memberships: {
        include: { user: true, roster: { include: { fighter: true } } },
        orderBy: { draftPosition: "asc" },
      },
      commissioner: true,
    },
  });
  if (!league) throw new DraftError("League not found.");
  return league;
}

export function onTheClock<T extends { id: string; draftPosition: number }>(
  league: { currentPickIndex: number; memberships: T[] },
): T | null {
  const n = league.memberships.length;
  if (n === 0) return null;
  if (league.currentPickIndex >= totalPicks(n)) return null;
  const position = snakeDraftPosition(league.currentPickIndex, n);
  return league.memberships.find((m) => m.draftPosition === position) ?? null;
}

async function applyPick(args: {
  leagueId: string;
  membershipId: string;
  fighterId: string;
  slot: string;
  autoPick: boolean;
  expectedIndex: number;
}) {
  if (!isRosterSlot(args.slot)) throw new DraftError("Invalid roster slot.");

  await prisma.$transaction(async (tx) => {
    const league = await tx.league.findUnique({ where: { id: args.leagueId } });
    if (!league) throw new DraftError("League not found.");
    if (league.status !== "DRAFTING") throw new DraftError("Draft is not live.");
    if (league.currentPickIndex !== args.expectedIndex) {
      throw new DraftError("Pick already processed.");
    }

    const members = await tx.membership.findMany({
      where: { leagueId: args.leagueId },
      include: { roster: true },
    });
    const n = members.length;
    const expectedPosition = snakeDraftPosition(args.expectedIndex, n);
    const member = members.find((m) => m.id === args.membershipId);
    if (!member || member.draftPosition !== expectedPosition) {
      throw new DraftError("It is not this team's turn.");
    }
    if (member.roster.some((r) => r.slot === args.slot)) {
      throw new DraftError("That roster slot is already filled.");
    }

    const fighter = await tx.fighter.findUnique({ where: { id: args.fighterId } });
    if (!fighter || !fighter.active) throw new DraftError("Fighter not available.");
    if (!fighterFitsSlot(fighter.slotKey, args.slot)) {
      throw new DraftError("Fighter does not fit that roster slot.");
    }

    const already = await tx.draftPick.findUnique({
      where: { leagueId_fighterId: { leagueId: args.leagueId, fighterId: args.fighterId } },
    });
    if (already) throw new DraftError("That fighter is already drafted.");

    const pickNumber = args.expectedIndex + 1;
    await tx.draftPick.create({
      data: {
        leagueId: args.leagueId,
        pickNumber,
        membershipId: args.membershipId,
        fighterId: args.fighterId,
        slot: args.slot,
        autoPick: args.autoPick,
      },
    });
    await tx.rosterSlot.create({
      data: {
        membershipId: args.membershipId,
        slot: args.slot,
        fighterId: args.fighterId,
        pickNumber,
      },
    });

    const nextIndex = args.expectedIndex + 1;
    const done = nextIndex >= totalPicks(n);
    await tx.league.update({
      where: { id: args.leagueId },
      data: {
        currentPickIndex: nextIndex,
        pickDeadline: done ? null : new Date(Date.now() + league.pickClockSeconds * 1000),
        status: done ? "IN_SEASON" : "DRAFTING",
      },
    });
  });
}

export async function makeManualPick(args: {
  leagueId: string;
  userId: string;
  fighterId: string;
  slot: string;
}) {
  await maybeAutoPick(args.leagueId);
  const league = await getLeagueOrThrow(args.leagueId);
  if (league.status !== "DRAFTING") throw new DraftError("Draft is not live.");
  const clock = onTheClock(league);
  if (!clock) throw new DraftError("Draft is complete.");
  if (clock.userId !== args.userId && league.commissionerId !== args.userId) {
    throw new DraftError("It is not your turn.");
  }
  await applyPick({
    leagueId: args.leagueId,
    membershipId: clock.id,
    fighterId: args.fighterId,
    slot: args.slot,
    autoPick: false,
    expectedIndex: league.currentPickIndex,
  });
}

export async function maybeAutoPick(leagueId: string) {
  for (let i = 0; i < 20; i++) {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: { memberships: { include: { roster: true } } },
    });
    if (!league || league.status !== "DRAFTING") return;
    if (!league.pickDeadline || league.pickDeadline.getTime() > Date.now()) return;

    const clock = onTheClock(league);
    if (!clock) return;
    const member = league.memberships.find((m) => m.id === clock.id);
    if (!member) return;

    const open = openSlotsForTeam(member.roster.map((r) => r.slot));
    const drafted = await prisma.draftPick.findMany({
      where: { leagueId },
      select: { fighterId: true },
    });
    const taken = new Set(drafted.map((p) => p.fighterId));
    const pool = await prisma.fighter.findMany({
      where: { active: true, id: { notIn: [...taken] } },
    });

    let chosen: { fighterId: string; slot: string } | null = null;
    for (const slot of open) {
      const candidates = pool.filter((f) => fighterFitsSlot(f.slotKey, slot));
      if (candidates.length === 0) continue;
      const fighter = candidates[Math.floor(Math.random() * candidates.length)];
      chosen = { fighterId: fighter.id, slot };
      break;
    }
    if (!chosen) throw new DraftError("No eligible fighters remain for auto-pick.");

    try {
      await applyPick({
        leagueId,
        membershipId: member.id,
        fighterId: chosen.fighterId,
        slot: chosen.slot,
        autoPick: true,
        expectedIndex: league.currentPickIndex,
      });
    } catch (err) {
      if (err instanceof DraftError && err.message === "Pick already processed.") {
        continue;
      }
      throw err;
    }
  }
}

export async function serializeDraftState(leagueId: string, userId: string) {
  await maybeAutoPick(leagueId);
  const league = await getLeagueOrThrow(leagueId);
  const picks = await prisma.draftPick.findMany({
    where: { leagueId },
    include: {
      fighter: true,
      membership: { include: { user: true } },
    },
    orderBy: { pickNumber: "asc" },
  });
  const draftedIds = new Set(picks.map((p) => p.fighterId));
  const myMembership = league.memberships.find((m) => m.userId === userId) ?? null;
  const clock = onTheClock(league);
  const myOpen = myMembership ? openSlotsForTeam(myMembership.roster.map((r) => r.slot)) : [];
  const clockOpen = clock
    ? openSlotsForTeam(
        league.memberships.find((m) => m.id === clock.id)?.roster.map((r) => r.slot) ?? [],
      )
    : [];

  const pool = await prisma.fighter.findMany({
    where: { active: true },
    orderBy: [{ classKey: "asc" }, { name: "asc" }],
  });

  return {
    league: {
      id: league.id,
      name: league.name,
      status: league.status,
      maxTeams: league.maxTeams,
      pickClockSeconds: league.pickClockSeconds,
      currentPickIndex: league.currentPickIndex,
      pickDeadline: league.pickDeadline?.toISOString() ?? null,
      commissionerId: league.commissionerId,
      totalPicks: totalPicks(league.memberships.length),
      isCommissioner: league.commissionerId === userId,
    },
    teams: league.memberships
      .slice()
      .sort((a, b) => a.draftPosition - b.draftPosition)
      .map((m) => ({
        id: m.id,
        userId: m.userId,
        teamName: m.teamName,
        displayName: m.user.displayName,
        draftPosition: m.draftPosition,
        filled: m.roster.length,
        roster: m.roster.map((r) => ({
          slot: r.slot,
          pickNumber: r.pickNumber,
          fighter: {
            id: r.fighter.id,
            name: r.fighter.name,
            classKey: r.fighter.classKey,
            slotKey: r.fighter.slotKey,
            record: r.fighter.record,
          },
        })),
      })),
    onTheClock: clock
      ? {
          membershipId: clock.id,
          userId: clock.userId,
          teamName: clock.teamName,
          displayName: league.memberships.find((m) => m.id === clock.id)?.user.displayName ?? "",
          draftPosition: clock.draftPosition,
          openSlots: clockOpen,
          isYou: clock.userId === userId,
        }
      : null,
    myTeam: myMembership
      ? {
          id: myMembership.id,
          teamName: myMembership.teamName,
          openSlots: myOpen,
        }
      : null,
    picks: picks.map((p) => ({
      pickNumber: p.pickNumber,
      slot: p.slot,
      autoPick: p.autoPick,
      teamName: p.membership.teamName,
      displayName: p.membership.user.displayName,
      fighter: {
        id: p.fighter.id,
        name: p.fighter.name,
        classKey: p.fighter.classKey,
        slotKey: p.fighter.slotKey,
        record: p.fighter.record,
      },
    })),
    available: pool
      .filter((f) => !draftedIds.has(f.id))
      .map((f) => ({
        id: f.id,
        name: f.name,
        classKey: f.classKey,
        slotKey: f.slotKey,
        record: f.record,
        rankingJson: f.rankingJson,
        nextBoutJson: f.nextBoutJson,
      })),
  };
}

export { eligibleSlotsForFighter, firstEligibleSlot };
