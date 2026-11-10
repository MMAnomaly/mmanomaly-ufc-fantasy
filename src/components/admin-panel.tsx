"use client";

import { useState, useTransition } from "react";
import {
  ingestEventUrlAction,
  ingestLatestEventAction,
  scoreSampleEventAction,
} from "@/app/actions/scoring";
import {
  createInviteAction,
  deleteLeagueAction,
  pauseDraftAction,
  resumeDraftAction,
  revokeInviteAction,
  startDraftAction,
  updateLeagueSettingsAction,
} from "@/app/actions/leagues";
import { forceAutoPickAction } from "@/app/actions/draft";
import { Field, GhostButton, PrimaryButton } from "./ui";
import { InviteLink } from "./invite-link";
import { DraftOrderEditor } from "./draft-order";

type Invite = { id: string; token: string; revoked: boolean; createdAt: string };
type Team = {
  id: string;
  teamName: string;
  avatarUrl?: string | null;
  displayName: string;
  draftPosition: number;
};

export function AdminPanel({
  leagueId,
  leagueName,
  status,
  maxTeams,
  pickClockSeconds,
  seasonStart,
  seasonEnd,
  invites,
  teams,
}: {
  leagueId: string;
  leagueName: string;
  status: string;
  maxTeams: number;
  pickClockSeconds: number;
  seasonStart: string;
  seasonEnd: string;
  invites: Invite[];
  teams: Team[];
}) {
  const [pending, startTransition] = useTransition();
  const [log, setLog] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const liveInvites = invites.filter((i) => !i.revoked);

  return (
    <div className="space-y-8">
      <section className="rounded-md border border-line bg-panel p-5">
        <h2 className="font-display text-2xl tracking-wide">League settings</h2>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-3"
          action={(formData) => {
            startTransition(async () => {
              const result = await updateLeagueSettingsAction(leagueId, formData);
              setSettingsError(result?.error ?? null);
            });
          }}
        >
          <Field label="Name" name="name" defaultValue={leagueName} required />
          <Field label="Max teams" name="maxTeams" type="number" min={4} max={12} defaultValue={maxTeams} />
          <Field
            label="Pick clock (sec)"
            name="pickClockSeconds"
            type="number"
            min={15}
            max={300}
            defaultValue={pickClockSeconds}
          />
          <Field label="Season start" name="seasonStart" type="date" required defaultValue={seasonStart} />
          <Field label="Season end" name="seasonEnd" type="date" required defaultValue={seasonEnd} />
          <div className="sm:col-span-3">
            {settingsError ? <p className="mb-3 text-sm text-blood">{settingsError}</p> : null}
            <PrimaryButton disabled={pending}>Save settings</PrimaryButton>
          </div>
        </form>
      </section>

      <section className="rounded-md border border-line bg-panel p-5">
        <h2 className="font-display text-2xl tracking-wide">Invite links</h2>
        <p className="mt-1 text-sm text-mist">Share a link. Players register with email + password and join this league.</p>
        <div className="mt-4 space-y-3">
          {liveInvites.map((invite) => (
            <div className="space-y-2" key={invite.id}>
              <InviteLink token={invite.token} />
              <button
                className="text-xs uppercase tracking-[0.16em] text-mist hover:text-blood"
                onClick={() =>
                  startTransition(() => {
                    void revokeInviteAction(leagueId, invite.id);
                  })
                }
                type="button"
              >
                Revoke
              </button>
            </div>
          ))}
          {liveInvites.length === 0 ? <p className="text-sm text-mist">No active invites.</p> : null}
        </div>
        <button
          className="mt-4 rounded-sm border border-line px-3 py-2 text-sm hover:border-amber hover:text-amber"
          disabled={pending}
          onClick={() =>
            startTransition(() => {
              void createInviteAction(leagueId);
            })
          }
          type="button"
        >
          New invite link
        </button>
      </section>

      <section className="rounded-md border border-line bg-panel p-5">
        <h2 className="font-display text-2xl tracking-wide">Draft order</h2>
        <p className="mt-1 mb-4 text-sm text-mist">
          Randomize, then drag with Up/Down if last season&apos;s winner should pick first. Editable before and during the draft.
        </p>
        <DraftOrderEditor
          key={teams.map((t) => `${t.id}:${t.draftPosition}`).join("|")}
          leagueId={leagueId}
          teams={teams}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {status === "SETUP" || status === "PAUSED" ? (
            <form
              action={() => {
                startTransition(() => {
                  void startDraftAction(leagueId);
                });
              }}
            >
              <PrimaryButton>{status === "PAUSED" ? "Resume draft" : "Start snake draft"}</PrimaryButton>
            </form>
          ) : null}
          {status === "PAUSED" ? (
            <form
              action={() => {
                startTransition(() => {
                  void resumeDraftAction(leagueId);
                });
              }}
            >
              <GhostButton>Resume clock</GhostButton>
            </form>
          ) : null}
          {status === "DRAFTING" ? (
            <>
              <form
                action={() => {
                  startTransition(() => {
                    void pauseDraftAction(leagueId);
                  });
                }}
              >
                <GhostButton>Pause draft</GhostButton>
              </form>
              <form
                action={() => {
                  startTransition(() => {
                    void forceAutoPickAction(leagueId);
                  });
                }}
              >
                <GhostButton>Skip / auto-pick current turn</GhostButton>
              </form>
            </>
          ) : null}
        </div>
      </section>

      <section className="rounded-md border border-line bg-panel p-5">
        <h2 className="font-display text-2xl tracking-wide">Scoring trigger</h2>
        <p className="mt-1 text-sm text-mist">
          Sunday job hook also lives at <code>POST /api/jobs/sunday-score</code> (Bearer CRON_SECRET) and{" "}
          <code>npm run cron</code>. Scoring is idempotent per event.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-sm bg-blood px-3 py-2 text-sm font-semibold text-white hover:bg-blood-dim"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await scoreSampleEventAction(leagueId);
                setError(null);
                setLog(result.log);
              })
            }
            type="button"
          >
            Score demo fixture
          </button>
          <button
            className="rounded-sm border border-line px-3 py-2 text-sm hover:border-amber hover:text-amber"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await ingestLatestEventAction(leagueId);
                if (result.ok) {
                  setError(null);
                  setLog(result.log);
                } else {
                  setLog(null);
                  setError(result.error);
                }
              })
            }
            type="button"
          >
            Ingest latest UFC Stats event
          </button>
        </div>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await ingestEventUrlAction(leagueId, url);
              if (result.ok) {
                setError(null);
                setLog(result.log);
              } else {
                setLog(null);
                setError(result.error);
              }
            });
          }}
        >
          <input
            className="flex-1 rounded-sm border border-line bg-ink px-3 py-2 text-sm outline-none ring-blood focus:ring-2"
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://ufcstats.com/event-details/..."
            value={url}
          />
          <button className="rounded-sm border border-line px-3 py-2 text-sm hover:border-amber" type="submit">
            Score this URL
          </button>
        </form>
        {error ? <pre className="mt-3 overflow-auto text-xs text-blood">{error}</pre> : null}
        {log ? <pre className="mt-3 max-h-64 overflow-auto text-xs text-mist">{log}</pre> : null}
      </section>

      <DeleteLeague leagueId={leagueId} leagueName={leagueName} />
    </div>
  );
}

