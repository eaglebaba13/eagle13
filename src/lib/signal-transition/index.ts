// Phase P1+P2 — Signal Transition module barrel export.

export type {
  SignalState,
  DecisionAction,
  SignalTransition,
  SignalTransitionKey,
  SignalTransitionConfig,
  SignalTelegramMessage,
  SignalTelegramDeliveryResult,
  SignalAlarm,
} from "./types";

export {
  normalizeSignalState,
  decisionActionToSignalState,
  isStateChange,
  DEFAULT_SIGNAL_TRANSITION_CONFIG,
} from "./types";

export {
  evaluateSignalTransition,
  formatSignalTelegramMessage,
  resetSignalDedupeStoreForTests,
} from "./engine";

export { buildSignalNotificationPayload } from "./notification";
