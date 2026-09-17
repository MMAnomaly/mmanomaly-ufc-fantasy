import { notFound } from "next/navigation";
import { DraftRoom } from "@/components/draft-room";
import { requireUser } from "@/lib/auth";
import { serializeDraftState } from "@/lib/draft-engine";

export default async function DraftPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const user = await requireUser();
  const { leagueId } = await params;
  let state;
  try {
    state = await serializeDraftState(leagueId, user.id);
  } catch {
    notFound();
  }
  return <DraftRoom leagueId={leagueId} initial={state} />;
}
