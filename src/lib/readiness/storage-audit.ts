import type { ReadinessResult } from "./production-readiness-types";

export interface BucketAudit {
  name: string;
  isPublic: boolean;
  expectedPublic: boolean;
  maxFileSizeBytes: number | null;
  allowedMimeTypes: readonly string[] | null;
  userFolderIsolation: boolean;
  signedUrlDefaultTtlSeconds: number;
  retentionDays: number | null;
}

export interface StorageAuditInput {
  buckets: readonly BucketAudit[];
}

export function auditStorage(input: StorageAuditInput): ReadinessResult[] {
  return input.buckets.map((b) => {
    const wrongVisibility = b.isPublic !== b.expectedPublic;
    const badTtl = b.signedUrlDefaultTtlSeconds <= 0 || b.signedUrlDefaultTtlSeconds > 3600;
    const noIsolation = !b.expectedPublic && !b.userFolderIsolation;
    return {
      id: `storage.${b.name}`,
      category: "SECURITY",
      title: `Bucket: ${b.name}`,
      status: wrongVisibility || noIsolation ? "FAIL" : badTtl ? "WARNING" : "PASS",
      severity: wrongVisibility ? "blocker" : noIsolation ? "critical" : badTtl ? "warning" : "info",
      hardBlocker: wrongVisibility || noIsolation,
      detail: [
        wrongVisibility ? `visibility mismatch (public=${b.isPublic})` : "",
        noIsolation ? "no per-user folder isolation on private bucket" : "",
        badTtl ? `signed URL TTL out of bounds (${b.signedUrlDefaultTtlSeconds}s)` : "",
      ]
        .filter(Boolean)
        .join("; ") || undefined,
    } as ReadinessResult;
  });
}
