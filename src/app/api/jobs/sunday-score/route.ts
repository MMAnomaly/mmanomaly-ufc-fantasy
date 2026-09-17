import { NextRequest, NextResponse } from "next/server";
import { runSundayScoringJob } from "@/lib/ufcstats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** UFC Stats ingest of a full card can exceed Hobby defaults; raise on Pro if needed. */
export const maxDuration = 60;

async function handleSundayScore(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runSundayScoringJob("http-cron");
    return NextResponse.json({ ok: true, eventId: result.eventId, log: result.log });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scoring job failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Vercel Cron invokes this path with GET and `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  return handleSundayScore(request);
}

/** Manual / platform schedulers may POST the same path with the same bearer token. */
export async function POST(request: NextRequest) {
  return handleSundayScore(request);
}
