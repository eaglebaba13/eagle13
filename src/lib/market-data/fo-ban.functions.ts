import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import {
  getFoBanTrackerReport,
  type FoBanReport,
  type FoBanSecurity,
  type FoBanStatus,
} from "./fo-ban-tracker.server";
import { sendFoBanTelegramAlert } from "../smart-alerts/telegram-delivery.server";

export type { FoBanReport, FoBanSecurity, FoBanStatus };

/**
 * Server RPC: Fetch live NSE F&O Ban list and MWPL tracker report
 */
export const getFoBanStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<FoBanReport> => {
    return await getFoBanTrackerReport(false);
  }
);

/**
 * Server RPC: Force refresh F&O Ban list directly from NSE archives
 */
export const refreshFoBanStatus = createServerFn({ method: "POST" }).handler(
  async (): Promise<FoBanReport> => {
    return await getFoBanTrackerReport(true);
  }
);

/**
 * Server RPC: Trigger manual Telegram dispatch of F&O Ban & MWPL report
 */
export const dispatchFoBanAlertNow = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ success: boolean; message: string }> => {
    const report = await getFoBanTrackerReport(false);
    const res = await sendFoBanTelegramAlert(report);
    return {
      success: res.status === "DELIVERED",
      message: res.status === "DELIVERED" ? "Report dispatched to Telegram successfully." : `Delivery status: ${res.status} (${res.errorCode ?? "unknown"})`,
    };
  }
);

/**
 * React Query options for client-side fetching and auto-refresh
 */
export const foBanStatusQuery = () =>
  queryOptions({
    queryKey: ["fo-ban-mwpl-report"],
    queryFn: () => getFoBanStatus(),
    staleTime: 30_000,
    refetchInterval: 60_000, // Background refresh every 60s during trading
  });
