"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  deadlineFrom,
  DEFAULT_PICK_CLOCK,
  DEFAULT_TEAMS,
  MAX_TEAMS,
  MIN_START_TEAMS,
  MIN_TEAMS,
  shuffle,
} from "@/lib/draft";
import { prisma } from "@/lib/prisma";
import { disambiguateTeamName, isTeamNameConflict, isTeamNameTaken, TEAM_NAME_TAKEN } from "@/lib/team-membership";

const createSchema = z.object({
  name: z.string().min(3).max(60),
  maxTeams: z.coerce.number().int().min(MIN_TEAMS).max(MAX_TEAMS).default(DEFAULT_TEAMS),
  pickClockSeconds: z.coerce.number().int().min(15).max(300).default(DEFAULT_PICK_CLOCK),
  teamName: z.string().min(2).max(40),
});

export async function createLeagueAction(_prev: unknown, formData: FormData) {
  const user = await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check league settings." };

  const league = await prisma.league.create({
    data: {
      name: parsed.data.name.trim(),
      commissionerId: user.id,
      maxTeams: parsed.data.maxTeams,
      pickClockSeconds: parsed.data.pickClockSeconds,
      memberships: {
        create: {
          userId: user.id,
          teamName: parsed.data.teamName.trim(),
          draftPosition: 1,
        },
      },
      invites: {
        create: {
          createdById: user.id,
          token: randomBytes(12).toString("hex"),
        },
      },
    },
  });
  redirect(`/leagues/${league.id}`);
}

export async function joinLeagueAction(token: string, teamName: string) {
  const user = await requireUser();
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { league: { include: { memberships: true } } },
  });
  if (!invite || invite.revoked) return { error: "Invite link is invalid or revoked." };
  if (invite.league.status !== "SETUP") return { error: "Draft already started — roster is locked." };
  if (invite.league.memberships.some((m) => m.userId === user.id)) {
    redirect(`/leagues/${invite.leagueId}`);
  }
  if (invite.league.memberships.length >= invite.league.maxTeams) {
    return { error: "This league is full." };
  }
  const trimmedName = teamName.trim();
  const finalName = trimmedName
    ? trimmedName
    : await disambiguateTeamName(invite.leagueId, `${user.displayName}'s squad`);
  if (trimmedName && (await isTeamNameTaken(invite.leagueId, trimmedName))) {
    return { error: TEAM_NAME_TAKEN };
  }
  try {
    await prisma.membership.create({
      data: {
        leagueId: invite.leagueId,
        userId: user.id,
        teamName: finalName,
        draftPosition: invite.league.memberships.length + 1,
      },
    });
  } catch (error) {
    if (isTeamNameConflict(error)) return { error: TEAM_NAME_TAKEN };
    throw error;
  }
  revalidatePath(`/leagues/${invite.leagueId}`);
  redirect(`/leagues/${invite.leagueId}`);
}

export async function createInviteAction(leagueId: string) {
  const user = await requireUser();
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league || league.commissionerId !== user.id) return { error: "Commissioner only." };
  const invite = await prisma.invite.create({
    data: { leagueId, createdById: user.id, token: randomBytes(12).toString("hex") },
  });
  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/admin`);
  return { token: invite.token };
}

export async function revokeInviteAction(leagueId: string, inviteId: string) {
  const user = await requireUser();
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league || league.commissionerId !== user.id) return { error: "Commissioner only." };
  await prisma.invite.update({ where: { id: inviteId }, data: { revoked: true } });
  revalidatePath(`/leagues/${leagueId}/admin`);
}

export async function updateLeagueSettingsAction(leagueId: string, formData: FormData) {
  const user = await requireUser();
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { memberships: true },
  });
  if (!league || league.commissionerId !== user.id) return { error: "Commissioner only." };

  const name = String(formData.get("name") ?? league.name).trim();
  const pickClockSeconds = Number(formData.get("pickClockSeconds") ?? league.pickClockSeconds);
  const maxTeams = Number(formData.get("maxTeams") ?? league.maxTeams);
  if (name.length < 3) return { error: "League name is too short." };
  if (pickClockSeconds < 15 || pickClockSeconds > 300) return { error: "Pick clock must be 15–300 seconds." };
  if (maxTeams < MIN_TEAMS || maxTeams > MAX_TEAMS) return { error: "League size must be 4–12." };
  if (maxTeams < league.memberships.length) {
    return { error: "Max teams cannot be below current membership." };
  }
  if (league.status !== "SETUP" && maxTeams !== league.maxTeams) {
    return { error: "League size is locked after the draft starts." };
  }

  await prisma.league.update({
    where: { id: leagueId },
    data: { name, pickClockSeconds, maxTeams },
  });
  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/admin`);
}

