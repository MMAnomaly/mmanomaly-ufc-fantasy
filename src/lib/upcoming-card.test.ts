import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import {
  buildFightingThisWeek,
  explicitCardFromStored,
  formatCardDate,
  losAngelesDateKey,
  parseUpcomingCardDocument,
  resolveUpcomingCardPath,
  selectUpcomingCard,
  serializeBouts,
  upcomingCardExternalKey,
  type ExplicitCard,
  type FightingTeamInput,
} from "./upcoming-card";

const VEGAS_NIGHT = new Date("2026-09-27T06:30:00Z"); // 2026-09-26 23:30 PDT
const DAY_AFTER_VEGAS = new Date("2026-09-27T07:00:00Z"); // 2026-09-27 00:00 PDT

function boutJson(event: string, date: string, opponent = "Opponent") {
  return JSON.stringify({ opponent, event, date, confirmed: true });
}

function card(partial: Partial<ExplicitCard> & Pick<ExplicitCard, "event" | "date">): ExplicitCard {
  return {
    location: null,
    tapologyUrl: null,
    bouts: [],
    sortOrder: 0,
    ...partial,
  };
}

function team(partial: Partial<FightingTeamInput> & Pick<FightingTeamInput, "membershipId" | "teamName">): FightingTeamInput {
  return {
    avatarUrl: null,
    fighters: [],
    ...partial,
  };
}

describe("Los Angeles card dates", () => {
  it("keeps an event upcoming through the end of its Pacific calendar day", () => {
    assert.equal(losAngelesDateKey(VEGAS_NIGHT), "2026-09-26");
    assert.equal(losAngelesDateKey(DAY_AFTER_VEGAS), "2026-09-27");
    assert.equal(formatCardDate("2026-10-03"), "Sat, Oct 3");
    assert.equal(formatCardDate("2026-09-26"), "Sat, Sep 26");
  });
});

describe("upcoming card selection", () => {
  const vegas = card({ event: "UFC Vegas 121", date: "2026-09-26", sortOrder: 0 });
  const ufc332 = card({
    event: "UFC 332",
    date: "2026-10-03",
    sortOrder: 1,
    location: "Las Vegas, Nevada",
    tapologyUrl: "https://www.tapology.com/fightcenter/events/332",
  });

  it("prefers the earliest explicit card that is still today or later", () => {
    const selected = selectUpcomingCard({
      explicitCards: [ufc332, vegas],
      fighterNextBouts: [boutJson("UFC 333", "2026-10-24")],
      now: VEGAS_NIGHT,
    });
    assert.equal(selected?.event, "UFC Vegas 121");
    assert.equal(selected?.date, "2026-09-26");
  });

  it("moves to the next explicit event after the card's Pacific day ends", () => {
    const selected = selectUpcomingCard({
      explicitCards: [vegas, ufc332],
      fighterNextBouts: [boutJson("UFC Vegas 121", "2026-09-26")],
      now: DAY_AFTER_VEGAS,
    });
    assert.equal(selected?.event, "UFC 332");
  });

  it("derives the earliest future event from next bouts when no explicit card is upcoming", () => {
    const selected = selectUpcomingCard({
      explicitCards: [vegas],
      fighterNextBouts: [
        boutJson("UFC 333", "2026-10-24"),
        boutJson("UFC 332", "2026-10-03"),
        boutJson("UFC 332", "2026-10-03"),
        boutJson("UFC 334", ""),
        "not-json",
        null,
      ],
      now: DAY_AFTER_VEGAS,
    });
    assert.equal(selected?.event, "UFC 332");
    assert.equal(selected?.date, "2026-10-03");
    assert.equal(selected?.bouts.length, 0);
  });

  it("breaks same-day ties by file order, then event name", () => {
    const laterInFile = card({ event: "UFC Fight Night", date: "2026-10-03", sortOrder: 2 });
    const earlierInFile = card({ event: "UFC 332", date: "2026-10-03", sortOrder: 1 });
    const selected = selectUpcomingCard({
      explicitCards: [laterInFile, earlierInFile],
      fighterNextBouts: [],
      now: DAY_AFTER_VEGAS,
    });
    assert.equal(selected?.event, "UFC 332");
  });

  it("groups derived bouts by event name and keeps the earliest date", () => {
    const selected = selectUpcomingCard({
      explicitCards: [],
      fighterNextBouts: [
        boutJson("UFC Fight Night", "2026-10-03"),
        boutJson("UFC 332", "2026-10-10"),
        boutJson("UFC 332", "2026-10-03"),
      ],
      now: DAY_AFTER_VEGAS,
    });
    assert.equal(selected?.event, "UFC 332");
    assert.equal(selected?.date, "2026-10-03");
  });

  it("returns null when every dated bout is in the past and undated bouts have no card", () => {
    const selected = selectUpcomingCard({
      explicitCards: [],
      fighterNextBouts: [boutJson("UFC Vegas 121", "2026-09-26"), boutJson("UFC 335", "")],
      now: DAY_AFTER_VEGAS,
    });
    assert.equal(selected, null);
  });
});

