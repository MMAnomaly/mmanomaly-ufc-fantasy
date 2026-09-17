import * as cheerio from "cheerio";
import { prisma } from "./prisma";
import {
  computeDkClassicPoints,
  isFinishMethod,
  parseClockToSeconds,
  type ScoreBreakdown,
} from "./scoring";

const COMPLETED_URL = "http://ufcstats.com/statistics/events/completed";
const UA =
  "MMAnomalyFantasy/1.0 (+https://github.com/MMAnomaly/mmanomaly-ufc-fantasy; educational scoring ingest)";

export type ParsedStatLine = {
  fighterName: string;
  knockdowns: number;
  strikes: number;
  sigStrikes: number;
  takedowns: number;
  reversals: number;
  controlTimeSeconds: number;
  isWinner: boolean;
};

export type ParsedFight = {
  url?: string;
  fighter1Name: string;
  fighter2Name: string;
  winnerName: string | null;
  method: string | null;
  round: number | null;
  time: string | null;
  weightClass?: string | null;
  stats: ParsedStatLine[];
};

export type ParsedEvent = {
  externalId: string;
  name: string;
  date: Date;
  url?: string;
  source: string;
  fights: ParsedFight[];
};

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

export async function matchFighterId(name: string): Promise<string | null> {
  const target = normalizeName(name);
  if (!target) return null;
  const fighters = await prisma.fighter.findMany({ select: { id: true, name: true } });
  const exact = fighters.find((f) => normalizeName(f.name) === target);
  if (exact) return exact.id;
  const contains = fighters.filter((f) => {
    const n = normalizeName(f.name);
    return n.includes(target) || target.includes(n);
  });
  return contains.length === 1 ? contains[0].id : null;
}

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

export function parseCompletedEvents(html: string): { name: string; date: string; url: string }[] {
  const $ = cheerio.load(html);
  const events: { name: string; date: string; url: string }[] = [];
  $("table.b-statistics__table-events tbody tr").each((_, row) => {
    const link = $(row).find("a").first();
    const href = link.attr("href");
    const name = link.text().trim();
    const date = $(row).find(".b-statistics__date").first().text().trim();
    if (href && name) events.push({ name, date, url: href });
  });
  return events;
}

