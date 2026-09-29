// Server-only Telegram delivery provider for Smart Alerts.
// NEVER expose TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID to the browser.

import type {
  AlertDeliveryAttempt,
  AlertDeliveryProviderId,
  AlertEvent,
  AlertSubscription,
} from "./types";
import type { AlertDeliveryProvider } from "./delivery";

export type TelegramDeliveryStatus =
  "DELIVERED" | "FAILED" | "DISABLED" | "RETRYABLE_FAILURE" | "CONFIGURATION_ERROR";

function getTelegramEnv(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return null;
  return { token, chatId };
}

// Defence in depth: nothing derived from a network response or thrown error may
// ever carry a credential out of this module.
function redactCredentials(text: string, env: { token: string; chatId: string }): string {
  let out = text;
  if (env.token) out = out.split(env.token).join("[REDACTED]");
  if (env.chatId) out = out.split(env.chatId).join("[REDACTED]");
  return out;
}

function formatTelegramMessage(event: AlertEvent): string {
  const lines: string[] = [];

  const priorityEmoji: Record<string, string> = {
    CRITICAL: "\u26a0\ufe0f",
    HIGH: "\ud83d\udd34",
    MEDIUM: "\ud83d\udfe1",
    LOW: "\ud83d\udfe2",
    INFO: "\u2139\ufe0f",
  };

  lines.push(`${priorityEmoji[event.priority] ?? ""} **${event.title}**`);
  lines.push("");

  if (event.instrument) {
    lines.push(`\ud83c\udfaf Instrument: ${event.instrument}`);
  }

  lines.push(`\ud83d\udcca Type: ${event.type}`);
  lines.push(`\u2696\ufe0f Priority: ${event.priority}`);
  lines.push(`\ud83d\udcc5 Date: ${event.tradingDate}`);

  if (event.previousState || event.currentState) {
    lines.push("");
    lines.push(`\u2b05\ufe0f Previous: ${event.previousState ?? "N/A"}`);
    lines.push(`\u27a1\ufe0f Current: ${event.currentState ?? "N/A"}`);
  }

  if (event.summary) {
    lines.push("");
    lines.push(event.summary);
  }

  if (event.evidence.length > 0) {
    lines.push("");
    lines.push("\ud83d\udcdd Evidence:");
    for (const e of event.evidence.slice(0, 5)) {
      const avail = e.available ? "\u2705" : "\u274c";
      lines.push(
        `  ${avail} ${e.module}: ${e.previous ?? "N/A"} \u2192 ${e.current ?? "N/A"} [${e.freshness}]`,
      );
    }
  }

  lines.push("");
  lines.push(`\ud83d\udce1 Source: ${event.sourceModules.join(", ")}`);
  lines.push(`\u23f0 Freshness: ${event.freshness}`);
  lines.push(`\ud83d\udd17 Run: ${event.id.slice(0, 8)}`);
  lines.push("");
  lines.push(`_${event.disclaimer}_`);

  return lines.join("\n");
}

type TelegramSendResult = { status: TelegramDeliveryStatus; errorCode: string | null };

type TelegramParseMode = "Markdown" | "HTML";

