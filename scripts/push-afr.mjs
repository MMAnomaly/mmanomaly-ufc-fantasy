#!/usr/bin/env node
/**
 * Push Active Fighter Repository JSON to the deployed app.
 * Node 20, built-in fetch, no dependencies.
 *
 *   node scripts/push-afr.mjs --results <file>...
 *   node scripts/push-afr.mjs --cards <folder>
 *   node scripts/push-afr.mjs --cards <folder> --results <file>...
 *   node scripts/push-afr.mjs --pool-plan <file> [--dry-run]
 *
 * The cards folder must contain fighters_by_class.json and upcoming_card.json.
 * Optional released.json, cut.json, retired.json, inactive.json, and
 * left_ufc.json are forwarded as removal lists. Each file is a JSON array of
 * names, URLs, or { name, tapology_url } objects.
 *
 * Reads APP_URL and ADMIN_IMPORT_SECRET from the environment.
 * Results files are posted oldest event date first. When both flags are
 * set, the card reload is posted first so new fighters exist before scoring.
 * Prints response bodies and never prints the secret.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function usage() {
  console.log(`Usage:
  node scripts/push-afr.mjs --results <file>...
  node scripts/push-afr.mjs --cards <folder containing fighters_by_class.json and upcoming_card.json>
                         optional released.json, cut.json, retired.json, inactive.json, left_ufc.json
  node scripts/push-afr.mjs --cards <folder> --results <file>...
  node scripts/push-afr.mjs --pool-plan <file> [--dry-run]`);
}

function parseArgs(argv) {
  if (argv.length === 0) {
    usage();
    process.exit(1);
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    usage();
    process.exit(0);
  }

  /** @type {string[]} */
  const resultFiles = [];
  /** @type {string | null} */
  let cardsFolder = null;
  /** @type {string | null} */
  let poolPlan = null;
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--results") {
      const before = resultFiles.length;
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        i += 1;
        resultFiles.push(argv[i]);
      }
      if (resultFiles.length === before) fail("--results requires at least one file");
    } else if (arg === "--cards") {
      const folder = argv[i + 1];
      if (!folder || folder.startsWith("--")) fail("--cards requires a folder");
      if (cardsFolder) fail("--cards was given more than once");
      cardsFolder = folder;
      i += 1;
    } else if (arg === "--pool-plan") {
      const file = argv[i + 1];
      if (!file || file.startsWith("--")) fail("--pool-plan requires a file");
      if (poolPlan) fail("--pool-plan was given more than once");
      poolPlan = file;
      i += 1;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else {
      fail(`Unknown argument ${arg}`);
    }
  }

  if (dryRun && !poolPlan) fail("--dry-run is only valid with --pool-plan");
  if (!cardsFolder && resultFiles.length === 0 && !poolPlan) {
    usage();
    process.exit(1);
  }
  return { resultFiles, cardsFolder, poolPlan, dryRun };
}

function readJson(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Could not read ${file}: ${message}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Could not parse ${file}: ${message}`);
  }
}

function loadResults(files) {
  const loaded = files.map((file) => {
    const raw = readJson(file);
    const date = raw && raw.event && typeof raw.event.date === "string" ? raw.event.date : "";
    if (!ISO_DATE.test(date)) fail(`${file} is missing event.date (YYYY-MM-DD)`);
    return { file, date, raw };
  });
  loaded.sort((a, b) => a.date.localeCompare(b.date) || a.file.localeCompare(b.file));
  return loaded;
}

function loadCards(folder) {
  let stat;
  try {
    stat = statSync(folder);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Could not read cards folder ${folder}: ${message}`);
  }
  if (!stat.isDirectory()) fail("--cards must be a folder");
  const fightersFile = path.join(folder, "fighters_by_class.json");
  const cardFile = path.join(folder, "upcoming_card.json");
  const payload = {
    fightersByClass: readJson(fightersFile),
    upcomingCard: readJson(cardFile),
  };
  for (const [key, fileName] of [
    ["released", "released.json"],
    ["cut", "cut.json"],
    ["retired", "retired.json"],
    ["inactive", "inactive.json"],
    ["left_ufc", "left_ufc.json"],
  ]) {
    const file = path.join(folder, fileName);
    if (existsSync(file)) payload[key] = readJson(file);
  }
  return payload;
}

async function postImport(endpoint, secret, kind, data, label, dryRun = false) {
  console.log(`POST ${kind} ${label}`);
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(dryRun ? { kind, data, dryRun: true } : { kind, data }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Request failed for ${label}: ${message}`);
  }

  const text = await response.text();
  console.log(`HTTP ${response.status}`);
  console.log(text);
  if (!response.ok) process.exit(1);
}

async function main() {
  const { resultFiles, cardsFolder, poolPlan, dryRun } = parseArgs(process.argv.slice(2));

  const appUrl = process.env.APP_URL;
  const secret = process.env.ADMIN_IMPORT_SECRET;
  if (!appUrl) fail("APP_URL is not set");
  if (!secret) fail("ADMIN_IMPORT_SECRET is not set");

  let endpoint;
  try {
    endpoint = new URL("/api/admin/import", appUrl).toString();
  } catch {
    fail("APP_URL must be an absolute URL");
  }
  if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
    fail("APP_URL must be an http(s) URL");
  }

  const results = loadResults(resultFiles);
  const cards = cardsFolder ? loadCards(cardsFolder) : null;

  if (cards) {
    await postImport(endpoint, secret, "cards", cards, cardsFolder);
  }
  for (const entry of results) {
    await postImport(endpoint, secret, "results", entry.raw, `${entry.file} (${entry.date})`);
  }
  if (poolPlan) {
    await postImport(endpoint, secret, "pool", readJson(poolPlan), poolPlan, dryRun);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  fail(message);
});