function parseIntSafe(value: string) {
  const n = parseInt(value.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseControl(value: string) {
  const seconds = parseClockToSeconds(value.trim());
  return seconds ?? 0;
}

export function parseFightDetail(html: string, url?: string): ParsedFight {
  const $ = cheerio.load(html);
  const names = $("div.b-fight-details__person")
    .map((_, el) => $(el).find("a.b-fight-details__person-link").text().trim())
    .get()
    .filter(Boolean);
  const statuses = $("div.b-fight-details__person")
    .map((_, el) => $(el).find("i.b-fight-details__person-status").text().trim().toUpperCase())
    .get();

  const fighter1Name = names[0] || "Unknown";
  const fighter2Name = names[1] || "Unknown";
  const winnerName =
    statuses[0] === "W" ? fighter1Name : statuses[1] === "W" ? fighter2Name : null;

  let method: string | null = null;
  let round: number | null = null;
  let time: string | null = null;
  $("i.b-fight-details__text-item").each((_, el) => {
    const label = $(el).find("i.b-fight-details__label").text().trim().toLowerCase();
    const text = $(el).clone().children().remove().end().text().trim();
    if (label.includes("method")) method = $(el).text().replace(/Method:/i, "").trim();
    if (label.includes("round")) round = parseIntSafe(text);
    if (label.startsWith("time") && !label.includes("time format")) time = text;
  });

  const totalsRow = $("section.b-fight-details__section table").first().find("tbody tr").first();
  const cells = totalsRow.find("td");
  const col = (index: number) =>
    cells
      .eq(index)
      .find("p")
      .map((_, p) => $(p).text().trim())
      .get();

  const kd = col(1);
  const sig = col(2);
  const totalStr = col(4);
  const td = col(5);
  const rev = col(7);
  const ctrl = col(8);

  const line = (i: number, name: string): ParsedStatLine => ({
    fighterName: name,
    knockdowns: parseIntSafe(kd[i] ?? "0"),
    strikes: parseIntSafe((totalStr[i] ?? "0").split(" of ")[0] ?? "0"),
    sigStrikes: parseIntSafe((sig[i] ?? "0").split(" of ")[0] ?? "0"),
    takedowns: parseIntSafe((td[i] ?? "0").split(" of ")[0] ?? "0"),
    reversals: parseIntSafe(rev[i] ?? "0"),
    controlTimeSeconds: parseControl(ctrl[i] ?? "0:00"),
    isWinner: winnerName === name,
  });

  return {
    url,
    fighter1Name,
    fighter2Name,
    winnerName,
    method,
    round,
    time,
    stats: [line(0, fighter1Name), line(1, fighter2Name)],
  };
}

export async function ingestLatestCompletedEvent(): Promise<ParsedEvent> {
  const listHtml = await fetchHtml(`${COMPLETED_URL}?page=all`);
  const events = parseCompletedEvents(listHtml);
  const latest = events[0];
  if (!latest) throw new Error("No completed events found on UFC Stats.");
  return ingestEventByUrl(latest.url, latest.name, latest.date);
}

export async function ingestEventByUrl(url: string, name?: string, dateText?: string): Promise<ParsedEvent> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const eventName = name || $("h2.b-content__title").text().trim() || "UFC Stats Event";
  const dateRaw =
    dateText ||
    $("li.b-list__box-list-item")
      .filter((_, el) => $(el).text().toLowerCase().includes("date"))
      .first()
      .text()
      .replace(/Date:/i, "")
      .trim();
  const date = dateRaw ? new Date(dateRaw) : new Date();
  const fightLinks = $("tr.b-fight-details__table-row a.b-flag")
    .map((_, a) => $(a).attr("href"))
    .get()
    .filter((href): href is string => Boolean(href) && href.includes("fight-details"));
  const unique = [...new Set(fightLinks)];
  const fights: ParsedFight[] = [];
  for (const fightUrl of unique) {
    const fightHtml = await fetchHtml(fightUrl);
    fights.push(parseFightDetail(fightHtml, fightUrl));
  }
  return {
    externalId: url,
    name: eventName,
    date,
    url,
    source: "ufcstats",
    fights,
  };
}

export async function persistAndScoreEvent(event: ParsedEvent, source: string) {
  const job = await prisma.scoringJob.create({
    data: { status: "running", source, log: `Scoring ${event.name}` },
  });
  const logs: string[] = [`Event: ${event.name}`];

  try {
    const savedEvent = await prisma.ufcEvent.upsert({
      where: { externalId: event.externalId },
      update: { name: event.name, date: event.date, url: event.url, source: event.source },
      create: {
        externalId: event.externalId,
        name: event.name,
        date: event.date,
        url: event.url,
        source: event.source,
      },
    });

    await prisma.fight.deleteMany({ where: { eventId: savedEvent.id } });
    await prisma.fantasyScore.deleteMany({ where: { eventId: savedEvent.id } });

    for (const [index, fight] of event.fights.entries()) {
      const fighter1Id = await matchFighterId(fight.fighter1Name);
      const fighter2Id = await matchFighterId(fight.fighter2Name);
      const savedFight = await prisma.fight.create({
        data: {
          eventId: savedEvent.id,
          boutOrder: index,
          method: fight.method,
          round: fight.round,
          time: fight.time,
          winnerName: fight.winnerName,
          fighter1Name: fight.fighter1Name,
          fighter2Name: fight.fighter2Name,
          fighter1Id,
          fighter2Id,
          ufcStatsUrl: fight.url,
        },
      });

      for (const line of fight.stats) {
        const fighterId = await matchFighterId(line.fighterName);
        const timeSecondsInRound = parseClockToSeconds(fight.time);
        const finish = Boolean(line.isWinner && isFinishMethod(fight.method));
        const breakdown: ScoreBreakdown = computeDkClassicPoints({
          strikes: line.strikes,
          sigStrikes: line.sigStrikes,
          controlTimeSeconds: line.controlTimeSeconds,
          takedowns: line.takedowns,
          reversals: line.reversals,
          knockdowns: line.knockdowns,
          isWinner: line.isWinner,
          method: fight.method,
          round: fight.round,
          timeSecondsInRound,
        });

        await prisma.fightStatLine.create({
          data: {
            fightId: savedFight.id,
            fighterId,
            fighterName: line.fighterName,
            isWinner: line.isWinner,
            knockdowns: line.knockdowns,
            strikes: line.strikes,
            sigStrikes: line.sigStrikes,
            takedowns: line.takedowns,
            reversals: line.reversals,
            controlTimeSeconds: line.controlTimeSeconds,
            result: line.isWinner ? "WIN" : fight.winnerName ? "LOSS" : "NC",
            method: fight.method,
            round: fight.round,
            timeSecondsInRound,
            finish,
            rawJson: JSON.stringify(line),
          },
        });

        if (fighterId) {
          await prisma.fantasyScore.upsert({
            where: { eventId_fighterId: { eventId: savedEvent.id, fighterId } },
            update: { points: breakdown.total, breakdown: JSON.stringify(breakdown) },
            create: {
              eventId: savedEvent.id,
              fighterId,
              points: breakdown.total,
              breakdown: JSON.stringify(breakdown),
            },
          });
          logs.push(`${line.fighterName}: ${breakdown.total} pts`);
        } else {
          logs.push(`${line.fighterName}: unmatched, not scored`);
        }
      }
    }

    await prisma.scoringJob.update({
      where: { id: job.id },
      data: {
        status: "ok",
        eventId: savedEvent.id,
        finishedAt: new Date(),
        log: logs.join("\n"),
      },
    });
    return { eventId: savedEvent.id, log: logs.join("\n") };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.scoringJob.update({
      where: { id: job.id },
      data: { status: "error", finishedAt: new Date(), log: `${logs.join("\n")}\nERROR: ${message}` },
    });
    throw err;
  }
}

export async function runSundayScoringJob(source = "cron") {
  const parsed = await ingestLatestCompletedEvent();
  return persistAndScoreEvent(parsed, source);
}