describe("fighting this week grouping", () => {
  const ufc332 = card({
    event: "UFC 332",
    date: "2026-10-03",
    location: "Las Vegas, Nevada",
    tapologyUrl: "https://www.tapology.com/fightcenter/events/332",
    bouts: [
      {
        fighterA: "Natalia Silva",
        fighterB: "Wang Cong",
        weightClass: "Women's Flyweight",
        cardSegment: "Main Card",
        confirmed: true,
        order: 1,
      },
      {
        fighterA: "Payton Talbott",
        fighterB: "Deiveson Figueiredo",
        weightClass: "Bantamweight",
        cardSegment: "Main Event",
        confirmed: true,
        order: 0,
      },
    ],
  });

  const pit = team({
    membershipId: "pit",
    teamName: "The Pit",
    avatarUrl: "/uploads/pit.png",
    fighters: [
      {
        id: "silva",
        name: "Natália Silva",
        weightClass: "Flyweight",
        nextBoutJson: boutJson("UFC 333", "2026-10-24", "Someone Else"),
      },
      {
        id: "undated",
        name: "Lone'er Kavanagh",
        weightClass: "Flyweight",
        nextBoutJson: boutJson("UFC 332", "", "Ramazan Temirov"),
      },
      {
        id: "other-card",
        name: "Joshua Van",
        weightClass: "Flyweight",
        nextBoutJson: boutJson("UFC 333", "2026-10-24", "Other"),
      },
    ],
  });

  const house = team({
    membershipId: "house",
    teamName: "House Account",
    fighters: [
      {
        id: "talbott",
        name: "Payton Talbott",
        weightClass: "Bantamweight",
        nextBoutJson: null,
      },
    ],
  });

  const empty = team({
    membershipId: "empty",
    teamName: "No Shows",
    fighters: [
      {
        id: "idle",
        name: "Idle Fighter",
        weightClass: "Heavyweight",
        nextBoutJson: boutJson("UFC 334", "2026-11-14", "Nobody"),
      },
    ],
  });

  it("lists rostered fighters on the card in standings order with bout details", () => {
    const view = buildFightingThisWeek({
      teams: [pit, empty, house],
      explicitCards: [ufc332],
      fighterNextBouts: [],
      now: DAY_AFTER_VEGAS,
    });

    assert.equal(view.card?.event, "UFC 332");
    assert.equal(view.card?.dateLabel, "Sat, Oct 3");
    assert.equal(view.card?.location, "Las Vegas, Nevada");
    assert.equal(view.card?.tapologyUrl, "https://www.tapology.com/fightcenter/events/332");
    assert.deepEqual(
      view.teams.map((row) => row.teamName),
      ["The Pit", "House Account"],
    );
    assert.equal(view.teamsWithoutFighters, 1);
    assert.equal(view.teams[0]?.avatarUrl, "/uploads/pit.png");
    assert.deepEqual(
      view.teams[0]?.fighters.map((fighter) => fighter.name),
      ["Natália Silva", "Lone'er Kavanagh"],
    );
    assert.deepEqual(view.teams[0]?.fighters[0], {
      id: "silva",
      name: "Natália Silva",
      opponent: "Wang Cong",
      weightClass: "Women's Flyweight",
      cardSegment: "Main Card",
      unconfirmed: false,
    });
    assert.equal(view.teams[0]?.fighters[1]?.opponent, "Ramazan Temirov");
    assert.equal(view.teams[0]?.fighters[1]?.cardSegment, null);
    assert.equal(view.teams[0]?.fighters[1]?.weightClass, "Flyweight");
    assert.deepEqual(view.teams[1]?.fighters[0], {
      id: "talbott",
      name: "Payton Talbott",
      opponent: "Deiveson Figueiredo",
      weightClass: "Bantamweight",
      cardSegment: "Main Event",
      unconfirmed: false,
    });
  });

  it("matches an empty next-bout date by event name when the card is derived", () => {
    const view = buildFightingThisWeek({
      teams: [
        team({
          membershipId: "one",
          teamName: "One",
          fighters: [
            {
              id: "kavanagh",
              name: "Lone'er Kavanagh",
              weightClass: "Flyweight",
              nextBoutJson: boutJson("UFC 332", "", "Ramazan Temirov"),
            },
            {
              id: "coria",
              name: "Alden Coria",
              weightClass: "Flyweight",
              nextBoutJson: boutJson("UFC 332", "2026-10-03", "Imanol Rodriguez"),
            },
            {
              id: "later",
              name: "Later Date",
              weightClass: "Flyweight",
              nextBoutJson: boutJson("UFC 332", "2026-11-01", "Nope"),
            },
          ],
        }),
      ],
      explicitCards: [],
      fighterNextBouts: [boutJson("UFC 332", "2026-10-03"), boutJson("UFC 333", "2026-10-24")],
      now: DAY_AFTER_VEGAS,
    });
    assert.equal(view.card?.event, "UFC 332");
    assert.deepEqual(
      view.teams[0]?.fighters.map((fighter) => [fighter.name, fighter.opponent]),
      [
        ["Alden Coria", "Imanol Rodriguez"],
        ["Lone'er Kavanagh", "Ramazan Temirov"],
      ],
    );
  });

  it("does not match an empty date onto a different event", () => {
    const view = buildFightingThisWeek({
      teams: [
        team({
          membershipId: "one",
          teamName: "One",
          fighters: [
            {
              id: "wrong",
              name: "Wrong Card",
              weightClass: "Lightweight",
              nextBoutJson: boutJson("UFC 334", "", "Somebody"),
            },
          ],
        }),
      ],
      explicitCards: [ufc332],
      fighterNextBouts: [],
      now: DAY_AFTER_VEGAS,
    });
    assert.equal(view.teams.length, 0);
    assert.equal(view.teamsWithoutFighters, 1);
    assert.ok(view.card);
  });

  it("reports an empty card when nothing upcoming is known", () => {
    const view = buildFightingThisWeek({
      teams: [house],
      explicitCards: [],
      fighterNextBouts: [],
      now: DAY_AFTER_VEGAS,
    });
    assert.equal(view.card, null);
    assert.equal(view.teams.length, 0);
  });

  it("matches accent-insensitive names and lists a duplicated fighter once", () => {
    const view = buildFightingThisWeek({
      teams: [
        team({
          membershipId: "one",
          teamName: "One",
          fighters: [
            {
              id: "diaz-plain",
              name: "Juan Diaz",
              weightClass: "Bantamweight",
              nextBoutJson: JSON.stringify({
                opponent: "Adrian Yanez",
                event: "UFC 334",
                date: "2026-11-14",
                confirmed: false,
              }),
            },
            {
              id: "diaz-accent",
              name: "Juan Díaz",
              weightClass: "Bantamweight",
              nextBoutJson: JSON.stringify({
                opponent: "Adrian Yañez",
                event: "UFC 334",
                date: "",
                confirmed: true,
              }),
            },
          ],
        }),
      ],
      explicitCards: [
        card({
          event: "UFC 334",
          date: "2026-11-14",
          bouts: [
            {
              fighterA: "Juan Diaz",
              fighterB: "Adrian Yanez",
              weightClass: "Bantamweight",
              cardSegment: "prelims",
              confirmed: true,
              order: 2,
            },
          ],
        }),
      ],
      fighterNextBouts: [],
      now: DAY_AFTER_VEGAS,
    });
    assert.equal(view.teams[0]?.fighters.length, 1);
    assert.equal(view.teams[0]?.fighters[0]?.id, "diaz-plain");
    assert.equal(view.teams[0]?.fighters[0]?.opponent, "Adrian Yanez");
    assert.equal(view.teams[0]?.fighters[0]?.cardSegment, "Prelims");
    assert.equal(view.teams[0]?.fighters[0]?.unconfirmed, false);
  });

  it("tags a next-bout match unconfirmed when confirmed is false", () => {
    const view = buildFightingThisWeek({
      teams: [
        team({
          membershipId: "one",
          teamName: "One",
          fighters: [
            {
              id: "reported",
              name: "Jacobe Smith",
              weightClass: "Welterweight",
              nextBoutJson: JSON.stringify({
                opponent: "Bruce Whitehead",
                event: "UFC 332",
                date: "2026-10-03",
                confirmed: false,
              }),
            },
          ],
        }),
      ],
      explicitCards: [card({ event: "UFC 332", date: "2026-10-03", tapologyUrl: null })],
      fighterNextBouts: [],
      now: DAY_AFTER_VEGAS,
    });
    assert.equal(view.card?.tapologyUrl, null);
    assert.equal(view.teams[0]?.fighters[0]?.unconfirmed, true);
    assert.equal(view.teams[0]?.fighters[0]?.cardSegment, null);
    assert.equal(view.teams[0]?.fighters[0]?.opponent, "Bruce Whitehead");
  });

  it("tags a card-file bout unconfirmed when that bout is not official", () => {
    const view = buildFightingThisWeek({
      teams: [
        team({
          membershipId: "one",
          teamName: "One",
          fighters: [
            {
              id: "smith",
              name: "Jacobe Smith",
              weightClass: "Welterweight",
              nextBoutJson: JSON.stringify({
                opponent: "Bruce Whitehead",
                event: "UFC 332",
                date: "2026-10-03",
                confirmed: true,
              }),
            },
          ],
        }),
      ],
      explicitCards: [
        card({
          event: "UFC 332",
          date: "2026-10-03",
          bouts: [
            {
              fighterA: "Jacobe Smith",
              fighterB: "Bruce Whitehead",
              weightClass: "Welterweight",
              cardSegment: null,
              confirmed: false,
              order: 0,
            },
          ],
        }),
      ],
      fighterNextBouts: [],
      now: DAY_AFTER_VEGAS,
    });
    assert.equal(view.teams[0]?.fighters[0]?.unconfirmed, true);
    assert.equal(view.teams[0]?.fighters[0]?.cardSegment, null);
    assert.equal(view.teams[0]?.fighters[0]?.weightClass, "Welterweight");
  });

  it("drops unsafe tapology urls", () => {
    const view = buildFightingThisWeek({
      teams: [],
      explicitCards: [card({ event: "UFC 332", date: "2026-10-03", tapologyUrl: "javascript:alert(1)" })],
      fighterNextBouts: [],
      now: DAY_AFTER_VEGAS,
    });
    assert.equal(view.card?.tapologyUrl, null);
  });
});

