import { TeamAvatar } from "@/components/team-avatar";
import type { FightingThisWeek } from "@/lib/upcoming-card";

export function FightingThisWeekPanel({ data }: { data: FightingThisWeek }) {
  const card = data.card;
  const subtitle = card
    ? [card.event, card.dateLabel, card.location].filter(Boolean).join(" · ")
    : null;

  return (
    <section className="rounded-md border border-line bg-panel p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl tracking-wide">Fighting this week</h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-mist">{subtitle}</p>
          ) : (
            <p className="mt-1 text-sm text-mist">No upcoming UFC card is on the books yet.</p>
          )}
        </div>
        {card?.tapologyUrl ? (
          <a
            className="text-xs uppercase tracking-[0.16em] text-amber hover:text-paper"
            href={card.tapologyUrl}
            rel="noreferrer"
            target="_blank"
          >
            Tapology
          </a>
        ) : null}
      </div>

      {!card ? (
        <p className="mt-4 text-sm text-mist">
          Once a card is dated, rostered fighters booked on it will show up here with their opponent.
        </p>
      ) : data.teams.length === 0 ? (
        <p className="mt-4 text-sm text-mist">No fighters on this league&apos;s rosters are booked for this card.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.teams.map((team) => (
            <li className="rounded-sm border border-line bg-ink px-3 py-3" key={team.membershipId}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <TeamAvatar avatarUrl={team.avatarUrl} name={team.teamName} size="sm" />
                  <div className="truncate font-medium">{team.teamName}</div>
                </div>
                <span className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-amber">
                  {team.fighters.length} fighting
                </span>
              </div>
              <ul className="mt-2 space-y-2">
                {team.fighters.map((fighter) => {
                  const detail = [fighter.weightClass, fighter.cardSegment].filter(Boolean).join(" · ");
                  return (
                    <li className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4" key={fighter.id}>
                      <p className="min-w-0 break-words text-sm">
                        <span className="font-medium">{fighter.name}</span>
                        {fighter.opponent ? <span className="text-mist"> vs. {fighter.opponent}</span> : null}
                      </p>
                      {detail ? <p className="shrink-0 text-xs text-mist">{detail}</p> : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {card && data.teams.length > 0 && data.teamsWithoutFighters > 0 ? (
        <p className="mt-3 text-xs text-mist">
          {data.teamsWithoutFighters === 1
            ? "1 team has no fighters on this card."
            : `${data.teamsWithoutFighters} teams have no fighters on this card.`}
        </p>
      ) : null}
    </section>
  );
}
