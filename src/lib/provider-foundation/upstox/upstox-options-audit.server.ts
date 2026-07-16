// Phase 26 · Stage 4 — Upstox option-chain capability audit.
//
// Read-only probe. Returns SUPPORTED / PARTIAL / UNSUPPORTED /
// AUTH_REQUIRED per underlying with a redacted required-field checklist.
// Never returns tokens or raw response bodies. Does NOT compute Combined
// PCR — that stage is gated by ENABLE_COMBINED_PCR and provider readiness.

import { UpstoxHttpClient, redactUpstoxMessage } from "./upstox-http.server";

export type OptionAuditVerdict = "SUPPORTED" | "PARTIAL" | "UNSUPPORTED" | "AUTH_REQUIRED";

export const REQUIRED_OPTION_FIELDS = [
  "call_oi",
  "put_oi",
  "change_in_oi",
  "strike",
  "expiry",
  "spot_price",
  "timestamp",
] as const;

export interface OptionsAuditRow {
  readonly underlying: "NIFTY" | "BANKNIFTY" | "SENSEX";
  readonly verdict: OptionAuditVerdict;
  readonly httpStatus: number | null;
  readonly upstoxErrorCode: string | null;
  readonly missingFields: readonly string[];
  readonly safeMessage: string | null;
  readonly endpointPath: string;
  readonly checkedAt: string;
}

export interface OptionsAuditReport {
  readonly rows: readonly OptionsAuditRow[];
  readonly generatedAt: string;
}

const UNDERLYING_INSTRUMENTS: Record<OptionsAuditRow["underlying"], string> = {
  NIFTY: "NSE_INDEX|Nifty 50",
  BANKNIFTY: "NSE_INDEX|Nifty Bank",
  SENSEX: "BSE_INDEX|SENSEX",
};

function classify(status: number | null, code: string | null, missing: readonly string[]): OptionAuditVerdict {
  if (status === 401 || status === 403) return "AUTH_REQUIRED";
  if (status == null) return "UNSUPPORTED";
  if (status >= 400) return code ? "UNSUPPORTED" : "UNSUPPORTED";
  if (missing.length === 0) return "SUPPORTED";
  if (missing.length < REQUIRED_OPTION_FIELDS.length) return "PARTIAL";
  return "UNSUPPORTED";
}

async function probeUnderlying(
  http: UpstoxHttpClient,
  underlying: OptionsAuditRow["underlying"],
): Promise<OptionsAuditRow> {
  const checkedAt = new Date().toISOString();
  const endpointPath = "v2/option/chain";
  try {
    const res = await http.request<Record<string, unknown>>({
      path: endpointPath,
      query: { instrument_key: UNDERLYING_INSTRUMENTS[underlying] },
    });
    if (!res.ok) {
      return {
        underlying,
        verdict: classify(res.error.httpStatus ?? null, res.error.upstoxErrorCode ?? null, [...REQUIRED_OPTION_FIELDS]),
        httpStatus: res.error.httpStatus ?? null,
        upstoxErrorCode: res.error.upstoxErrorCode ?? null,
        missingFields: [...REQUIRED_OPTION_FIELDS],
        safeMessage: redactUpstoxMessage(res.error.message ?? ""),
        endpointPath,
        checkedAt,
      };
    }
    // Naive presence probe — we do not consume the shape, we just check
    // whether required top-level keys appear in the first row.
    const data = res.data as { data?: unknown } | undefined;
    const rowRaw = Array.isArray(data?.data) ? (data!.data as unknown[])[0] : undefined;
    const row = (rowRaw ?? {}) as Record<string, unknown>;
    const flatKeys = new Set<string>([
      ...Object.keys(row),
      ...Object.keys((row.call_options as Record<string, unknown>) ?? {}).map((k) => `call_${k}`),
      ...Object.keys((row.put_options as Record<string, unknown>) ?? {}).map((k) => `put_${k}`),
    ]);
    const missing = REQUIRED_OPTION_FIELDS.filter((f) => !flatKeys.has(f) && !(f in row));
    return {
      underlying,
      verdict: classify(200, null, missing),
      httpStatus: 200,
      upstoxErrorCode: null,
      missingFields: missing,
      safeMessage: null,
      endpointPath,
      checkedAt,
    };
  } catch (err) {
    return {
      underlying,
      verdict: "UNSUPPORTED",
      httpStatus: null,
      upstoxErrorCode: null,
      missingFields: [...REQUIRED_OPTION_FIELDS],
      safeMessage: redactUpstoxMessage(err instanceof Error ? err.message : String(err)),
      endpointPath,
      checkedAt,
    };
  }
}

export async function buildOptionsAuditReport(
  http: UpstoxHttpClient = new UpstoxHttpClient(),
): Promise<OptionsAuditReport> {
  const rows = await Promise.all(
    (["NIFTY", "BANKNIFTY", "SENSEX"] as const).map((u) => probeUnderlying(http, u)),
  );
  return { rows, generatedAt: new Date().toISOString() };
}

export { classify as _classifyOptionsAudit };