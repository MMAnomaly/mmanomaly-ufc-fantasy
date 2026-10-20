import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { upsertFighterPool, upsertUpcomingCards } from "../src/lib/afr-pool";
import { resolveUpcomingCardPath } from "../src/lib/upcoming-card";

const prisma = new PrismaClient();

async function seedFighters() {
  const file = path.join(process.cwd(), "data", "fighters_by_class.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  const result = await upsertFighterPool(prisma, raw);
  console.log(`Seeded ${result.upserted} fighters`);
  if (result.deactivated > 0) {
    console.log(`Marked ${result.deactivated} fighters inactive (absent from export, not on a roster)`);
  }
  if (result.rosteredRetained > 0) {
    console.log(`Left ${result.rosteredRetained} rostered fighters unchanged (absent from export)`);
  }
  for (const classKey of result.skippedClasses) {
    console.warn(`Skipping unknown class_key ${classKey}`);
  }
  for (const [k, v] of Object.entries(result.classCounts)) {
    console.log(`  ${k}: ${v}`);
  }
}

async function seedUpcomingCard() {
  const file = resolveUpcomingCardPath(existsSync);
  if (!file) {
    console.log("No upcoming card file found; leaving UfcCard rows unchanged");
    return;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch (err) {
    throw new Error(`Upcoming card file ${file} is not valid JSON`, { cause: err });
  }

  const result = await upsertUpcomingCards(prisma, raw);
  if (result.unchanged) {
    console.warn(`Upcoming card file ${file} had no dated events; leaving UfcCard rows unchanged`);
    return;
  }
  console.log(`Seeded ${result.upserted} upcoming card event(s) from ${file}`);
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
  await seedUpcomingCard();
  await seedDemo();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
