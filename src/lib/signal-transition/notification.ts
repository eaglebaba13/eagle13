// Phase P1 — Signal Transition Notification Bridge.
// Wires signal transitions into the existing Supabase notification table
// using the same schema and patterns as notifications.functions.ts.
// Server-only: imports Supabase client types.

import type { SignalTransition } from "./types";

/**
 * Build a notification row insert payload for a signal transition.
 * Uses existing notification type conventions compatible with the
 * `public.notifications` table.
 *
 * WAIT transitions produce "info" severity.
 * BUY transitions produce "success" severity.
 * SELL transitions produce "danger" severity.
 */
export function buildSignalNotificationPayload(signal: SignalTransition): {
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly link: string;
  readonly payload: Record<string, unknown>;
} {
  const severity =
    signal.current === "BUY" ? "success" :
    signal.current === "SELL" ? "danger" : "info";

  const emoji =
    signal.current === "BUY" ? "🟢" :
    signal.current === "SELL" ? "🔴" : "⏸️";

  const directionLabel =
    signal.current === "BUY" ? "BUY" :
    signal.current === "SELL" ? "SELL" : "WAIT";

  const stateLabel = signal.isDirectional ? "ACTIVE" : "NO ACTIVE DIRECTION";

  const title = `${emoji} Signal: ${directionLabel} — ${signal.instrument}`;

  const bodyLines: string[] = [
    `Signal changed to ${directionLabel} (${stateLabel})`,
  ];

  if (signal.previous) {
    bodyLines.push(`Transition: ${signal.previous} → ${signal.current}`);
  }

  if (signal.price != null && Number.isFinite(signal.price)) {
    bodyLines.push(`Price: ${signal.price.toFixed(2)}`);
  }

  if (signal.confidence != null) {
    bodyLines.push(`Confidence: ${signal.confidence}%`);
  }

  bodyLines.push(`Run: ${signal.runId}`);
  bodyLines.push(`Time: ${signal.timestamp}`);
  bodyLines.push(``);
  bodyLines.push(`Research signal only. No order placed.`);

  return {
    type: severity === "success" ? "BUY_CE" : severity === "danger" ? "BUY_PE" : "EXIT",
    title,
    body: bodyLines.join("\n"),
    link: "/astro",
    payload: {
      signalTransition: {
        id: signal.id,
        previous: signal.previous,
        current: signal.current,
        instrument: signal.instrument,
        price: signal.price,
        confidence: signal.confidence,
        runId: signal.runId,
        tradingDate: signal.tradingDate,
        timestamp: signal.timestamp,
        isDirectional: signal.isDirectional,
      },
      severity,
      category: "SIGNAL_TRANSITION",
    },
  };
}
