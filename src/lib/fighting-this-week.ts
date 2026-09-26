import "server-only";

import { prisma } from "./prisma";
import {
  buildFightingThisWeek,
  explicitCardFromStored,
  type FightingTeamInput,
  type FightingThisWeek,
} from "./upcoming-card";

export async function getFightingThisWeek(
  teams: FightingTeamInput[],
  now = new Date(),
): Promise<FightingThisWeek> {
  const [cards, fighters] = await Promise.all([
    prisma.ufcCard.findMany({ orderBy: [{ date: "asc" }, { sortOrder: "asc" }] }),
    prisma.fighter.findMany({
      where: { nextBoutJson: { not: null } },
      select: { nextBoutJson: true },
    }),
  ]);

  const explicitCards = cards.flatMap((card) => {
    const parsed = explicitCardFromStored(card);
    return parsed ? [parsed] : [];
  });

  return buildFightingThisWeek({
    teams,
    explicitCards,
    fighterNextBouts: fighters.map((fighter) => fighter.nextBoutJson),
    now,
  });
}
