import { redactSecretLike } from "../production-readiness-types";

export interface EvidenceRecord {
  ref: string;
  createdAt: string;
  checkId: string;
  buildVersion: string | null;
  commitVersion: string | null;
  payload: unknown;
}

export interface EvidenceStore {
  put(record: Omit<EvidenceRecord, "ref" | "createdAt"> & { ref?: string }): EvidenceRecord;
  get(ref: string): EvidenceRecord | undefined;
  list(): readonly EvidenceRecord[];
  clear(): void;
  retentionMs: number;
}

function deepRedact(v: unknown): unknown {
  if (typeof v === "string") return redactSecretLike(v);
  if (Array.isArray(v)) return v.map(deepRedact);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/pass(word)?|secret|token|authorization|api[_-]?key/i.test(k)) continue;
      out[k] = deepRedact(val);
    }
    return out;
  }
  return v;
}

export function createInMemoryEvidenceStore(retentionMs = 3_600_000): EvidenceStore {
  const map = new Map<string, EvidenceRecord>();
  let counter = 0;
  const gc = (now: number) => {
    for (const [k, r] of map) {
      if (now - Date.parse(r.createdAt) > retentionMs) map.delete(k);
    }
  };
  return {
    retentionMs,
    put(record) {
      const now = new Date().toISOString();
      const ref = record.ref ?? `ev_${(++counter).toString(36)}`;
      const clean: EvidenceRecord = {
        ref,
        createdAt: now,
        checkId: record.checkId,
        buildVersion: record.buildVersion,
        commitVersion: record.commitVersion,
        payload: deepRedact(record.payload),
      };
      map.set(ref, clean);
      gc(Date.parse(now));
      return clean;
    },
    get(ref) {
      return map.get(ref);
    },
    list() {
      return Array.from(map.values());
    },
    clear() {
      map.clear();
    },
  };
}