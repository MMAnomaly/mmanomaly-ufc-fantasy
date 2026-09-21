import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CLASS_TO_SLOT, type ClassKey } from "../src/lib/slots";

const prisma = new PrismaClient();

type SeedFighter = {
  name: string;
  tapology_url?: string | null;
  wikipedia_url?: string | null;
  weight_class: string;
  class_key: string;
  sex: string;
  record?: string | null;
  ranking?: unknown;
  next_bout?: unknown;
  last_fight_date?: string | null;
  last_fight_note?: string | null;
  activity_notes?: string | null;
};

type SeedFile = {
  classes: Record<string, { fighters: SeedFighter[] }>;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function fighterId(fighter: SeedFighter) {
  const fromUrl = fighter.tapology_url?.split("/").filter(Boolean).pop();
  if (fromUrl) return fromUrl;
  return `${fighter.class_key}-${slugify(fighter.name)}`;
}

async function seedFighters() {
  const file = path.join(process.cwd(), "data", "fighters_by_class.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as SeedFile;
  const seen = new Set<string>();
  let count = 0;
  const classCounts: Record<string, number> = {};

  for (const [classKey, group] of Object.entries(raw.classes)) {
    const slotKey = CLASS_TO_SLOT[classKey as ClassKey];
    if (!slotKey) {
      console.warn(`Skipping unknown class_key ${classKey}`);
      continue;
    }
    classCounts[classKey] = 0;
    for (const fighter of group.fighters) {
      const id = fighterId(fighter);
      if (seen.has(id)) continue;
      seen.add(id);
      const hasBout = Boolean(fighter.next_bout);
      await prisma.fighter.upsert({
        where: { id },
        update: {
          name: fighter.name,
          classKey,
          slotKey,
          sex: fighter.sex,
          weightClass: fighter.weight_class,
          record: fighter.record ?? null,
          rankingJson: fighter.ranking ? JSON.stringify(fighter.ranking) : null,
          lastFightDate: fighter.last_fight_date ? new Date(fighter.last_fight_date) : null,
          lastFightClass: classKey,
          lastFightNote: fighter.last_fight_note ?? null,
          upcomingFightClass: hasBout ? classKey : null,
          nextBoutJson: fighter.next_bout ? JSON.stringify(fighter.next_bout) : null,
          tapologyUrl: fighter.tapology_url ?? null,
          wikipediaUrl: fighter.wikipedia_url ?? null,
          active: true,
          activityNotes: fighter.activity_notes ?? null,
        },
        create: {
          id,
          name: fighter.name,
          classKey,
          slotKey,
          sex: fighter.sex,
          weightClass: fighter.weight_class,
          record: fighter.record ?? null,
          rankingJson: fighter.ranking ? JSON.stringify(fighter.ranking) : null,
          lastFightDate: fighter.last_fight_date ? new Date(fighter.last_fight_date) : null,
          lastFightClass: classKey,
          lastFightNote: fighter.last_fight_note ?? null,
          upcomingFightClass: hasBout ? classKey : null,
          nextBoutJson: fighter.next_bout ? JSON.stringify(fighter.next_bout) : null,
          tapologyUrl: fighter.tapology_url ?? null,
          wikipediaUrl: fighter.wikipedia_url ?? null,
          active: true,
          activityNotes: fighter.activity_notes ?? null,
        },
      });
      count += 1;
      classCounts[classKey] += 1;
    }
  }

  if (seen.size === 0) {
    throw new Error("Fighter export contained no fighters; leaving existing active flags unchanged.");
  }

  // Drop stale rows out of the draft pool without deleting picks or scores.
  // Ids come from the Tapology slug, so a URL change inserts a new row and this
  // marks the previous id inactive.
  const deactivated = await prisma.fighter.updateMany({
    where: { active: true, id: { notIn: [...seen] } },
    data: { active: false },
  });

  console.log(`Seeded ${count} fighters`);
  if (deactivated.count > 0) {
    console.log(`Marked ${deactivated.count} fighters inactive (absent from export)`);
  }
  for (const [k, v] of Object.entries(classCounts)) {
    console.log(`  ${k}: ${v}`);
  }
}

async function seedDemo() {
  if (process.env.SEED_DEMO !== "true") return;
  const commishEmail = process.env.DEMO_COMMISSIONER_EMAIL ?? "commish@mmanomaly.local";
  const playerEmail = process.env.DEMO_PLAYER_EMAIL ?? "player@mmanomaly.local";
  const commishPass = process.env.DEMO_COMMISSIONER_PASSWORD ?? "draftready";
  const playerPass = process.env.DEMO_PLAYER_PASSWORD ?? "draftready";

  const commissioner = await prisma.user.upsert({
    where: { email: commishEmail },
    update: {},
    create: {
      email: commishEmail,
      displayName: "Commissioner",
      passwordHash: await hash(commishPass, 10),
    },
  });
  const player = await prisma.user.upsert({
    where: { email: playerEmail },
    update: {},
    create: {
      email: playerEmail,
      displayName: "Challenger",
      passwordHash: await hash(playerPass, 10),
    },
  });

  let league = await prisma.league.findFirst({
    where: { commissionerId: commissioner.id, name: "Fight Week Invitational" },
  });
  if (!league) {
    league = await prisma.league.create({
      data: {
        name: "Fight Week Invitational",
        commissionerId: commissioner.id,
        maxTeams: 8,
        pickClockSeconds: 120,
      },
    });
    await prisma.membership.create({
      data: {
        leagueId: league.id,
        userId: commissioner.id,
        teamName: "House Account",
        draftPosition: 1,
      },
    });
    await prisma.membership.create({
      data: {
        leagueId: league.id,
        userId: player.id,
        teamName: "The Pit",
        draftPosition: 2,
      },
    });
    await prisma.invite.create({
      data: {
        leagueId: league.id,
        createdById: commissioner.id,
        token: randomBytes(12).toString("hex"),
      },
    });
  }
  console.log(`Demo league ready. Commissioner ${commishEmail} / player ${playerEmail}`);
}

async function main() {
  await seedFighters();
  await seedDemo();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
