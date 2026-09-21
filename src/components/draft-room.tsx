"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { forceAutoPickAction, makePickAction } from "@/app/actions/draft";
import { CLASS_LABELS, SLOT_LABELS, SLOT_SHORT, type ClassKey, type RosterSlotKey } from "@/lib/slots";
import { TeamAvatar } from "./team-avatar";

type Fighter = {
  id: string;
  name: string;
  classKey: string;
  slotKey: string;
  record: string | null;
  rankingJson?: string | null;
  nextBoutJson?: string | null;
};

type DraftState = {
  league: {
    id: string;
    name: string;
    status: string;
    pickClockSeconds: number;
    currentPickIndex: number;
    pickDeadline: string | null;
    totalPicks: number;
    isCommissioner: boolean;
  };
  teams: {
    id: string;
    userId: string;
    teamName: string;
    avatarUrl?: string | null;
    displayName: string;
    draftPosition: number;
    filled: number;
    roster: { slot: string; pickNumber: number; fighter: Fighter }[];
  }[];
  onTheClock: {
    membershipId: string;
    userId: string;
    teamName: string;
    avatarUrl?: string | null;
    displayName: string;
    draftPosition: number;
    openSlots: string[];
    isYou: boolean;
  } | null;
  myTeam: { id: string; teamName: string; avatarUrl?: string | null; openSlots: string[] } | null;
  picks: {
    pickNumber: number;
    slot: string;
    autoPick: boolean;
    teamName: string;
    avatarUrl?: string | null;
    displayName: string;
    fighter: Fighter;
  }[];
  available: Fighter[];
};

function rankingLabel(rankingJson?: string | null) {
  if (!rankingJson) return null;
  try {
    const parsed = JSON.parse(rankingJson) as { rank?: string | number };
    if (parsed.rank === "C") return "C";
    if (parsed.rank != null) return `#${parsed.rank}`;
  } catch {
    return null;
  }
  return null;
}

function nextBoutLabel(nextBoutJson?: string | null) {
  if (!nextBoutJson) return null;
  try {
    const parsed = JSON.parse(nextBoutJson) as { opponent?: string; event?: string };
    if (parsed.opponent) return `vs ${parsed.opponent}${parsed.event ? ` · ${parsed.event}` : ""}`;
  } catch {
    return null;
  }
  return null;
}

function useCountdown(deadline: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  if (!deadline) return null;
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000));
}