describe("real upcoming card file", () => {
  const document = JSON.parse(readFileSync(path.join(process.cwd(), "data", "upcoming_card.json"), "utf8")) as unknown;

  it("keeps the primary event through its Pacific day, then the earliest future next event", () => {
    const cards = parseUpcomingCardDocument(document);
    assert.equal(cards[0]?.event, "UFC Vegas 121");
    assert.equal(cards[0]?.tapologyUrl, null);
    assert.ok(cards[0]?.bouts.some((bout) => bout.cardSegment === null) === false);

    const onTheDay = selectUpcomingCard({
      explicitCards: cards,
      fighterNextBouts: [JSON.stringify({ opponent: "X", event: "UFC 335", date: "2026-12-12", confirmed: true })],
      now: VEGAS_NIGHT,
    });
    assert.equal(onTheDay?.event, "UFC Vegas 121");
    assert.equal(onTheDay?.location, "Meta APEX, Las Vegas (Enterprise), Nevada, USA");
    assert.equal(onTheDay?.bouts.length, 12);

    const dayAfter = selectUpcomingCard({
      explicitCards: cards,
      fighterNextBouts: [JSON.stringify({ opponent: "X", event: "UFC Vegas 121", date: "2026-09-26", confirmed: true })],
      now: DAY_AFTER_VEGAS,
    });
    assert.equal(dayAfter?.event, "UFC 332");
    assert.equal(dayAfter?.date, "2026-10-03");
    assert.equal(dayAfter?.tapologyUrl, "https://www.tapology.com/fightcenter/events/146635-ufc-332");
    assert.ok((dayAfter?.bouts.length ?? 0) > 0);
    const reported = dayAfter?.bouts.find((bout) => bout.fighterA === "Jacobe Smith");
    assert.equal(reported?.confirmed, false);
    assert.equal(reported?.cardSegment, null);
  });
});

