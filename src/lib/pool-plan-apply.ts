import type { PrismaClient } from "@prisma/client";
import {
  computePoolPlan,
  parsePoolPlan,
  sameAliasSet,
  type PoolPlanDiff,
  type PoolSnapshot,
  PoolPlanError,
} from "./pool-plan";

export { PoolPlanError };

export async function loadPoolSnapshot(db: PrismaClient): Promise<PoolSnapshot> {
  const [fighters, rosterSlots, picks, scores, statLines, fights] = await Promise.all([
    db.fighter.findMany({
      select: {
        id: true,
        name: true,
        classKey: true,
        slotKey: true,
        sex: true,
        weightClass: true,
        active: true,
        tapologyUrl: true,
        record: true,
        activityNotes: true,
        aliases: { select: { alias: true } },
      },
    }),
    db.rosterSlot.findMany({ select: { id: true, fighterId: true, membershipId: true, slot: true } }),
    db.draftPick.findMany({ select: { id: true, leagueId: true, fighterId: true } }),
    db.fantasyScore.findMany({ select: { id: true, eventId: true, fighterId: true, points: true } }),
    db.fightStatLine.findMany({ select: { id: true, fightId: true, fighterId: true, fighterName: true } }),
    db.fight.findMany({ select: { id: true, fighter1Id: true, fighter2Id: true } }),
  ]);
  return {
    fighters: fighters.map((fighter) => ({
      id: fighter.id,
      name: fighter.name,
      classKey: fighter.classKey,
      slotKey: fighter.slotKey,
      sex: fighter.sex,
      weightClass: fighter.weightClass,
      active: fighter.active,
      tapologyUrl: fighter.tapologyUrl,
      record: fighter.record,
      activityNotes: fighter.activityNotes,
      aliases: fighter.aliases.map((alias) => alias.alias),
    })),
    rosterSlots,
    picks,
    scores,
    statLines,
    fights,
  };
}

export async function savePoolSnapshot(db: PrismaClient, before: PoolSnapshot, next: PoolSnapshot): Promise<void> {
  const beforeFighters = new Map(before.fighters.map((fighter) => [fighter.id, fighter]));
  const nextFighters = new Map(next.fighters.map((fighter) => [fighter.id, fighter]));
  const nextScoreIds = new Set(next.scores.map((score) => score.id));
  const nextPickIds = new Set(next.picks.map((pick) => pick.id));
  const nextStatIds = new Set(next.statLines.map((line) => line.id));

  await db.$transaction(
    async (tx) => {
      for (const score of before.scores) {
        if (!nextScoreIds.has(score.id)) await tx.fantasyScore.delete({ where: { id: score.id } });
      }
      for (const score of next.scores) {
        const previous = before.scores.find((row) => row.id === score.id);
        if (previous && previous.fighterId !== score.fighterId) {
          await tx.fantasyScore.update({ where: { id: score.id }, data: { fighterId: score.fighterId, points: score.points } });
        }
      }
      for (const pick of before.picks) {
        if (!nextPickIds.has(pick.id)) await tx.draftPick.delete({ where: { id: pick.id } });
      }
      for (const pick of next.picks) {
        const previous = before.picks.find((row) => row.id === pick.id);
        if (previous && previous.fighterId !== pick.fighterId) {
          await tx.draftPick.update({ where: { id: pick.id }, data: { fighterId: pick.fighterId } });
        }
      }
      for (const line of before.statLines) {
        if (!nextStatIds.has(line.id)) await tx.fightStatLine.delete({ where: { id: line.id } });
      }
      for (const line of next.statLines) {
        const previous = before.statLines.find((row) => row.id === line.id);
        if (previous && previous.fighterId !== line.fighterId) {
          await tx.fightStatLine.update({ where: { id: line.id }, data: { fighterId: line.fighterId } });
        }
      }
      for (const slot of next.rosterSlots) {
        const previous = before.rosterSlots.find((row) => row.id === slot.id);
        if (previous && previous.fighterId !== slot.fighterId) {
          await tx.rosterSlot.update({ where: { id: slot.id }, data: { fighterId: slot.fighterId } });
        }
      }
      for (const fight of next.fights) {
        const previous = before.fights.find((row) => row.id === fight.id);
        if (!previous) continue;
        if (previous.fighter1Id !== fight.fighter1Id || previous.fighter2Id !== fight.fighter2Id) {
          await tx.fight.update({
            where: { id: fight.id },
            data: { fighter1Id: fight.fighter1Id, fighter2Id: fight.fighter2Id },
          });
        }
      }
      for (const fighter of before.fighters) {
        if (!nextFighters.has(fighter.id)) await tx.fighter.delete({ where: { id: fighter.id } });
      }
      for (const fighter of next.fighters) {
        if (beforeFighters.has(fighter.id)) continue;
        await tx.fighter.create({
          data: {
            id: fighter.id,
            name: fighter.name,
            classKey: fighter.classKey,
            slotKey: fighter.slotKey,
            sex: fighter.sex,
            weightClass: fighter.weightClass,
            record: fighter.record,
            active: fighter.active,
            tapologyUrl: fighter.tapologyUrl,
            activityNotes: fighter.activityNotes,
          },
        });
      }
      for (const fighter of next.fighters) {
        const previous = beforeFighters.get(fighter.id);
        if (!previous) continue;
        const data: {
          name?: string;
          classKey?: string;
          slotKey?: string;
          sex?: string;
          weightClass?: string;
          active?: boolean;
          tapologyUrl?: string | null;
          record?: string | null;
          activityNotes?: string | null;
        } = {};
        if (previous.name !== fighter.name) data.name = fighter.name;
        if (previous.classKey !== fighter.classKey) data.classKey = fighter.classKey;
        if (previous.slotKey !== fighter.slotKey) data.slotKey = fighter.slotKey;
        if (previous.sex !== fighter.sex) data.sex = fighter.sex;
        if (previous.weightClass !== fighter.weightClass) data.weightClass = fighter.weightClass;
        if (previous.active !== fighter.active) data.active = fighter.active;
        if (previous.tapologyUrl !== fighter.tapologyUrl) data.tapologyUrl = fighter.tapologyUrl;
        if (previous.record !== fighter.record) data.record = fighter.record;
        if (previous.activityNotes !== fighter.activityNotes) data.activityNotes = fighter.activityNotes;
        if (Object.keys(data).length > 0) await tx.fighter.update({ where: { id: fighter.id }, data });
      }
      for (const fighter of next.fighters) {
        const previous = beforeFighters.get(fighter.id);
        if (previous && sameAliasSet(previous.aliases, fighter.aliases)) continue;
        await tx.fighterAlias.deleteMany({ where: { fighterId: fighter.id } });
        if (fighter.aliases.length > 0) {
          await tx.fighterAlias.createMany({
            data: fighter.aliases.map((alias) => ({ fighterId: fighter.id, alias })),
          });
        }
      }
    },
    { timeout: 60_000 },
  );
}

export async function runPoolPlan(
  db: PrismaClient,
  data: unknown,
  dryRun: boolean,
): Promise<PoolPlanDiff & { dryRun: boolean }> {
  const plan = parsePoolPlan(data);
  const before = await loadPoolSnapshot(db);
  const { next, diff } = computePoolPlan(before, plan);
  if (!dryRun) {
    if (!diff.standingsUnchanged) {
      throw new PoolPlanError("Pool plan would change season standings totals; no rows were written.");
    }
    await savePoolSnapshot(db, before, next);
  }
  return { ...diff, dryRun };
}
