import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AfrImportError, parseAfrResults } from "@/lib/afr-results";
import { importAfrCards } from "@/lib/afr-pool";
import { prisma } from "@/lib/prisma";
import { persistAndScoreEvent } from "@/lib/ufcstats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Fighter-pool upserts for a full export can run longer than the platform default. */
export const maxDuration = 60;

function bearerAuthorized(header: string | null, secret: string): boolean {
  const prefix = "Bearer ";
  const token = header?.startsWith(prefix) ? header.slice(prefix.length) : "";
  const presented = createHash("sha256").update(token).digest();
  const expected = createHash("sha256").update(secret).digest();
  const match = timingSafeEqual(presented, expected);
  return Boolean(header?.startsWith(prefix)) && token.length > 0 && match;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_IMPORT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ADMIN_IMPORT_SECRET is not set" }, { status: 503 });
  }
  if (!bearerAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isRecord(body) || (body.kind !== "results" && body.kind !== "cards")) {
    return NextResponse.json({ error: 'Body must be { kind: "results" | "cards", data }' }, { status: 400 });
  }

  try {
    if (body.kind === "results") return await importResults(body.data);
    return await importCards(body.data);
  } catch (err) {
    if (err instanceof AfrImportError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Import failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function importResults(data: unknown) {
  const parsed = parseAfrResults(data);
  const existing = await prisma.ufcEvent.findUnique({
    where: { externalId: parsed.externalId },
    select: { id: true, name: true, scores: { select: { id: true }, take: 1 } },
  });
  if (existing && existing.scores.length > 0) {
    return NextResponse.json({
      alreadyScored: true,
      eventId: existing.id,
      externalId: parsed.externalId,
      name: existing.name,
    });
  }

  const result = await persistAndScoreEvent(parsed, "afr-ufcstats");
  const scoredRows = await prisma.fantasyScore.findMany({
    where: { eventId: result.eventId },
    select: { points: true, fighter: { select: { name: true } } },
    orderBy: { fighter: { name: "asc" } },
  });
  const unmatchedRows = await prisma.fightStatLine.findMany({
    where: { fighterId: null, fight: { eventId: result.eventId } },
    select: { fighterName: true },
    orderBy: { fighterName: "asc" },
  });

  return NextResponse.json({
    ok: true,
    alreadyScored: false,
    eventId: result.eventId,
    externalId: parsed.externalId,
    name: parsed.name,
    scored: scoredRows.map((row) => ({ name: row.fighter.name, points: row.points })),
    unmatched: [...new Set(unmatchedRows.map((row) => row.fighterName))],
  });
}

async function importCards(data: unknown) {
  if (!isRecord(data) || !("fightersByClass" in data) || !("upcomingCard" in data)) {
    throw new AfrImportError("cards data must be { fightersByClass, upcomingCard }");
  }
  const result = await importAfrCards(prisma, {
    fightersByClass: data.fightersByClass,
    upcomingCard: data.upcomingCard,
  });
  return NextResponse.json({
    ok: true,
    fightersUpserted: result.fighters.upserted,
    fightersDeactivated: result.fighters.deactivated,
    rosteredFightersRetained: result.fighters.rosteredRetained,
    skippedClasses: result.fighters.skippedClasses,
    cardsUpserted: result.cards.upserted,
    cardsRemoved: result.cards.removed,
    cardsUnchanged: result.cards.unchanged,
  });
}
