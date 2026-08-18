// Phase 2 — Signal Transition Delivery. Server-only.
// Wired into the Decision Engine lifecycle (NOT morning brief).
// Handles: atomic state persistence, transition event logging, Telegram delivery.
// No broker execution. No order placement. No formula changes. No `any`.

import type { DecisionAction, SignalState } from "@/lib/signal-transition/types";
import { decisionActionToSignalState } from "@/lib/signal-transition/types";
import { formatSignalTelegramMessage } from "@/lib/signal-transition/engine";
import type { SignalTransition } from "@/lib/signal-transition/types";
import {
  evaluateDecisionSignalTransition,
  type DecisionSignalInput,
} from "./signal-transition-lifecycle";

// ---------------------------------------------------------------------------
// Main entry point — called by Decision Engine after persistence
// ---------------------------------------------------------------------------

export interface SignalTransitionDeliveryResult {
  readonly evaluated: boolean;
  readonly transitionOccurred: boolean;
  readonly previousSignal: SignalState | null;
  readonly currentSignal: SignalState;
  readonly telegramDelivered: boolean;
  readonly statePersisted: boolean;
  readonly eventLogged: boolean;
  readonly safeError: string | null;
}

/**
 * Run the signal transition lifecycle after a Decision Engine evaluation.
 * Uses an atomic database RPC (upsert_signal_transition) to prevent
 * concurrent evaluations from producing duplicate transition events.
 *
 * Priority order:
 * 1. Load previous state from Supabase (read-only)
 * 2. Evaluate transition (deterministic engine)
 * 3. Atomic state upsert + event log via RPC (database-side concurrency safety)
 * 4. Deliver Telegram (non-blocking side effect)
 * 5. Update event delivery status via RPC
 */
export async function runSignalTransitionAfterDecision(
  input: DecisionSignalInput,
): Promise<SignalTransitionDeliveryResult> {
  try {
    // Step 1: Load previous state (for in-engine transition detection)
    const previousSignal = await loadPreviousSignalState(input.instrument);

    // Step 2: Evaluate transition (deterministic, no I/O)
    const evaluation = evaluateDecisionSignalTransition(input, previousSignal);

    // Step 3: Atomic state persistence + event logging via RPC
    let statePersisted = false;
    let eventLogged = false;
    let actualPrevious: SignalState | null = previousSignal;
    const fingerprint = evaluation.transitionId ?? `same-state-${evaluation.currentSignal}`;

    try {
      const rpcResult = await atomicUpsertTransition({
        instrument: input.instrument,
        signalScope: "DECISION_ENGINE",
        expectedPrevious: previousSignal,
        newState: evaluation.currentSignal,
        decisionAction: input.decisionAction,
        decisionRunId: input.decisionRunId,
        evaluatedAt: input.evaluatedAt,
        fingerprint,
      });
      statePersisted = true;
      if (rpcResult.transitioned) {
        eventLogged = true;
        actualPrevious = rpcResult.actualPrevious;
      }
    } catch {
      // State persistence failure must not block
    }

    if (!evaluation.transitionOccurred || !eventLogged) {
      return {
        evaluated: true,
        transitionOccurred: false,
        previousSignal: actualPrevious,
        currentSignal: evaluation.currentSignal,
        telegramDelivered: false,
        statePersisted,
        eventLogged: false,
        safeError: null,
      };
    }

    // Step 4: Deliver Telegram (non-blocking)
    let telegramDelivered = false;
    try {
      telegramDelivered = await deliverSignalTransitionTelegram(evaluation.transition!);
    } catch {
      // Telegram failure must not break the Decision Engine lifecycle
    }

    // Step 5: Update event delivery status
    try {
      await updateEventDelivery(fingerprint, telegramDelivered, null);
    } catch {
      // Best-effort update
    }

    return {
      evaluated: true,
      transitionOccurred: true,
      previousSignal: actualPrevious,
      currentSignal: evaluation.currentSignal,
      telegramDelivered,
      statePersisted,
      eventLogged,
      safeError: null,
    };
  } catch (err) {
    return {
      evaluated: false,
      transitionOccurred: false,
      previousSignal: null,
      currentSignal: decisionActionToSignalState(input.decisionAction),
      telegramDelivered: false,
      statePersisted: false,
      eventLogged: false,
      safeError: sanitizeError(err instanceof Error ? err.message : String(err)),
    };
  }
}

