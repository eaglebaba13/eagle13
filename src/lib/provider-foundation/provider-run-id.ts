import { PROVIDER_SESSION_PREFIX } from "./types";

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function computeProviderSessionId(input: {
  readonly primary: string;
  readonly secondary?: string | null;
  readonly domain: string;
  readonly symbols: readonly string[];
  readonly timeframes: readonly string[];
  readonly startedAt: string;
}): string {
  const key = [
    input.primary,
    input.secondary ?? "",
    input.domain,
    [...input.symbols].sort().join(","),
    [...input.timeframes].sort().join(","),
    input.startedAt,
  ].join("§");
  return `${PROVIDER_SESSION_PREFIX}:${fnv1a(key)}`;
}

export function computeTelemetryHash(parts: readonly string[]): string {
  return fnv1a(parts.join("§"));
}
