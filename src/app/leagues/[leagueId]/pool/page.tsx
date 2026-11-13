import { notFound } from "next/navigation";
import { FighterPool } from "@/components/fighter-pool";
import { requireUser } from "@/lib/auth";
import { buildFighterPool, type PoolCardInput, type PoolFighterInput } from "@/lib/fighter-pool";
import { prisma } from "@/lib/prisma";
import { losAngelesDateKey } from "@/lib/upcoming-card";

export default async function FighterPoolPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const user = await requireUser();
  const { leagueId } = await params;
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      commissionerId: true,
      memberships: { where: { userId: user.id }, select: { id: true }, take: 1 },
    },
  });
  if (!league) notFound();
  const isCommissioner = league.commissionerId === user.id;
  if (league.memberships.length === 0 && !isCommissioner) notFound();

  const [fighters, cards] = await Promise.all([
    prisma.fighter.findMany({
      where: isCommissioner ? {} : { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        classKey: true,
        weightClass: true,
        record: true,
        lastFightDate: true,
        lastFightClass: true,
        nextBoutJson: true,
        tapologyUrl: true,
        active: true,
        activityNotes: true,
        aliases: { select: { alias: true }, orderBy: { alias: "asc" } },
        picks: {
          where: { leagueId },
          select: { membership: { select: { teamName: true } } },
          take: 1,
        },
      },
    }),
    prisma.ufcCard.findMany({
      select: { name: true, date: true, boutsJson: true },
    }),
  ]);

  const view = buildFighterPool({
    fighters: fighters.map(
      (fighter): PoolFighterInput => ({
        id: fighter.id,
        name: fighter.name,
        classKey: fighter.classKey,
        weightClass: fighter.weightClass,
        record: fighter.record,
        lastFightDate: fighter.lastFightDate,
        lastFightClass: fighter.lastFightClass,
        nextBoutJson: fighter.nextBoutJson,
        tapologyUrl: fighter.tapologyUrl,
        active: fighter.active,
        activityNotes: fighter.activityNotes,
        draftedBy: fighter.picks[0]?.membership.teamName ?? null,
        aliases: fighter.aliases.map((alias) => alias.alias),
      }),
    ),
    cards: cards satisfies PoolCardInput[],
    includeInactive: isCommissioner,
    today: losAngelesDateKey(new Date()),
  });

  return <FighterPool active={view.active} inactive={view.inactive} />;
}
