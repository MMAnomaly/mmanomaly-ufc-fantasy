"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadSampleEvent } from "@/lib/sample-event";
import { ingestEventByUrl, ingestLatestCompletedEvent, persistAndScoreEvent } from "@/lib/ufcstats";

async function assertCommissioner(leagueId: string) {
  const user = await requireUser();
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league || league.commissionerId !== user.id) {
    throw new Error("Commissioner only.");
  }
  return { user, league };
}

export async function scoreSampleEventAction(leagueId: string) {
  await assertCommissioner(leagueId);
  const result = await persistAndScoreEvent(loadSampleEvent(), "admin-sample");
  revalidatePath(`/leagues/${leagueId}/standings`);
  revalidatePath(`/leagues/${leagueId}/admin`);
  revalidatePath(`/leagues/${leagueId}/roster`);
  return { ok: true as const, log: result.log };
}

export async function ingestLatestEventAction(leagueId: string) {
  await assertCommissioner(leagueId);
  try {
    const parsed = await ingestLatestCompletedEvent();
    const result = await persistAndScoreEvent(parsed, "admin-ufcstats");
    revalidatePath(`/leagues/${leagueId}/standings`);
    revalidatePath(`/leagues/${leagueId}/admin`);
    return { ok: true as const, log: result.log };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Ingest failed." };
  }
}

export async function ingestEventUrlAction(leagueId: string, url: string) {
  await assertCommissioner(leagueId);
  if (!url.includes("ufcstats.com")) return { ok: false as const, error: "URL must be a ufcstats.com event page." };
  try {
    const parsed = await ingestEventByUrl(url);
    const result = await persistAndScoreEvent(parsed, "admin-ufcstats-url");
    revalidatePath(`/leagues/${leagueId}/standings`);
    revalidatePath(`/leagues/${leagueId}/admin`);
    return { ok: true as const, log: result.log };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Ingest failed." };
  }
}
