export interface IncidentPlaybook {
  id: string;
  scenario: string;
  detection: string;
  immediateAction: string;
  userFacingStatus: string;
  escalationOwner: string;
  recoveryVerification: string;
}

export const INCIDENT_PLAYBOOKS: readonly IncidentPlaybook[] = [
  {
    id: "incident.provider-outage",
    scenario: "Provider outage",
    detection: "provider probe FAIL, error-rate spike",
    immediateAction: "Flip to secondary provider where policy allows; block actionable signals if disclosure required.",
    userFacingStatus: "Show DEGRADED banner + provider label change.",
    escalationOwner: "Data Ops",
    recoveryVerification: "10 minutes of PASS probes; freshness LIVE for 3 consecutive intervals.",
  },
  {
    id: "incident.database-outage",
    scenario: "Database outage",
    detection: "supabase probe FAIL, 5xx spike",
    immediateAction: "Enable read-only mode; halt manual-payment approvals.",
    userFacingStatus: "Read-only banner, sign-in disabled if needed.",
    escalationOwner: "Platform",
    recoveryVerification: "auth + read-write smoke on staging replica.",
  },
  {
    id: "incident.auth-outage",
    scenario: "Auth outage",
    detection: "auth traffic red, session refresh failures",
    immediateAction: "Communicate on status page; queue sensitive actions.",
    userFacingStatus: "Sign-in temporarily unavailable banner.",
    escalationOwner: "Platform",
    recoveryVerification: "Sign-in smoke test with dedicated account.",
  },
  {
    id: "incident.payment",
    scenario: "Payment issue",
    detection: "manual_payment.rejected surge, admin queue backlog",
    immediateAction: "Freeze approvals; verify UPI ID; contact affected users.",
    userFacingStatus: "Payment banner: verification delayed.",
    escalationOwner: "Billing Ops",
    recoveryVerification: "Test payment approval end-to-end.",
  },
  {
    id: "incident.stale-data",
    scenario: "Stale market data",
    detection: "freshness pill DELAYED > 5 minutes for LIVE providers",
    immediateAction: "Block actionable signals via readiness gate; refresh cache.",
    userFacingStatus: "STALE banner + BLOCKED on actionable widgets.",
    escalationOwner: "Data Ops",
    recoveryVerification: "LIVE freshness for 3 intervals.",
  },
  {
    id: "incident.wrong-signal",
    scenario: "Incorrect signal display",
    detection: "user reports + parity diagnostic mismatch",
    immediateAction: "Suppress signal via feature flag; open incident review.",
    userFacingStatus: "Signal hidden with explanatory note.",
    escalationOwner: "Research",
    recoveryVerification: "Backtest & shadow parity checks pass.",
  },
  {
    id: "incident.cache-corruption",
    scenario: "Cache corruption",
    detection: "hit-rate collapse, schema mismatch errors",
    immediateAction: "Bump namespace version; do NOT clear production cache without approval.",
    userFacingStatus: "Transient degraded latency banner.",
    escalationOwner: "Platform",
    recoveryVerification: "Cache warm-up complete + freshness LIVE.",
  },
  {
    id: "incident.scheduler",
    scenario: "Scheduler duplication",
    detection: "schedulerInstances > 1",
    immediateAction: "Kill duplicate; enforce single-instance invariant.",
    userFacingStatus: "None.",
    escalationOwner: "Platform",
    recoveryVerification: "single instance, task cadence stable.",
  },
  {
    id: "incident.storage",
    scenario: "Storage access failure",
    detection: "signed URL failures, 403/404 spikes",
    immediateAction: "Verify bucket policies; regenerate signed URL config.",
    userFacingStatus: "Screenshots temporarily unavailable banner.",
    escalationOwner: "Platform",
    recoveryVerification: "Signed URL round-trip test.",
  },
  {
    id: "incident.rollback",
    scenario: "Deployment rollback",
    detection: "error-rate red after deploy, verdict regression",
    immediateAction: "Rollback to last VERIFIED build; freeze deploys.",
    userFacingStatus: "Maintenance banner.",
    escalationOwner: "Release Manager",
    recoveryVerification: "Post-rollback readiness verdict ≥ prior baseline.",
  },
];
