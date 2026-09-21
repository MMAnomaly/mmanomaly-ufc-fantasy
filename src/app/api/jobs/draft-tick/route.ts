import { NextRequest, NextResponse } from "next/server";
import { tickExpiredDrafts } from "@/lib/draft-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handleDraftTick(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await tickExpiredDrafts();
    return NextResponse.json({ ok: true, ticked: result.ticked.length, errors: result.errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Draft tick failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Vercel Cron invokes this path with GET and `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  return handleDraftTick(request);
}

/** Manual / platform schedulers may POST the same path with the same bearer token. */
export async function POST(request: NextRequest) {
  return handleDraftTick(request);
}
