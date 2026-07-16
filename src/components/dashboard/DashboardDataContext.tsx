import { createContext, useContext, type ReactNode } from "react";
import type { IndexQuote } from "@/lib/market.functions";
import type { Levels } from "@/lib/levels";

// Phase 24C · Shared dashboard data context.
//
// The `/` route resolves the shared market-data query ONCE and distributes
// the derived state to every widget through this context. Widgets must
// NEVER call `useQuery`/`useSuspenseQuery` themselves — they consume the
// resolved data here.

export type DashboardMarketData = {
  nifty: IndexQuote;
  banknifty: IndexQuote;
  vix: IndexQuote | null;
  btc: IndexQuote | null;
  gold: IndexQuote | null;
  silver: IndexQuote | null;
  goldSilverRatio: number | null;
};

export type DashboardTabKey = "nifty" | "banknifty" | "btc" | "gold";

export type DashboardContextValue = {
  data: DashboardMarketData;
  dataUpdatedAt: number;
  isFetching: boolean;
  activeTab: DashboardTabKey;
  activeQuote: IndexQuote;
  accent: string;
  safeBand: number;
  levels: Levels;
};

const DashboardDataContext = createContext<DashboardContextValue | null>(null);

export function DashboardDataProvider({
  value,
  children,
}: {
  value: DashboardContextValue;
  children: ReactNode;
}) {
  return (
    <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>
  );
}

export function useDashboardData(): DashboardContextValue {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) {
    throw new Error(
      "useDashboardData() must be used inside <DashboardDataProvider>. " +
        "The `/` dashboard route provides this context.",
    );
  }
  return ctx;
}

export default DashboardDataContext;