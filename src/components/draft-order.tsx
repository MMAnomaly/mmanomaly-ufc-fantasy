"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { randomizeDraftOrderAction, setDraftOrderAction } from "@/app/actions/leagues";
import { TeamAvatar } from "./team-avatar";

type Team = {
  id: string;
  teamName: string;
  avatarUrl?: string | null;
  displayName: string;
  draftPosition: number;
};

export function DraftOrderEditor({ leagueId, teams }: { leagueId: string; teams: Team[] }) {
  const [order, setOrder] = useState(teams.slice().sort((a, b) => a.draftPosition - b.draftPosition));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  function move(index: number, dir: -1 | 1) {
    const next = [...order];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setOrder(next);
  }

  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {order.map((team, index) => (
          <li className="flex items-center gap-2 rounded-sm border border-line bg-ink px-3 py-2" key={team.id}>
            <span className="w-6 font-display text-amber">{index + 1}</span>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <TeamAvatar avatarUrl={team.avatarUrl} name={team.teamName} size="sm" />
              <span className="truncate">
                {team.teamName}
                <span className="ml-2 text-xs text-mist">{team.displayName}</span>
              </span>
            </span>
            <button className="text-mist hover:text-paper" onClick={() => move(index, -1)} type="button">
              Up
            </button>
            <button className="text-mist hover:text-paper" onClick={() => move(index, 1)} type="button">
              Down
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-sm bg-blood px-3 py-2 text-sm font-semibold text-white hover:bg-blood-dim disabled:opacity-50"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setDraftOrderAction(
                leagueId,
                order.map((t) => t.id),
              );
              setMessage("Order saved.");
              router.refresh();
            })
          }
          type="button"
        >
          Save order
        </button>
        <button
          className="rounded-sm border border-line px-3 py-2 text-sm hover:border-amber hover:text-amber disabled:opacity-50"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await randomizeDraftOrderAction(leagueId);
              setMessage("Draft order randomized.");
              router.refresh();
            })
          }
          type="button"
        >
          Randomize
        </button>
      </div>
      {message ? <p className="text-xs text-amber">{message}</p> : null}
    </div>
  );
}