// ---------------------------------------------------------------------------
// Supabase persistence — atomic signal_transition_state via RPC
// ---------------------------------------------------------------------------

interface AtomicUpsertInput {
  instrument: string;
  signalScope: string;
  expectedPrevious: SignalState | null;
  newState: SignalState;
  decisionAction: DecisionAction;
  decisionRunId: string;
  evaluatedAt: string;
  fingerprint: string;
}

interface AtomicUpsertResult {
  transitioned: boolean;
  actualPrevious: SignalState | null;
  currentState: SignalState;
  fingerprint: string;
}

/**
 * Load the previous signal state from Supabase.
 * Returns null if no previous state exists.
 */
async function loadPreviousSignalState(instrument: string): Promise<SignalState | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("signal_transition_state")
      .select("current_state")
      .eq("instrument", instrument)
      .eq("signal_scope", "DECISION_ENGINE")
      .maybeSingle();

    if (!data) return null;
    const state = data.current_state;
    if (state === "BUY" || state === "SELL" || state === "WAIT") return state;
    return null;
  } catch {
    return null;
  }
}

/**
 * Atomic state upsert via Supabase RPC.
 * The database function uses SELECT FOR UPDATE to prevent concurrent
 * evaluations from both claiming the same previous state.
 */
async function atomicUpsertTransition(input: AtomicUpsertInput): Promise<AtomicUpsertResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data, error } = await supabaseAdmin.rpc("upsert_signal_transition", {
    _instrument: input.instrument,
    _signal_scope: input.signalScope,
    _expected_previous: input.expectedPrevious ?? (null as unknown as string),
    _new_state: input.newState,
    _decision_action: input.decisionAction,
    _decision_run_id: input.decisionRunId,
    _evaluated_at: input.evaluatedAt,
    _fingerprint: input.fingerprint,
  });

  if (error) throw new Error(`atomic_upsert_failed:${sanitizeError(error.message)}`);

  // RPC returns JSON with snake_case keys from PL/pgSQL jsonb_build_object
  const raw = data as unknown as Record<string, unknown> | null;
  return {
    transitioned: Boolean(raw?.transitioned),
    actualPrevious: (raw?.actual_previous as SignalState) ?? null,
    currentState: (raw?.current_state as SignalState) ?? input.newState,
    fingerprint: String(raw?.fingerprint ?? input.fingerprint),
  };
}

// ---------------------------------------------------------------------------
// Event delivery status update
// ---------------------------------------------------------------------------

/**
 * Update the telegram delivery status on the transition event.
 * Uses the dedicated Supabase RPC for a clean, typed update.
 */
async function updateEventDelivery(
  fingerprint: string,
  delivered: boolean,
  error: string | null,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  await supabaseAdmin.rpc("update_signal_transition_event_delivery", {
    _fingerprint: fingerprint,
    _delivered: delivered,
    _error: error ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Telegram delivery
// ---------------------------------------------------------------------------

function sanitizeError(message: string): string {
  return message
    .replace(/token|secret|authorization|cookie|api[-_]?key|bearer|chat[_ -]?id/gi, "[REDACTED]")
    .slice(0, 160);
}

/**
 * Deliver a signal transition alert via Telegram.
 * Returns true if delivery succeeded.
 * Never exposes credentials in error messages.
 */
async function deliverSignalTransitionTelegram(
  transition: SignalTransition,
): Promise<boolean> {
  const env = process.env as Record<string, string | undefined>;

  const telegramEnabled = /^(1|true|yes|enabled|on)$/i.test(
    (env.TELEGRAM_ENABLED ?? "").trim(),
  );
  const signalAlertsEnabled = env.TELEGRAM_SIGNAL_ALERTS_ENABLED == null
    ? true
    : /^(1|true|yes|enabled|on)$/i.test(
        (env.TELEGRAM_SIGNAL_ALERTS_ENABLED ?? "").trim(),
      );

  if (!telegramEnabled || !signalAlertsEnabled) return false;

  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return false;

  const msg = formatSignalTelegramMessage(transition);

  const res = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: msg.text,
        parse_mode: msg.parseMode ?? "HTML",
        disable_web_page_preview: true,
      }),
    },
  );

  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    result?: { message_id?: number };
    description?: string;
  } | null;

  return !!(res.ok && body?.ok);
}
