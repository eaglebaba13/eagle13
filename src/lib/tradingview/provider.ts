// Phase 3F.2B — Public barrel. Type-only from client; runtime is server-only.
export type { TradingViewRatioSnapshot } from "./provider.server";
export {
  connect,
  disconnect,
  getLatestGoldSilverRatio,
  getSpikeDiagnostics,
} from "./provider.server";
