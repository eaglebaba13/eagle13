import type { ReadinessResult } from "./production-readiness-types";

export interface CacheNamespaceHealth {
  namespace: string;
  version: string;
  hitRate: number; // 0..1
  missRate: number;
  staleRate: number;
  refreshFailures: number;
  entries: number;
  memoryBytes: number;
  orphanedLegacyKeys: number;
}

export interface CacheAuditInput {
  namespaces: readonly CacheNamespaceHealth[];
  requiredNamespaces: readonly string[];
}

export function auditCache(input: CacheAuditInput): ReadinessResult[] {
  const out: ReadinessResult[] = [];
  const names = new Set(input.namespaces.map((n) => n.namespace));
  for (const r of input.requiredNamespaces) {
    if (!names.has(r)) {
      out.push({
        id: `cache.namespace.${r}`,
        category: "OPERATIONS",
        title: `Cache namespace: ${r}`,
        status: "MISSING",
        severity: "critical",
        detail: `Required cache namespace \`${r}\` is not initialized.`,
      });
    }
  }
  for (const n of input.namespaces) {
    const dup = input.namespaces.filter((x) => x.namespace === n.namespace).length > 1;
    const orphan = n.orphanedLegacyKeys > 0;
    const failing = n.refreshFailures > 10;
    out.push({
      id: `cache.namespace.${n.namespace}`,
      category: "OPERATIONS",
      title: `Cache namespace: ${n.namespace}@${n.version}`,
      status: dup || failing ? "FAIL" : orphan ? "WARNING" : "PASS",
      severity: dup || failing ? "critical" : orphan ? "warning" : "info",
      detail: [
        dup ? "duplicate namespace registration" : "",
        orphan ? `${n.orphanedLegacyKeys} orphaned legacy keys` : "",
        failing ? `${n.refreshFailures} refresh failures` : "",
      ]
        .filter(Boolean)
        .join("; ") || undefined,
      evidence: [
        { key: "hit", value: n.hitRate },
        { key: "stale", value: n.staleRate },
        { key: "entries", value: n.entries },
      ],
    });
  }
  return out;
}
