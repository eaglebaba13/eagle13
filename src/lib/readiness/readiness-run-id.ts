import type { ReadinessResult } from "./production-readiness-types";
import { READINESS_REPORT_GENERATOR } from "./production-readiness-types";

/** Deterministic 32-bit FNV-1a — no crypto, stable across runtimes. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface RunIdInput {
  buildVersion: string | null;
  commitVersion: string | null;
  environment: string;
  deploymentTarget: string | null;
  results: readonly ReadinessResult[];
  databaseSchemaVersion: string | null;
  providerStates: readonly string[];
  cacheNamespaceVersions: readonly string[];
}

export function computeReadinessRunId(input: RunIdInput): string {
  // Never include secret material — only ids + statuses.
  const fp = [
    input.buildVersion ?? "",
    input.commitVersion ?? "",
    input.environment,
    input.deploymentTarget ?? "",
    input.databaseSchemaVersion ?? "",
    input.providerStates.join(","),
    input.cacheNamespaceVersions.join(","),
    input.results.map((r) => `${r.id}:${r.status}`).join("|"),
  ].join("§");
  return `${READINESS_REPORT_GENERATOR}:${fnv1a(fp)}`;
}

export function evidenceFingerprint(key: string, value: unknown): string {
  return fnv1a(`${key}=${JSON.stringify(value ?? null)}`);
}
