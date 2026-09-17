import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { serializeDraftState } from "@/lib/draft-engine";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { leagueId } = await params;
  try {
    const state = await serializeDraftState(leagueId, session.id);
    return NextResponse.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load draft.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
