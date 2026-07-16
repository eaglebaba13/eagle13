import type { ReadinessResult } from "./production-readiness-types";

export type BackupStatus = "VERIFIED" | "DOCUMENTED_ONLY" | "NOT_CONFIGURED" | "UNKNOWN";

export interface BackupAuditInput {
  databaseBackup: BackupStatus;
  pointInTimeRecovery: BackupStatus;
  storageBackup: BackupStatus;
  migrationRollback: BackupStatus;
  auditLogRetentionDays: number | null;
  disasterRecoveryOwner: string | null;
  lastRestoreTestAt: string | null;
  environment: "development" | "staging" | "production" | "unknown";
}

const STATUS_MAP: Record<BackupStatus, { s: "PASS" | "WARNING" | "FAIL" | "UNKNOWN"; sev: "info" | "warning" | "critical" | "blocker" }> = {
  VERIFIED: { s: "PASS", sev: "info" },
  DOCUMENTED_ONLY: { s: "WARNING", sev: "warning" },
  NOT_CONFIGURED: { s: "FAIL", sev: "critical" },
  UNKNOWN: { s: "UNKNOWN", sev: "warning" },
};

function line(id: string, title: string, s: BackupStatus, envIsProd: boolean, critical = false): ReadinessResult {
  const m = STATUS_MAP[s];
  const hardBlocker = envIsProd && critical && (s === "UNKNOWN" || s === "NOT_CONFIGURED");
  return {
    id,
    category: "RECOVERY",
    title,
    status: m.s,
    severity: hardBlocker ? "blocker" : m.sev,
    hardBlocker,
    detail: s === "VERIFIED" ? undefined : `Status: ${s}`,
  };
}

export function auditBackups(i: BackupAuditInput): ReadinessResult[] {
  const prod = i.environment === "production";
  return [
    line("recovery.db-backup", "Database backup", i.databaseBackup, prod, true),
    line("recovery.pitr", "Point-in-time recovery", i.pointInTimeRecovery, prod),
    line("recovery.storage", "Storage backup", i.storageBackup, prod),
    line("recovery.rollback", "Migration rollback procedure", i.migrationRollback, prod),
    {
      id: "recovery.retention",
      category: "RECOVERY",
      title: "Audit-log retention",
      status:
        i.auditLogRetentionDays == null ? "UNKNOWN" : i.auditLogRetentionDays >= 90 ? "PASS" : "WARNING",
      severity: "info",
      evidence: [{ key: "days", value: i.auditLogRetentionDays ?? "unknown" }],
    },
    {
      id: "recovery.owner",
      category: "RECOVERY",
      title: "Disaster-recovery owner",
      status: i.disasterRecoveryOwner ? "PASS" : "WARNING",
      severity: prod && !i.disasterRecoveryOwner ? "critical" : "warning",
    },
    {
      id: "recovery.restore-test",
      category: "RECOVERY",
      title: "Last restore test recorded",
      status: i.lastRestoreTestAt ? "PASS" : "WARNING",
      severity: prod && !i.lastRestoreTestAt ? "critical" : "warning",
    },
  ];
}