describe("upcoming card file", () => {
  it("reads the shared export before repo copies and skips when nothing is present", () => {
    const shared = "/home/box/shared/active-fighter-repository/upcoming_card.json";
    assert.equal(resolveUpcomingCardPath(() => false, "/app"), null);
    assert.equal(
      resolveUpcomingCardPath((filePath) => filePath.endsWith("data/upcoming-card.json"), "/app"),
      "/app/data/upcoming-card.json",
    );
    assert.equal(
      resolveUpcomingCardPath((filePath) => filePath === shared || filePath.endsWith("upcoming-card.json"), "/app"),
      shared,
    );
  });

  it("parses the primary card and dated next events, skipping incomplete bouts", () => {
    const cards = parseUpcomingCardDocument({
      event: "UFC Vegas 121",
      date: "",
      bouts: [{ fighter_a: "A" }],
      next_events: [
        {
          event: "UFC 332",
          date: "2026-10-03",
          location: "Las Vegas",
          tapology_url: "https://www.tapology.com/fightcenter/events/332",
          bouts: [
            { fighter_a: "Alden Coria", fighter_b: "Imanol Rodriguez", weight_class: "Flyweight", card_segment: "Prelims" },
            { fighter_a: "Missing Opponent" },
          ],
        },
        { event: "Undated", date: "" },
      ],
    });
    assert.equal(cards.length, 1);
    assert.equal(cards[0]?.event, "UFC 332");
    assert.equal(cards[0]?.sortOrder, 1);
    assert.equal(cards[0]?.bouts.length, 1);
    assert.equal(cards[0]?.bouts[0]?.cardSegment, "Prelims");
    assert.equal(upcomingCardExternalKey("UFC 332", "2026-10-03"), "ufc-332-2026-10-03");
  });

  it("round-trips stored bout JSON", () => {
    const cards = parseUpcomingCardDocument({
      event: "UFC 332",
      date: "2026-10-03",
      bouts: [{ fighter_a: "A", fighter_b: "B", weight_class: "Flyweight", card_segment: "Prelims" }],
    });
    const stored = explicitCardFromStored({
      name: "UFC 332",
      date: "2026-10-03",
      location: null,
      tapologyUrl: null,
      boutsJson: serializeBouts(cards[0]!.bouts),
      sortOrder: 0,
    });
    assert.equal(stored?.bouts[0]?.fighterA, "A");
    assert.equal(stored?.bouts[0]?.cardSegment, "Prelims");
    assert.equal(stored?.bouts[0]?.order, 0);
  });
});
