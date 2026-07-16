/**
 * Phase 25 — Database schema audit (pure comparison logic).
 *
 * We ship a declarative expectation of required tables/columns and let a
 * server collector supply the observed schema. Nothing is mutated — this
 * only emits migration recommendations.
 */
import type { ReadinessResult } from "./production-readiness-types";

export type ColumnSpec = {
  name: string;
  type: string; // loose type — text | uuid | timestamptz | integer | jsonb | boolean
  nullable?: boolean;
};

export type TableSpec = {
  name: string;
  columns: readonly ColumnSpec[];
  requiredIndexes?: readonly string[];
  hasUpdatedAtTrigger?: boolean;
};

export const EXPECTED_TABLES: readonly TableSpec[] = [
  {
    name: "profiles",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "email", type: "text" },
      { name: "created_at", type: "timestamptz", nullable: false },
      { name: "updated_at", type: "timestamptz", nullable: false },
    ],
    hasUpdatedAtTrigger: true,
  },
  {
    name: "subscriptions",
    columns: [
      { name: "user_id", type: "uuid", nullable: false },
      { name: "plan", type: "text", nullable: false },
      { name: "status", type: "text", nullable: false },
      { name: "current_period_end", type: "timestamptz" },
      { name: "cancel_at_period_end", type: "boolean" },
    ],
  },
  {
    name: "user_roles",
    columns: [
      { name: "user_id", type: "uuid", nullable: false },
      { name: "role", type: "text", nullable: false },
    ],
    requiredIndexes: ["user_roles_user_id_role_unique"],
  },
  {
    name: "audit_log",
    columns: [
      { name: "event", type: "text", nullable: false },
      { name: "created_at", type: "timestamptz", nullable: false },
    ],
  },
  {
    name: "manual_payment_requests",
    columns: [
      { name: "user_id", type: "uuid", nullable: false },
      { name: "payment_reference", type: "text", nullable: false },
      { name: "requested_plan", type: "text", nullable: false },
      { name: "billing_cycle", type: "text", nullable: false },
      { name: "expected_amount", type: "integer", nullable: false },
      { name: "status", type: "text", nullable: false },
      { name: "expires_at", type: "timestamptz", nullable: false },
    ],
  },
];

export type ObservedColumn = { name: string; type: string; nullable: boolean };
export type ObservedTable = {
  name: string;
  columns: readonly ObservedColumn[];
  indexes: readonly string[];
};

export interface DatabaseAuditInput {
  tables: readonly ObservedTable[];
  migrationsApplied: number | null; // null when unknown
}

export function auditDatabase(input: DatabaseAuditInput): ReadinessResult[] {
  const out: ReadinessResult[] = [];
  const byName = new Map(input.tables.map((t) => [t.name, t]));

  for (const spec of EXPECTED_TABLES) {
    const observed = byName.get(spec.name);
    if (!observed) {
      out.push({
        id: `db.table.${spec.name}`,
        category: "DATABASE",
        title: `Table ${spec.name}`,
        status: "MISSING",
        severity: "blocker",
        hardBlocker: true,
        detail: `Required table \`${spec.name}\` not found.`,
        remediation: `Apply the migration that creates \`${spec.name}\`.`,
      });
      continue;
    }
    const missingCols = spec.columns.filter(
      (c) => !observed.columns.some((oc) => oc.name === c.name),
    );
    const nullabilityIssues = spec.columns.filter((c) => {
      const oc = observed.columns.find((x) => x.name === c.name);
      if (!oc) return false;
      if (c.nullable === false && oc.nullable) return true;
      return false;
    });
    const missingIdx = (spec.requiredIndexes ?? []).filter(
      (i) => !observed.indexes.includes(i),
    );
    if (missingCols.length === 0 && nullabilityIssues.length === 0 && missingIdx.length === 0) {
      out.push({
        id: `db.table.${spec.name}`,
        category: "DATABASE",
        title: `Table ${spec.name}`,
        status: "PASS",
        severity: "info",
      });
    } else {
      out.push({
        id: `db.table.${spec.name}`,
        category: "DATABASE",
        title: `Table ${spec.name}`,
        status: "FAIL",
        severity: "critical",
        hardBlocker: missingCols.length > 0,
        detail: [
          missingCols.length ? `missing columns: ${missingCols.map((c) => c.name).join(", ")}` : "",
          nullabilityIssues.length
            ? `nullability drift: ${nullabilityIssues.map((c) => c.name).join(", ")}`
            : "",
          missingIdx.length ? `missing indexes: ${missingIdx.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("; "),
        remediation: `Ship a migration to align \`${spec.name}\`.`,
      });
    }
  }

  out.push({
    id: "db.migrations-applied",
    category: "DATABASE",
    title: "Migrations applied",
    status: input.migrationsApplied == null ? "UNKNOWN" : input.migrationsApplied > 0 ? "PASS" : "FAIL",
    severity: input.migrationsApplied == null ? "warning" : input.migrationsApplied > 0 ? "info" : "blocker",
    hardBlocker: input.migrationsApplied === 0,
    detail:
      input.migrationsApplied == null
        ? "Unable to determine migration state."
        : `${input.migrationsApplied} migration(s) applied.`,
  });

  return out;
}
