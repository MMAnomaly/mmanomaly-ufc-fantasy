import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { evaluateCommittedPick, prepareAutoPick, type PickFighter } from "./autodraft";
import {
  eligibleSlotsForFighter,
  firstEligibleSlot,
  isPickExpired,
  openSlotsForTeam,
  snakeDraftPosition,
  totalPicks,
} from "./draft";
import { isRosterSlot } from "./slots";

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

function isUniqueConflict(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Serializes manual picks and autopicks on one league. Mirrors the in-memory lock in autodraft tests. */
async function lockLeague(tx: Prisma.TransactionClient, leagueId: string) {
  await tx.$queryRaw`SELECT "id" FROM "League" WHERE "id" = ${leagueId} FOR UPDATE`;
}

function toPickFighter(fighter: {
  id: string;
  name: string;
  slotKey: string;
  active: boolean;
  rankingJson: string | null;
  lastFightDate: Date | null;
}): PickFighter {
  return {
    id: fighter.id,
    name: fighter.name,
    slotKey: fighter.slotKey,
    active: fighter.active,
    rankingJson: fighter.rankingJson,
    lastFightDate: fighter.lastFightDate,
  };
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

  try {
    await prisma.$transaction(async (tx) => {
      await lockLeague(tx, args.leagueId);
      const league = await tx.league.findUnique({ where: { id: args.leagueId } });
      if (!league) throw new DraftError("League not found.");

      const members = await tx.membership.findMany({
        where: { leagueId: args.leagueId },
        include: { roster: true },
      });
      const position =
        members.length > 0 && args.expectedIndex < totalPicks(members.length)
          ? snakeDraftPosition(args.expectedIndex, members.length)
          : null;
      const clock = position == null ? null : members.find((m) => m.draftPosition === position) ?? null;
      const actor = members.find((m) => m.id === args.membershipId);
      const fighter = await tx.fighter.findUnique({ where: { id: args.fighterId } });
      const drafted = await tx.draftPick.findMany({
        where: { leagueId: args.leagueId },
        select: { fighterId: true },
      });
      const now = new Date();
      const decision = evaluateCommittedPick(
        {
          status: league.status,
          currentPickIndex: league.currentPickIndex,
          pickDeadline: league.pickDeadline,
          pickClockSeconds: league.pickClockSeconds,
          teamCount: members.length,
          onTheClockMembershipId: clock?.id ?? null,
          onTheClockDraftPosition: clock?.draftPosition ?? null,
          filledSlots: (clock ?? actor)?.roster.map((r) => r.slot) ?? [],
          takenFighterIds: drafted.map((p) => p.fighterId),
        },
        {
          now,
          expectedIndex: args.expectedIndex,
          membershipId: args.membershipId,
          membershipDraftPosition: actor?.draftPosition ?? -1,
          fighter: fighter ? toPickFighter(fighter) : null,
          slot: args.slot,
          autoPick: args.autoPick,
          requireExpired: false,
        },
      );
      if (!decision.ok) throw new DraftError(decision.reason);

      await tx.draftPick.create({
        data: {
          leagueId: args.leagueId,
          pickNumber: decision.pickNumber,
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
          pickNumber: decision.pickNumber,
        },
      });
      await tx.league.update({
        where: { id: args.leagueId },
        data: {
          currentPickIndex: decision.nextIndex,
          pickDeadline: decision.nextDeadline,
          status: decision.nextStatus,
        },
      });
    });
  } catch (err) {
    if (isUniqueConflict(err)) throw new DraftError("Pick already processed.");
    throw err;
  }
}

export async function makeManualPick(args: {
  leagueId: string;
  userId: string;
  fighterId: string;
  slot: string;
}) {
  const before = await prisma.league.findUnique({ where: { id: args.leagueId } });
  if (!before) throw new DraftError("League not found.");
  const expired = before.status === "DRAFTING" && isPickExpired(before.pickDeadline, new Date());
  await maybeAutoPick(args.leagueId);
  if (expired) {
    const after = await prisma.league.findUnique({ where: { id: args.leagueId } });
    if (after && after.currentPickIndex !== before.currentPickIndex) {
      throw new DraftError("The clock expired. That pick was autodrafted.");
    }
  }
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

/**
 * If the stored deadline has passed, draft the best eligible fighter and start the next clock.
 * Safe to call from the draft page, the poll route, or the cron tick. Stops after one pick
 * unless that new deadline is already in the past (clock length of 0).
 */
export async function maybeAutoPick(leagueId: string) {
  for (let i = 0; i < 20; i++) {
    let outcome: "idle" | "picked" = "idle";
    try {
      outcome = await prisma.$transaction(async (tx) => {
        await lockLeague(tx, leagueId);
        const league = await tx.league.findUnique({
          where: { id: leagueId },
          include: { memberships: { include: { roster: true } } },
        });
        if (!league) return "idle";
        const clock = onTheClock(league);
        const member = clock ? league.memberships.find((m) => m.id === clock.id) : undefined;
        const drafted = await tx.draftPick.findMany({
          where: { leagueId },
          select: { fighterId: true },
        });
        const pool = await tx.fighter.findMany({ where: { active: true } });
        const now = new Date();
        const prepared = prepareAutoPick(
          {
            status: league.status,
            currentPickIndex: league.currentPickIndex,
            pickDeadline: league.pickDeadline,
            pickClockSeconds: league.pickClockSeconds,
            teamCount: league.memberships.length,
            onTheClockMembershipId: member?.id ?? null,
            onTheClockDraftPosition: member?.draftPosition ?? null,
            filledSlots: member?.roster.map((r) => r.slot) ?? [],
            takenFighterIds: drafted.map((p) => p.fighterId),
          },
          pool.map(toPickFighter),
          now,
        );
        if (prepared.action === "idle") return "idle";
        if (prepared.action === "error") throw new DraftError(prepared.reason);

        await tx.draftPick.create({
          data: {
            leagueId,
            pickNumber: prepared.pickNumber,
            membershipId: prepared.membershipId,
            fighterId: prepared.fighterId,
            slot: prepared.slot,
            autoPick: true,
          },
        });
        await tx.rosterSlot.create({
          data: {
            membershipId: prepared.membershipId,
            slot: prepared.slot,
            fighterId: prepared.fighterId,
            pickNumber: prepared.pickNumber,
          },
        });
        await tx.league.update({
          where: { id: leagueId },
          data: {
            currentPickIndex: prepared.nextIndex,
            pickDeadline: prepared.nextDeadline,
            status: prepared.nextStatus,
          },
        });
        return "picked";
      });
    } catch (err) {
      if (err instanceof DraftError && err.message === "Pick already processed.") continue;
      if (isUniqueConflict(err)) continue;
      throw err;
    }
    if (outcome !== "picked") return;
  }
}

/** Commissioner skip: expire only the pick index that was on the clock when the click was read. */
export async function forceCurrentPick(leagueId: string, expectedIndex: number) {
  await prisma.$transaction(async (tx) => {
    await lockLeague(tx, leagueId);
    const league = await tx.league.findUnique({ where: { id: leagueId } });
    if (!league || league.status !== "DRAFTING") return;
    if (league.currentPickIndex !== expectedIndex) return;
    await tx.league.update({
      where: { id: leagueId },
      data: { pickDeadline: new Date(0) },
    });
  });
  await maybeAutoPick(leagueId);
}

/** Cron/poll backstop for leagues whose rooms are empty. One expired pick per league per call unless the new clock is already due. */
export async function tickExpiredDrafts(now = new Date()) {
  const leagues = await prisma.league.findMany({
    where: { status: "DRAFTING", pickDeadline: { lte: now } },
    select: { id: true },
  });
  const ticked: string[] = [];
  const errors: { leagueId: string; error: string }[] = [];
  for (const league of leagues) {
    try {
      await maybeAutoPick(league.id);
      ticked.push(league.id);
    } catch (err) {
      errors.push({
        leagueId: league.id,
        error: err instanceof Error ? err.message : "Auto-pick failed.",
      });
    }
  }
  return { ticked, errors };
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