function DeleteLeague({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = typed === leagueName;

  return (
    <section className="rounded-md border border-blood/50 bg-panel p-5">
      <h2 className="font-display text-2xl tracking-wide text-blood">Danger zone</h2>
      <p className="mt-2 text-sm text-mist">
        Deleting <span className="text-paper">{leagueName}</span> permanently removes its rosters, draft picks, memberships,
        invites, and league settings. Fighter records, event scores, upcoming cards, and user accounts stay.
      </p>
      <label className="mt-4 block space-y-1.5">
        <span className="text-xs uppercase tracking-[0.18em] text-mist">Type the league name to confirm</span>
        <input
          className="w-full rounded-sm border border-line bg-ink px-3 py-2 text-paper outline-none ring-blood focus:ring-2"
          onChange={(event) => setTyped(event.target.value)}
          value={typed}
          autoComplete="off"
        />
      </label>
      {error ? <p className="mt-3 text-sm text-blood">{error}</p> : null}
      <button
        className="mt-4 rounded-sm border border-blood px-4 py-2 font-semibold text-blood hover:bg-blood hover:text-white disabled:opacity-40"
        disabled={!matches || pending}
        onClick={() => {
          if (!window.confirm(`Permanently delete “${leagueName}”? This cannot be undone.`)) return;
          startTransition(async () => {
            const result = await deleteLeagueAction(leagueId, typed);
            if (result?.error) setError(result.error);
          });
        }}
        type="button"
      >
        Delete league
      </button>
    </section>
  );
}
