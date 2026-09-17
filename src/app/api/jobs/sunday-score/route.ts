import { NextRequest, NextResponse } from "next/server";
import { runSundayScoringJob } from "@/lib/ufcstats";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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
