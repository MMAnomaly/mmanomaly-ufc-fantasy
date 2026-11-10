import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LEAGUE_SCOPED_DELETE_ORDER,
  authorizeLeagueDelete,
  deleteLeagueScoped,
  type LeagueDeleteSnapshot,
} from "./delete-league";

const snapshot: LeagueDeleteSnapshot = {
  users: [{ id: "commish" }, { id: "player" }],
  leagues: [
    { id: "league-a", name: "Fight Week", commissionerId: "commish" },
    { id: "league-b", name: "Other League", commissionerId: "player" },
  ],
  memberships: [
    { id: "mem-a1", leagueId: "league-a", userId: "commish" },
    { id: "mem-a2", leagueId: "league-a", userId: "player" },
    { id: "mem-b1", leagueId: "league-b", userId: "player" },
  ],
  rosterSlots: [
    { id: "slot-a", membershipId: "mem-a2", fighterId: "fighter-1" },
    { id: "slot-b", membershipId: "mem-b1", fighterId: "fighter-1" },
  ],
  draftPicks: [
    { id: "pick-a", leagueId: "league-a", membershipId: "mem-a2", fighterId: "fighter-1" },
    { id: "pick-b", leagueId: "league-b", membershipId: "mem-b1", fighterId: "fighter-1" },
  ],
  invites: [
    { id: "inv-a", leagueId: "league-a", createdById: "commish" },
    { id: "inv-b", leagueId: "league-b", createdById: "player" },
  ],
  fighters: [{ id: "fighter-1" }],
  events: [{ id: "event-1" }],
  fights: [{ id: "fight-1" }],
  scores: [{ id: "score-1" }],
  cards: [{ id: "card-1" }],
  statLines: [{ id: "line-1" }],
  scoringJobs: [{ id: "job-1" }],
};

describe("league delete authorization", () => {
  it("allows only the commissioner who types the exact league name", () => {
    assert.deepEqual(
      authorizeLeagueDelete({
        userId: "commish",
        commissionerId: "commish",
        leagueName: "Fight Week",
        confirmationName: "Fight Week",
      }),
      { ok: true },
    );
    const member = authorizeLeagueDelete({
      userId: "player",
      commissionerId: "commish",
      leagueName: "Fight Week",
      confirmationName: "Fight Week",
    });
    assert.equal(member.ok, false);
    const stranger = authorizeLeagueDelete({
      userId: null,
      commissionerId: "commish",
      leagueName: "Fight Week",
      confirmationName: "Fight Week",
    });
    assert.equal(stranger.ok, false);
    const typo = authorizeLeagueDelete({
      userId: "commish",
      commissionerId: "commish",
      leagueName: "Fight Week",
      confirmationName: "fight week",
    });
    assert.equal(typo.ok, false);
    if (!typo.ok) assert.match(typo.error, /exactly/);
  });
});

describe("league scoped deletion", () => {
  it("deletes that league's rows and leaves global data and other leagues", () => {
    assert.deepEqual(LEAGUE_SCOPED_DELETE_ORDER, ["RosterSlot", "DraftPick", "Invite", "Membership", "League"]);
    const next = deleteLeagueScoped(snapshot, "league-a");
    assert.deepEqual(next.leagues.map((row) => row.id), ["league-b"]);
    assert.deepEqual(next.memberships.map((row) => row.id), ["mem-b1"]);
    assert.deepEqual(next.rosterSlots.map((row) => row.id), ["slot-b"]);
    assert.deepEqual(next.draftPicks.map((row) => row.id), ["pick-b"]);
    assert.deepEqual(next.invites.map((row) => row.id), ["inv-b"]);
    assert.deepEqual(next.users, snapshot.users);
    assert.deepEqual(next.fighters, snapshot.fighters);
    assert.deepEqual(next.events, snapshot.events);
    assert.deepEqual(next.fights, snapshot.fights);
    assert.deepEqual(next.scores, snapshot.scores);
    assert.deepEqual(next.cards, snapshot.cards);
    assert.deepEqual(next.statLines, snapshot.statLines);
    assert.deepEqual(next.scoringJobs, snapshot.scoringJobs);
  });
});
