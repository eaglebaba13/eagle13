/** Ban statuses from both the NSE tracker and external F&O adapters. */
export function isFoAlertEligible(status: string | null | undefined): boolean {
  return ["NORMAL", "RECENTLY_UNBANNED"].includes((status ?? "").toUpperCase());
}

export function isVerifiedFoAlertEligible(record?: {
  status?: string | null;
  verifiedLive?: boolean;
  asOfTimestamp?: string;
  mwplPercent?: number;
}, now = Date.now()): boolean {
  const age = now - Date.parse(record?.asOfTimestamp ?? "");
  return record?.verifiedLive === true && age >= 0 && age < 120_000
    && typeof record.mwplPercent === "number" && record.mwplPercent >= 0 && record.mwplPercent < 80
    && isFoAlertEligible(record.status);
}

export function filterFoAlertCandidates<T extends { foBanStatus?: string | null; verifiedLive?: boolean; asOfTimestamp?: string; mwplPercent?: number }>(stocks: readonly T[]): T[] {
  return stocks.filter((stock) => isVerifiedFoAlertEligible({ ...stock, status: stock.foBanStatus }));
}
