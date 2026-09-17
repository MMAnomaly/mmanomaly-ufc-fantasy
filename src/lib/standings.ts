import "server-only";

import { prisma } from "./prisma";

export async function getStandings(leagueId: string) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      memberships: {
        include: {
          user: true,
          roster: { include: { fighter: true } },
        },
        orderBy: { draftPosition: "asc" },
      },
    },
  });
  if (!league) return null;

  const fighterIds = league.memberships.flatMap((m) => m.roster.map((r) => r.fighterId));
  const scores = fighterIds.length
    ? await prisma.fantasyScore.findMany({
        where: { fighterId: { in: fighterIds } },
        include: { event: true },
      })
    : [];

  const latestEventDate = scores.reduce<Date | null>((acc, s) => {
    if (!acc || s.event.date > acc) return s.event.date;
    return acc;
  }, null);

  const rows = league.memberships.map((m) => {
    const roster = m.roster.map((slot) => {
      const fighterScores = scores.filter((s) => s.fighterId === slot.fighterId);
      const total = fighterScores.reduce((sum, s) => sum + s.points, 0);
      const lastEvent = latestEventDate
        ? fighterScores
            .filter((s) => s.event.date.getTime() === latestEventDate.getTime())
            .reduce((sum, s) => sum + s.points, 0)
        : 0;
      return {
        slot: slot.slot,
        fighter: {
          id: slot.fighter.id,
          name: slot.fighter.name,
          classKey: slot.fighter.classKey,
          record: slot.fighter.record,
        },
        total: round2(total),
        lastEvent: round2(lastEvent),
      };
    });
    const total = round2(roster.reduce((sum, r) => sum + r.total, 0));
    const lastEvent = round2(roster.reduce((sum, r) => sum + r.lastEvent, 0));
    return {
      membershipId: m.id,
      teamName: m.teamName,
      displayName: m.user.displayName,
      draftPosition: m.draftPosition,
      total,
      lastEvent,
      roster,
    };
  });

  rows.sort((a, b) => b.total - a.total || a.draftPosition - b.draftPosition);
  return {
    leagueName: league.name,
    latestEventDate: latestEventDate?.toISOString() ?? null,
    rows: rows.map((row, index) => ({ ...row, rank: index + 1 })),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
