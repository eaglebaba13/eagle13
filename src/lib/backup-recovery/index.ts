// Phase 31 · Backup & recovery policy.
//
// Structured checklists surfaced to admin UI and reused by tests.

export type RecoveryChecklistItem = {
  id: string;
  category: "database" | "restore" | "secrets" | "disaster";
  label: string;
  detail: string;
};

export const RECOVERY_CHECKLIST: RecoveryChecklistItem[] = [
  {
    id: "db-daily-snapshot",
    category: "database",
    label: "Daily automated database snapshot",
    detail: "Verify Cloud daily snapshot retention >= 7 days.",
  },
  {
    id: "db-weekly-full",
    category: "database",
    label: "Weekly full logical backup",
    detail: "Store pg_dump to secure off-site storage, retention 30 days.",
  },
  {
    id: "restore-drill",
    category: "restore",
    label: "Quarterly restore drill",
    detail: "Restore latest snapshot into staging and run smoke tests.",
  },
  {
    id: "secrets-inventory",
    category: "secrets",
    label: "Secrets inventory reviewed",
    detail: "Confirm every runtime secret matches the env-validation registry.",
  },
  {
    id: "secrets-rotation",
    category: "secrets",
    label: "Rotation schedule documented",
    detail: "Provider keys, Lovable API key, and OAuth secrets have owners.",
  },
  {
    id: "dr-runbook",
    category: "disaster",
    label: "Disaster recovery runbook current",
    detail: "Runbook lists escalation contacts and RPO/RTO objectives.",
  },
  {
    id: "dr-rpo-rto",
    category: "disaster",
    label: "RPO/RTO documented",
    detail: "RPO <= 24h and RTO <= 4h for the subscription platform.",
  },
];

export type RecoveryStatus = "READY" | "PARTIAL" | "NOT_READY";

export function evaluateRecovery(completedIds: string[]): {
  status: RecoveryStatus;
  missing: string[];
  completed: string[];
} {
  const missing = RECOVERY_CHECKLIST.filter((c) => !completedIds.includes(c.id)).map((c) => c.id);
  const status: RecoveryStatus =
    missing.length === 0 ? "READY" : missing.length <= 2 ? "PARTIAL" : "NOT_READY";
  return { status, missing, completed: completedIds };
}