function formatClock(seconds: number | null) {
  if (seconds == null) return "--:--";
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function DraftRoom({ leagueId, initial }: { leagueId: string; initial: DraftState }) {
  const [state, setState] = useState(initial);
  const [query, setQuery] = useState("");
  const [slot, setSlot] = useState(initial.onTheClock?.openSlots[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const remaining = useCountdown(state.league.pickDeadline);
  const clockExpired = remaining === 0;

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      const res = await fetch(`/api/leagues/${leagueId}/draft`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const next = (await res.json()) as DraftState;
      if (!cancelled) setState(next);
    }
    if (clockExpired) void pull();
    const id = setInterval(pull, clockExpired ? 1000 : 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [leagueId, clockExpired]);

  const openSlots = state.onTheClock?.openSlots ?? [];
  const activeSlot = openSlots.includes(slot) ? slot : (openSlots[0] ?? "");

  const canPick = state.league.status === "DRAFTING" && Boolean(state.onTheClock?.isYou || state.league.isCommissioner);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.available.filter((f) => {
      if (activeSlot && activeSlot.startsWith("FLEX") === false && f.slotKey !== activeSlot) return false;
      if (!q) return true;
      return f.name.toLowerCase().includes(q) || f.classKey.includes(q.replace(/\s+/g, "_"));
    });
  }, [state.available, query, activeSlot]);

  function draft(fighterId: string) {
    if (!activeSlot) {
      setError("Choose a roster slot first.");
      return;
    }
    startTransition(async () => {
      const result = await makePickAction(leagueId, fighterId, activeSlot);
      if (!result.ok) setError(result.error);
      else setError(null);
      const res = await fetch(`/api/leagues/${leagueId}/draft`, { cache: "no-store" });
      if (res.ok) setState((await res.json()) as DraftState);
    });
  }

  const progress = state.league.totalPicks
    ? Math.round((state.picks.length / state.league.totalPicks) * 100)
    : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <div className="rounded-md border border-line bg-panel p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-mist">On the clock</p>
              <div className="flex items-center gap-3">
                {state.onTheClock && state.league.status === "DRAFTING" ? (
                  <TeamAvatar
                    avatarUrl={state.onTheClock.avatarUrl}
                    name={state.onTheClock.teamName}
                    size="lg"
                  />
                ) : null}
                <h1 className="font-display text-3xl tracking-wide text-paper">
                  {state.league.status === "IN_SEASON"
                    ? "Draft complete"
                    : state.league.status === "PAUSED"
                      ? "Draft paused"
                      : state.onTheClock
                        ? `${state.onTheClock.teamName}`
                        : "Waiting"}
                </h1>
              </div>
              {state.onTheClock && state.league.status === "DRAFTING" && (
                <p className="text-sm text-mist">
                  Pick {state.league.currentPickIndex + 1} of {state.league.totalPicks}
                  {state.onTheClock.isYou ? " — your board, your call." : ` — ${state.onTheClock.displayName}`}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="font-display text-4xl tabular-nums text-amber">{formatClock(remaining)}</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-mist">
                {clockExpired ? "autodrafting" : "pick clock"}
              </p>
              {state.league.status === "DRAFTING" ? (
                <p className="mt-1 text-[11px] text-mist">Best eligible fighter at 0:00</p>
              ) : null}
              {state.league.isCommissioner && state.league.status === "DRAFTING" && (
                <button
                  className="mt-2 text-xs uppercase tracking-[0.16em] text-mist hover:text-amber"
                  onClick={() =>
                    startTransition(() => {
                      void forceAutoPickAction(leagueId);
                    })
                  }
                  type="button"
                >
                  Force auto-pick
                </button>
              )}
            </div>
          </div>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-raised">
            <div className="h-full bg-blood" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {state.league.status === "DRAFTING" && canPick && (
          <div className="rounded-md border border-line bg-panel p-5">
            <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-mist">Open slot for this pick</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {(state.onTheClock?.openSlots ?? []).map((s) => (
                <button
                  key={s}
                  className={`rounded-sm border px-2.5 py-1 text-xs tracking-wide ${
                    slot === s || activeSlot === s ? "border-amber bg-amber/10 text-amber" : "border-line text-mist hover:text-paper"
                  }`}
                  onClick={() => setSlot(s)}
                  type="button"
                >
                  {SLOT_SHORT[s as RosterSlotKey] ?? s}
                </button>
              ))}
            </div>
            <input
              className="mb-4 w-full rounded-sm border border-line bg-ink px-3 py-2 outline-none ring-blood focus:ring-2"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the pool"
              value={query}
            />
            {error ? <p className="mb-3 text-sm text-blood">{error}</p> : null}
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-panel text-[11px] uppercase tracking-[0.16em] text-mist">
                  <tr>
                    <th className="py-2">Fighter</th>
                    <th>Class</th>
                    <th>Record</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 80).map((f) => (
                    <tr className="border-t border-line/70" key={f.id}>
                      <td className="py-2">
                        <div className="font-medium">{f.name}</div>
                        <div className="text-xs text-mist">
                          {[rankingLabel(f.rankingJson), nextBoutLabel(f.nextBoutJson)].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="text-mist">{CLASS_LABELS[f.classKey as ClassKey] ?? f.classKey}</td>
                      <td className="text-mist">{f.record ?? "—"}</td>
                      <td className="text-right">
                        <button
                          className="rounded-sm bg-blood px-3 py-1 text-xs font-semibold text-white hover:bg-blood-dim disabled:opacity-40"
                          disabled={pending}
                          onClick={() => draft(f.id)}
                          type="button"
                        >
                          Draft
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 80 ? (
                <p className="mt-2 text-xs text-mist">Showing 80 of {filtered.length}. Narrow the search.</p>
              ) : null}
              {filtered.length === 0 ? <p className="py-6 text-sm text-mist">No fighters match that slot/search.</p> : null}
            </div>
          </div>
        )}

        {state.league.status !== "DRAFTING" && (
          <div className="rounded-md border border-line bg-panel p-5 text-sm text-mist">
            {state.league.status === "SETUP" && "Commissioner has not started the draft."}
            {state.league.status === "PAUSED" && "The clock is stopped. Commissioner can resume from Admin."}
            {state.league.status === "IN_SEASON" && "All 13 slots are filled. Season scoring is live on Standings."}
          </div>
        )}
      </div>

      <aside className="space-y-5">
        <div className="rounded-md border border-line bg-panel p-4">
          <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-mist">Snake order</p>
          <ol className="space-y-2 text-sm">
            {state.teams.map((t) => (
              <li
                className={`flex items-center justify-between rounded-sm px-2 py-1 ${
                  state.onTheClock?.membershipId === t.id ? "bg-blood/15 text-paper" : "text-mist"
                }`}
                key={t.id}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="font-display text-amber">{t.draftPosition}</span>
                  <TeamAvatar avatarUrl={t.avatarUrl} name={t.teamName} size="sm" />
                  <span className="truncate">{t.teamName}</span>
                </span>
                <span className="text-xs">{t.filled}/13</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-md border border-line bg-panel p-4">
          <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-mist">Pick history</p>
          <ol className="max-h-[28rem] space-y-2 overflow-auto text-sm">
            {state.picks.length === 0 ? <li className="text-mist">No picks yet.</li> : null}
            {[...state.picks].reverse().map((p) => (
              <li className="border-b border-line/60 pb-2" key={p.pickNumber}>
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{p.fighter.name}</span>
                  <span className="text-xs text-amber">#{p.pickNumber}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-mist">
                  <TeamAvatar avatarUrl={p.avatarUrl} name={p.teamName} size="sm" />
                  <span>
                    {p.teamName} · {SLOT_LABELS[p.slot as RosterSlotKey] ?? p.slot}
                    {p.autoPick ? (
                      <span className="ml-1.5 rounded-sm bg-amber/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber">
                        Auto
                      </span>
                    ) : null}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
        {!canPick && state.league.status === "DRAFTING" && (
          <p className="text-xs text-mist">Waiting on the clock. Board refreshes automatically.</p>
        )}
      </aside>
    </div>
  );
}
