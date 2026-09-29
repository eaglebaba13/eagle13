#!/usr/bin/env node
/**
 * EagleBABA research milestone Telegram dispatch — operator-only, server-side.
 *
 * Usage:
 *   node scripts/telegram-status.mjs --file status.json
 *   node scripts/telegram-status.mjs --json '{"task":"...","status":"PASS",...}'
 *   node scripts/telegram-status.mjs --stdin < status.json
 *   node scripts/telegram-status.mjs --dry-run --file status.json
 *
 * Payload template (JSON):
 *   {
 *     "task": "P0.0 — Supabase reconciliation + auth stop condition",
 *     "status": "PASS | FAIL | BLOCKED | PARTIAL",
 *     "commitSha": "<sha>" | null,
 *     "testsPassed": 0, "testsTotal": 0, "testsFailed": 0,
 *     "typecheck": "<status>", "lint": "<status>", "build": "<status>",
 *     "deployment": "<status>",
 *     "blockers": ["..."],
 *     "timestamp": "<optional ISO>"
 *   }
 *
 * Credentials are read from process.env (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID),
 * exactly like the rest of the Telegram delivery path. This script never prints
 * credentials, Authorization headers, or any environment value, never sends
 * automatically, and never requires the application browser to be running.
 *
 * Exit codes:
 *   0 DELIVERED | 2 RETRYABLE_FAILURE | 3 FAILED | 4 CONFIGURATION_ERROR
 *   5 DISABLED  | 6 usage / invalid payload
 *
 * Requires Node.js 22.18+ or 24+ (native TypeScript type stripping, used to
 * import the server-only delivery module directly).
 */
import { readFileSync } from "node:fs";

const EXIT = {
  DELIVERED: 0,
  RETRYABLE_FAILURE: 2,
  FAILED: 3,
  CONFIGURATION_ERROR: 4,
  DISABLED: 5,
};
const USAGE_EXIT = 6;
const LEVELS = ["PASS", "FAIL", "BLOCKED", "PARTIAL"];

const USAGE = [
  "usage: node scripts/telegram-status.mjs [--file <path> | --json <json> | --stdin] [--dry-run]",
  "",
  "dispatch an EagleBABA research milestone status update to Telegram.",
  "requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in process.env.",
  "exit: 0 DELIVERED, 2 RETRYABLE_FAILURE, 3 FAILED, 4 CONFIGURATION_ERROR, 6 usage error.",
].join("\n");

function die(message) {
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exit(USAGE_EXIT);
}

const argv = process.argv.slice(2);
const opts = { file: null, json: null, stdin: false, dryRun: false };

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--file") opts.file = argv[(i += 1)] ?? null;
  else if (arg === "--json") opts.json = argv[(i += 1)] ?? null;
  else if (arg === "--stdin") opts.stdin = true;
  else if (arg === "--dry-run") opts.dryRun = true;
  else if (arg === "--help" || arg === "-h") {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  } else die(`unknown argument: ${arg}`);
  if ((arg === "--file" || arg === "--json") && !argv[i]) die(`missing value for ${arg}`);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function validate(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return "payload must be a JSON object";
  }
  for (const key of ["task", "status", "typecheck", "lint", "build", "deployment"]) {
    if (typeof input[key] !== "string" || input[key].trim() === "") {
      return `"${key}" must be a non-empty string`;
    }
  }
  if (!LEVELS.includes(input.status)) return `"status" must be one of ${LEVELS.join(" | ")}`;
  for (const key of ["testsPassed", "testsTotal", "testsFailed"]) {
    if (typeof input[key] !== "number" || !Number.isFinite(input[key])) {
      return `"${key}" must be a finite number`;
    }
  }
  if (
    input.commitSha !== undefined &&
    input.commitSha !== null &&
    typeof input.commitSha !== "string"
  ) {
    return '"commitSha" must be a string or null';
  }
  if (
    input.blockers !== undefined &&
    (!Array.isArray(input.blockers) || input.blockers.some((b) => typeof b !== "string"))
  ) {
    return '"blockers" must be an array of strings';
  }
  if (input.timestamp !== undefined && typeof input.timestamp !== "string") {
    return '"timestamp" must be a string';
  }
  return null;
}

let raw;
if (opts.json !== null) raw = opts.json;
else if (opts.file !== null) {
  try {
    raw = readFileSync(opts.file, "utf8");
  } catch {
    die(`cannot read payload file: ${opts.file}`);
  }
} else if (opts.stdin) raw = await readStdin();
else die("no payload provided");

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  die("payload is not valid JSON");
}

const problem = validate(parsed);
if (problem) die(`invalid payload: ${problem}`);

const status = {
  task: parsed.task,
  status: parsed.status,
  commitSha: parsed.commitSha ?? null,
  testsPassed: parsed.testsPassed,
  testsTotal: parsed.testsTotal,
  testsFailed: parsed.testsFailed,
  typecheck: parsed.typecheck,
  lint: parsed.lint,
  build: parsed.build,
  deployment: parsed.deployment,
  blockers: (parsed.blockers ?? []).map((b) => String(b)),
  ...(parsed.timestamp ? { timestamp: parsed.timestamp } : {}),
};

let renderResearchStatusMessage;
let sendResearchStatus;
try {
  ({ renderResearchStatusMessage, sendResearchStatus } =
    await import("../src/lib/smart-alerts/telegram-delivery.server.ts"));
} catch (err) {
  process.stderr.write(
    `unable to load the server-only Telegram delivery module (${err instanceof Error ? err.message : String(err)})\n`,
  );
  process.stderr.write("Node.js 22.18+ or 24+ is required for native TypeScript type stripping.\n");
  process.exit(USAGE_EXIT);
}

if (opts.dryRun) {
  process.stdout.write(`${renderResearchStatusMessage(status)}\n`);
  process.stdout.write("dry-run: nothing sent\n");
  process.exit(0);
}

const outcome = await sendResearchStatus(status);

process.stdout.write(
  `${JSON.stringify(
    {
      status: outcome.status,
      errorCode: outcome.errorCode,
      attemptedAt: outcome.attemptedAt,
      statusTimestamp: outcome.statusTimestamp,
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`\n${outcome.rendered}\n`);

process.exit(EXIT[outcome.status] ?? 3);
