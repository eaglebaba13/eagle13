// Focused hook module for the dashboard data context.
// `useDashboardData` is split out of `DashboardDataContext.tsx` so that module
// only exports its provider + default context (React Fast Refresh).
// Behavior is unchanged.

import { useContext } from "react";
import DashboardDataContext, { type DashboardContextValue } from "./DashboardDataContext";

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
