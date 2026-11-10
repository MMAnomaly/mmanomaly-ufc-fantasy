/** Tables removed for one league, in foreign-key order. Global rows are not in this list. */
export const LEAGUE_SCOPED_DELETE_ORDER = ["RosterSlot", "DraftPick", "Invite", "Membership", "League"] as const;

export function authorizeLeagueDelete(args: {
  userId: string | null;
  commissionerId: string;
  leagueName: string;
  confirmationName: string;
}): { ok: true } | { ok: false; error: string } {
  if (!args.userId || args.userId !== args.commissionerId) {
    return { ok: false, error: "Only the commissioner can delete this league." };
  }
  if (args.confirmationName !== args.leagueName) {
    return { ok: false, error: "Type the league name exactly to delete it." };
  }
  return { ok: true };
}

export type LeagueDeleteSnapshot = {
  leagues: { id: string; name: string; commissionerId: string }[];
  memberships: { id: string; leagueId: string; userId: string }[];
  rosterSlots: { id: string; membershipId: string; fighterId: string }[];
  draftPicks: { id: string; leagueId: string; membershipId: string; fighterId: string }[];
  invites: { id: string; leagueId: string; createdById: string }[];
  users: { id: string }[];
  fighters: { id: string }[];
  events: { id: string }[];
  fights: { id: string }[];
  scores: { id: string }[];
  cards: { id: string }[];
  statLines: { id: string }[];
  scoringJobs: { id: string }[];
};

/** Drops one league and its rows. Users, fighters, events, fights, scores, cards, and jobs stay. */
export function deleteLeagueScoped(snapshot: LeagueDeleteSnapshot, leagueId: string): LeagueDeleteSnapshot {
  const membershipIds = new Set(snapshot.memberships.filter((row) => row.leagueId === leagueId).map((row) => row.id));
  return {
    rosterSlots: snapshot.rosterSlots.filter((row) => !membershipIds.has(row.membershipId)),
    draftPicks: snapshot.draftPicks.filter((row) => row.leagueId !== leagueId),
    invites: snapshot.invites.filter((row) => row.leagueId !== leagueId),
    memberships: snapshot.memberships.filter((row) => row.leagueId !== leagueId),
    leagues: snapshot.leagues.filter((row) => row.id !== leagueId),
    users: snapshot.users,
    fighters: snapshot.fighters,
    events: snapshot.events,
    fights: snapshot.fights,
    scores: snapshot.scores,
    cards: snapshot.cards,
    statLines: snapshot.statLines,
    scoringJobs: snapshot.scoringJobs,
  };
}
