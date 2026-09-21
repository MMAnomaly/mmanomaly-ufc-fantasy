"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, clearSession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { validatePasswordChange } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { disambiguateTeamName, isTeamNameConflict, isTeamNameTaken, TEAM_NAME_TAKEN } from "@/lib/team-membership";

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(2).max(40).optional(),
  teamName: z.string().min(2).max(40).optional(),
  inviteToken: z.string().optional(),
  next: z.string().optional(),
});

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function registerAction(_prev: unknown, formData: FormData) {
  const parsed = credentials.safeParse(formObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid registration." };
  }
  const { email, password, displayName, teamName, inviteToken, next } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return { error: "An account with that email already exists. Log in instead." };

  let invite = null;
  if (inviteToken) {
    invite = await prisma.invite.findUnique({
      where: { token: inviteToken },
      include: { league: { include: { memberships: true } } },
    });
    if (!invite || invite.revoked) return { error: "Invite link is invalid or revoked." };
    if (invite.league.status !== "SETUP") return { error: "This league is no longer accepting members." };
    if (invite.league.memberships.length >= invite.league.maxTeams) {
      return { error: "This league is full." };
    }
    if (teamName?.trim() && (await isTeamNameTaken(invite.leagueId, teamName.trim()))) {
      return { error: TEAM_NAME_TAKEN };
    }
  }

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      displayName: displayName?.trim() || email.split("@")[0],
    },
  });

  if (invite) {
    const explicit = teamName?.trim();
    const finalName = explicit
      ? explicit
      : await disambiguateTeamName(invite.leagueId, `${user.displayName}'s squad`);
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
      if (!isTeamNameConflict(error)) throw error;
      await createSession({ id: user.id, email: user.email, displayName: user.displayName });
      redirect(`/join/${invite.token}`);
    }
  }

  await createSession({ id: user.id, email: user.email, displayName: user.displayName });
  if (invite) redirect(`/leagues/${invite.leagueId}`);
  redirect(safeNext(next) || "/");
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const parsed = credentials.pick({ email: true, password: true, next: true, inviteToken: true }).safeParse(
    formObject(formData),
  );
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Email or password is incorrect." };
  }
  await createSession({ id: user.id, email: user.email, displayName: user.displayName });

  if (parsed.data.inviteToken) {
    const invite = await prisma.invite.findUnique({
      where: { token: parsed.data.inviteToken },
      include: { league: { include: { memberships: true } } },
    });
    if (invite && !invite.revoked && invite.league.status === "SETUP") {
      const already = invite.league.memberships.some((m) => m.userId === user.id);
      if (!already && invite.league.memberships.length < invite.league.maxTeams) {
        try {
          await prisma.membership.create({
            data: {
              leagueId: invite.leagueId,
              userId: user.id,
              teamName: await disambiguateTeamName(invite.leagueId, `${user.displayName}'s squad`),
              draftPosition: invite.league.memberships.length + 1,
            },
          });
        } catch (error) {
          if (!isTeamNameConflict(error)) throw error;
          redirect(`/join/${parsed.data.inviteToken}`);
        }
      }
      redirect(`/leagues/${invite.leagueId}`);
    }
  }

  redirect(safeNext(parsed.data.next) || "/");
}

export async function changePasswordAction(_prev: unknown, formData: FormData) {
  const session = await requireUser();
  const parsed = validatePasswordChange({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.ok) return { error: parsed.error };

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user || !(await verifyPassword(parsed.currentPassword, user.passwordHash))) {
    return { error: "Current password is incorrect." };
  }
  if (parsed.newPassword === parsed.currentPassword) {
    return { error: "New password must be different from the current password." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.newPassword) },
  });
  return { message: "Password updated." };
}

export async function logoutAction() {
  await clearSession();
  redirect("/");
}

function safeNext(next?: string) {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}
