import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { sameTeamName, TEAM_NAME_MAX } from "./team-profile";

export const TEAM_NAME_TAKEN = "That team name is already taken in this league.";

export async function isTeamNameTaken(leagueId: string, name: string, exceptMembershipId?: string) {
  const others = await prisma.membership.findMany({
    where: {
      leagueId,
      ...(exceptMembershipId ? { id: { not: exceptMembershipId } } : {}),
    },
    select: { teamName: true },
  });
  return others.some((row) => sameTeamName(row.teamName, name));
}

export function isTeamNameConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Auto-generated names (login join, empty fallback) pick a free variant instead of failing. */
export async function disambiguateTeamName(leagueId: string, preferred: string) {
  const base = preferred.trim().slice(0, TEAM_NAME_MAX).trim() || "Squad";
  if (!(await isTeamNameTaken(leagueId, base))) return base;
  for (let n = 2; n < 40; n += 1) {
    const suffix = ` ${n}`;
    const candidate = `${base.slice(0, TEAM_NAME_MAX - suffix.length).trimEnd()}${suffix}`;
    if (!(await isTeamNameTaken(leagueId, candidate))) return candidate;
  }
  const suffix = ` ${Date.now().toString(36).slice(-4)}`;
  return `${base.slice(0, TEAM_NAME_MAX - suffix.length).trimEnd()}${suffix}`;
}