export async function randomizeDraftOrderAction(leagueId: string) {
  const user = await requireUser();
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { memberships: true },
  });
  if (!league || league.commissionerId !== user.id) return { error: "Commissioner only." };
  if (league.status === "IN_SEASON") return { error: "Draft is complete." };
  const shuffled = shuffle(league.memberships);
  await prisma.$transaction(
    shuffled.map((m, index) =>
      prisma.membership.update({ where: { id: m.id }, data: { draftPosition: index + 1 } }),
    ),
  );
  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/admin`);
  revalidatePath(`/leagues/${leagueId}/draft`);
}

export async function setDraftOrderAction(leagueId: string, membershipIds: string[]) {
  const user = await requireUser();
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { memberships: true },
  });
  if (!league || league.commissionerId !== user.id) return { error: "Commissioner only." };
  if (league.status === "IN_SEASON") return { error: "Draft is complete." };
  const expected = new Set(league.memberships.map((m) => m.id));
  if (membershipIds.length !== expected.size || membershipIds.some((id) => !expected.has(id))) {
    return { error: "Order must include every team exactly once." };
  }
  await prisma.$transaction(
    membershipIds.map((id, index) =>
      prisma.membership.update({ where: { id }, data: { draftPosition: index + 1 } }),
    ),
  );
  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/admin`);
  revalidatePath(`/leagues/${leagueId}/draft`);
}

export async function startDraftAction(leagueId: string) {
  const user = await requireUser();
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { memberships: { orderBy: { createdAt: "asc" } } },
  });
  if (!league || league.commissionerId !== user.id) return { error: "Commissioner only." };
  if (league.status === "IN_SEASON") return { error: "Draft already complete." };
  if (league.status === "DRAFTING") return { error: "Draft is already live." };
  if (league.memberships.length < MIN_START_TEAMS) {
    return { error: `Need at least ${MIN_START_TEAMS} teams to start.` };
  }
  const unordered = league.memberships.every((m) => m.draftPosition === 0);
  if (unordered) {
    await prisma.$transaction(
      league.memberships.map((m, index) =>
        prisma.membership.update({ where: { id: m.id }, data: { draftPosition: index + 1 } }),
      ),
    );
  }
  await prisma.league.update({
    where: { id: leagueId },
    data: {
      status: "DRAFTING",
      pickDeadline: deadlineFrom(new Date(), league.pickClockSeconds),
    },
  });
  revalidatePath(`/leagues/${leagueId}`);
  redirect(`/leagues/${leagueId}/draft`);
}

export async function pauseDraftAction(leagueId: string) {
  const user = await requireUser();
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league || league.commissionerId !== user.id) return { error: "Commissioner only." };
  if (league.status !== "DRAFTING") return { error: "Draft is not live." };
  await prisma.league.update({
    where: { id: leagueId },
    data: { status: "PAUSED", pickDeadline: null },
  });
  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/draft`);
  revalidatePath(`/leagues/${leagueId}/admin`);
}

export async function resumeDraftAction(leagueId: string) {
  const user = await requireUser();
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league || league.commissionerId !== user.id) return { error: "Commissioner only." };
  if (league.status !== "PAUSED") return { error: "Draft is not paused." };
  await prisma.league.update({
    where: { id: leagueId },
    data: {
      status: "DRAFTING",
      pickDeadline: deadlineFrom(new Date(), league.pickClockSeconds),
    },
  });
  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/draft`);
  revalidatePath(`/leagues/${leagueId}/admin`);
}
