import { createServerFn } from "@tanstack/react-start";
import { getCacheMetrics } from "./server-cache";
import { getApiHealth, getApiLog, getApiTotals, getErrorLog } from "./diagnostics";

export type ServerDiagnostics = {
  ts: number;
  isDev: boolean;
  cache: ReturnType<typeof getCacheMetrics>;
  api: {
    totals: ReturnType<typeof getApiTotals>;
    hosts: ReturnType<typeof getApiHealth>;
    log: ReturnType<typeof getApiLog>;
  };
  errors: ReturnType<typeof getErrorLog>;
};

export const getServerDiagnostics = createServerFn({ method: "GET" }).handler(
  async (): Promise<ServerDiagnostics> => {
    return {
      ts: Date.now(),
      isDev: process.env.NODE_ENV !== "production",
      cache: getCacheMetrics(),
      api: {
        totals: getApiTotals(),
        hosts: getApiHealth(),
        log: getApiLog(),
      },
      errors: getErrorLog(),
    };
  },
);