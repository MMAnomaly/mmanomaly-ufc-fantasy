"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { DraftError, makeManualPick, maybeAutoPick } from "@/lib/draft-engine";
import { prisma } from "@/lib/prisma";

export async function makePickAction(leagueId: string, fighterId: string, slot: string) {
  const user = await requireUser();
  try {
    await makeManualPick({ leagueId, userId: user.id, fighterId, slot });
    revalidatePath(`/leagues/${leagueId}/draft`);
    revalidatePath(`/leagues/${leagueId}/roster`);
    return { ok: true as const };
  } catch (err) {
    const message = err instanceof DraftError ? err.message : "Could not make that pick.";
    return { ok: false as const, error: message };
  }
}

export async function forceAutoPickAction(leagueId: string) {
  const user = await requireUser();
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league || league.commissionerId !== user.id) return { error: "Commissioner only." };
  if (league.status !== "DRAFTING") return { error: "Draft is not live." };
  await prisma.league.update({
    where: { id: leagueId },
    data: { pickDeadline: new Date(0) },
  });
  await maybeAutoPick(leagueId);
  revalidatePath(`/leagues/${leagueId}/draft`);
}
