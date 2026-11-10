import "server-only";

import { prisma } from "./prisma";
import { eventCountsForSeason, isSeededBaseline, seasonPhase, seasonPodium } from "./season";

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
  const allScores = fighterIds.length
    ? await prisma.fantasyScore.findMany({
        where: { fighterId: { in: fighterIds } },
        include: { event: { include: { _count: { select: { fights: true } } } } },
      })
    : [];
  const scores = allScores.filter((score) =>
    eventCountsForSeason(
      { ...score.event, fightCount: score.event._count.fights },
      league.seasonStart,
      league.seasonEnd,
    ),
  );
  const fightNights = scores.filter(
    (score) => !isSeededBaseline({ ...score.event, fightCount: score.event._count.fights }),
  );

  const latestEventDate = fightNights.reduce<Date | null>((acc, score) => {
    if (!acc || score.event.date > acc) return score.event.date;
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
          weightClass: slot.fighter.weightClass,
          record: slot.fighter.record,
          nextBoutJson: slot.fighter.nextBoutJson,
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
      avatarUrl: m.avatarUrl,
      displayName: m.user.displayName,
      draftPosition: m.draftPosition,
      total,
      lastEvent,
      roster,
    };
  });

  rows.sort((a, b) => b.total - a.total || a.draftPosition - b.draftPosition);
  const ranked = rows.map((row, index) => ({ ...row, rank: index + 1 }));
  const phase = seasonPhase(new Date(), league.seasonStart, league.seasonEnd);
  const podium =
    phase.phase === "after"
      ? seasonPodium(ranked).map((spot) => ({
          place: spot.place,
          membershipId: spot.row.membershipId,
          teamName: spot.row.teamName,
          total: spot.row.total,
        }))
      : [];
  return {
    leagueName: league.name,
    latestEventDate: latestEventDate?.toISOString() ?? null,
    seasonLabel: phase.phase === "undated" ? null : phase.label,
    podium,
    rows: ranked,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
