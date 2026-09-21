"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { avatarUploadMode, deleteStoredAvatar, storeAvatarFile } from "@/lib/avatar-store";
import { prisma } from "@/lib/prisma";
import { isTeamNameConflict, isTeamNameTaken, TEAM_NAME_TAKEN } from "@/lib/team-membership";
import { validateAvatarBytes, validateAvatarUrl, validateTeamName } from "@/lib/team-profile";

export type TeamSettingsState = { error?: string; message?: string } | null;

function revalidateLeague(leagueId: string) {
  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/settings`);
  revalidatePath(`/leagues/${leagueId}/standings`);
  revalidatePath(`/leagues/${leagueId}/draft`);
  revalidatePath(`/leagues/${leagueId}/roster`);
  revalidatePath(`/leagues/${leagueId}/admin`);
  revalidatePath("/");
}

async function ownMembership(leagueId: string) {
  const user = await requireUser();
  const membership = await prisma.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  return { user, membership };
}

export async function updateTeamNameAction(
  leagueId: string,
  _prev: TeamSettingsState,
  formData: FormData,
): Promise<TeamSettingsState> {
  const { membership } = await ownMembership(leagueId);
  if (!membership) return { error: "You are not a member of this league." };

  const parsed = validateTeamName(String(formData.get("teamName") ?? ""));
  if (!parsed.ok) return { error: parsed.error };
  if (parsed.name === membership.teamName) return { message: "Team name saved." };

  if (await isTeamNameTaken(leagueId, parsed.name, membership.id)) {
    return { error: TEAM_NAME_TAKEN };
  }

  try {
    await prisma.membership.update({
      where: { id: membership.id },
      data: { teamName: parsed.name },
    });
  } catch (error) {
    if (isTeamNameConflict(error)) return { error: TEAM_NAME_TAKEN };
    throw error;
  }

  revalidateLeague(leagueId);
  return { message: "Team name saved." };
}

export async function updateTeamAvatarAction(
  leagueId: string,
  _prev: TeamSettingsState,
  formData: FormData,
): Promise<TeamSettingsState> {
  const { membership } = await ownMembership(leagueId);
  if (!membership) return { error: "You are not a member of this league." };

  const remove = formData.get("remove") === "1";
  const file = formData.get("avatar");
  const urlRaw = String(formData.get("avatarUrl") ?? "");

  if (remove) {
    await prisma.membership.update({ where: { id: membership.id }, data: { avatarUrl: null } });
    await deleteStoredAvatar(membership.avatarUrl, membership.id);
    revalidateLeague(leagueId);
    return { message: "Picture removed." };
  }

  if (file instanceof File && file.size > 0) {
    if (avatarUploadMode() === "url-only") {
      return { error: "File upload needs BLOB_READ_WRITE_TOKEN. Paste a public image URL instead." };
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const checked = validateAvatarBytes(bytes);
    if (!checked.ok) return { error: checked.error };
    let stored: string;
    try {
      stored = await storeAvatarFile(membership.id, bytes, checked.ext, checked.contentType);
    } catch {
      return { error: "Could not store that image. Try a public image URL instead." };
    }
    try {
      await prisma.membership.update({ where: { id: membership.id }, data: { avatarUrl: stored } });
    } catch (error) {
      await deleteStoredAvatar(stored, membership.id);
      throw error;
    }
    await deleteStoredAvatar(membership.avatarUrl, membership.id);
    revalidateLeague(leagueId);
    return { message: "Picture saved." };
  }

  if (urlRaw.trim()) {
    const parsed = validateAvatarUrl(urlRaw);
    if (!parsed.ok) return { error: parsed.error };
    await prisma.membership.update({ where: { id: membership.id }, data: { avatarUrl: parsed.url } });
    if (membership.avatarUrl !== parsed.url) {
      await deleteStoredAvatar(membership.avatarUrl, membership.id);
    }
    revalidateLeague(leagueId);
    return { message: "Picture saved." };
  }

  return { error: "Choose an image, paste a URL, or remove the current picture." };
}