// The single server-side Bot API transport for this repository.
// Every Telegram message path routes through here — no second HTTP client.
// Credentials are read from process.env only, never logged, and never included
// in returned error codes. Callers own their own message formatting.
async function postTelegramMessage(
  text: string,
  parseMode?: TelegramParseMode,
): Promise<TelegramSendResult> {
  const env = getTelegramEnv();
  if (!env) {
    return { status: "CONFIGURATION_ERROR", errorCode: "MISSING_TELEGRAM_CREDENTIALS" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(`https://api.telegram.org/bot${env.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.chatId,
        text,
        ...(parseMode ? { parse_mode: parseMode } : {}),
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const isRetryable = response.status === 429 || response.status >= 500;
      return {
        status: isRetryable ? "RETRYABLE_FAILURE" : "FAILED",
        errorCode: redactCredentials(
          `TELEGRAM_HTTP_${response.status}: ${body.slice(0, 100)}`,
          env,
        ),
      };
    }

    const data = (await response.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      return {
        status: "FAILED",
        errorCode: redactCredentials(`TELEGRAM_API_ERROR: ${data.description ?? "unknown"}`, env),
      };
    }

    return { status: "DELIVERED", errorCode: null };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "RETRYABLE_FAILURE", errorCode: "TELEGRAM_TIMEOUT" };
    }
    return {
      status: "RETRYABLE_FAILURE",
      errorCode: redactCredentials(
        `TELEGRAM_NETWORK_ERROR: ${err instanceof Error ? err.message : String(err)}`,
        env,
      ),
    };
  }
}

export async function sendTelegramMessage(
  event: AlertEvent,
): Promise<{ status: TelegramDeliveryStatus; errorCode: string | null }> {
  return postTelegramMessage(formatTelegramMessage(event), "Markdown");
}

export const TelegramServerAlertDeliveryProvider: AlertDeliveryProvider = {
  id: "TELEGRAM" as AlertDeliveryProviderId,
  get enabled() {
    return getTelegramEnv() !== null;
  },
  async deliver(
    event: AlertEvent,
    sub: AlertSubscription | null,
    nowIso: string,
  ): Promise<AlertDeliveryAttempt> {
    const telegramEnabled = sub?.telegramEnabled ?? true;
    if (!telegramEnabled) {
      return {
        provider: "TELEGRAM",
        attemptedAt: nowIso,
        status: "SKIPPED",
        errorCode: null,
        retryable: false,
        fingerprint: event.fingerprint,
      };
    }

    const env = getTelegramEnv();
    if (!env) {
      return {
        provider: "TELEGRAM",
        attemptedAt: nowIso,
        status: "DISABLED",
        errorCode: "MISSING_TELEGRAM_CREDENTIALS",
        retryable: false,
        fingerprint: event.fingerprint,
      };
    }

    const result = await sendTelegramMessage(event);
    return {
      provider: "TELEGRAM",
      attemptedAt: nowIso,
      status:
        result.status === "DELIVERED"
          ? "DELIVERED"
          : result.status === "CONFIGURATION_ERROR"
            ? "DISABLED"
            : result.status === "RETRYABLE_FAILURE"
              ? "RETRY"
              : "FAILED",
      errorCode: result.errorCode,
      retryable: result.status === "RETRYABLE_FAILURE",
      fingerprint: event.fingerprint,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Research milestone status reporting (operator dispatch primitive only).
//
// This is NOT wired to any cron, build hook, git hook, route, or browser call.
// It is invoked explicitly by an operator/server-side script.
// ─────────────────────────────────────────────────────────────────────────────

export type ResearchStatusLevel = "PASS" | "FAIL" | "BLOCKED" | "PARTIAL";

/**
 * Strict, immutable milestone status payload.
 * Every field is required except `timestamp`, which is optional operator
 * bookkeeping echoed back in the delivery result (it is never rendered into the
 * message body — the message format is fixed).
 */
export interface ResearchStatus {
  readonly task: string;
  readonly status: ResearchStatusLevel;
  readonly commitSha: string | null;
  readonly testsPassed: number;
  readonly testsTotal: number;
  readonly testsFailed: number;
  readonly typecheck: string;
  readonly lint: string;
  readonly build: string;
  readonly deployment: string;
  readonly blockers: readonly string[];
  readonly timestamp?: string;
}

/**
 * Delivery outcome. `status` reuses the canonical Telegram delivery vocabulary:
 * DELIVERED | FAILED | RETRYABLE_FAILURE | CONFIGURATION_ERROR (and the reserved
 * DISABLED, which this primitive never returns because it has no per-subscription
 * opt-out — DISABLED remains meaningful only for the subscription-aware provider).
 */
export interface ResearchStatusDelivery {
  readonly status: TelegramDeliveryStatus;
  readonly errorCode: string | null;
  readonly attemptedAt: string;
  readonly rendered: string;
  readonly statusTimestamp: string | null;
}

const RESEARCH_LABEL_WIDTH = 12;

function researchLine(label: string, value: string): string {
  return `${label.padEnd(RESEARCH_LABEL_WIDTH, " ")}${value}`;
}

function researchText(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "NOT PROVIDED";
}

function researchCount(value: number): string {
  return Number.isFinite(value) && value >= 0 ? String(Math.trunc(value)) : "?";
}

function researchBlockers(blockers: readonly string[]): string {
  const items = blockers.map((b) => b.trim()).filter((b) => b.length > 0);
  if (items.length === 0) return "NONE";
  return items.map((b, i) => `${i + 1}. ${b}`).join("; ");
}

/**
 * Renders the canonical milestone message. Deterministic and side-effect free.
 * Plain text on purpose: blocker/status text is operator-supplied and must never
 * be interpreted as Telegram markup.
 */
export function renderResearchStatusMessage(status: ResearchStatus): string {
  const sha = status.commitSha?.trim();
  const tests = `${researchCount(status.testsPassed)}/${researchCount(status.testsTotal)} passed, ${researchCount(status.testsFailed)} failed`;

  return [
    `[EagleBABA] ${researchText(status.task)} \u2014 ${status.status}`,
    "",
    researchLine("commit_sha:", sha && sha.length > 0 ? sha : "NOT COMMITTED"),
    researchLine("tests:", tests),
    researchLine("typecheck:", researchText(status.typecheck)),
    researchLine("lint:", researchText(status.lint)),
    researchLine("build:", researchText(status.build)),
    researchLine("deployment:", researchText(status.deployment)),
    researchLine("blockers:", researchBlockers(status.blockers)),
  ].join("\n");
}

/**
 * Dispatch a research milestone status update through the shared Telegram transport.
 * Never throws; never logs; never returns or embeds credentials.
 */
export async function sendResearchStatus(status: ResearchStatus): Promise<ResearchStatusDelivery> {
  const rendered = renderResearchStatusMessage(status);
  const result = await postTelegramMessage(rendered);
  const stamp = status.timestamp?.trim();

  return {
    status: result.status,
    errorCode: result.errorCode,
    attemptedAt: new Date().toISOString(),
    rendered,
    statusTimestamp: stamp && stamp.length > 0 ? stamp : null,
  };
}
