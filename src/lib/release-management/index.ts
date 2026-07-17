// Phase 31 · Release management.
//
// Semantic-version helpers, deterministic release-note assembly, and
// migration/rollback checklists. Pure functions — no side effects.

export type SemverBump = "major" | "minor" | "patch";

export type SemVer = { major: number; minor: number; patch: number };

export function parseSemver(v: string): SemVer {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) throw new Error(`Invalid semver: ${v}`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function formatSemver(s: SemVer): string {
  return `${s.major}.${s.minor}.${s.patch}`;
}

export function bumpVersion(v: string, bump: SemverBump): string {
  const s = parseSemver(v);
  if (bump === "major") return formatSemver({ major: s.major + 1, minor: 0, patch: 0 });
  if (bump === "minor") return formatSemver({ major: s.major, minor: s.minor + 1, patch: 0 });
  return formatSemver({ major: s.major, minor: s.minor, patch: s.patch + 1 });
}

export type ReleaseChange = {
  kind: "feat" | "fix" | "chore" | "docs" | "security" | "breaking";
  summary: string;
};

export type ReleaseNotes = {
  version: string;
  releasedAt: string;
  highlights: string[];
  sections: Record<ReleaseChange["kind"], string[]>;
};

export function buildReleaseNotes(
  version: string,
  changes: ReleaseChange[],
  releasedAt: string = new Date().toISOString(),
): ReleaseNotes {
  const sections = {
    feat: [] as string[],
    fix: [] as string[],
    chore: [] as string[],
    docs: [] as string[],
    security: [] as string[],
    breaking: [] as string[],
  };
  for (const c of changes) sections[c.kind].push(c.summary);
  const highlights = [
    ...sections.breaking.map((s) => `BREAKING: ${s}`),
    ...sections.security.map((s) => `Security: ${s}`),
    ...sections.feat.slice(0, 3),
  ];
  return { version, releasedAt, highlights, sections };
}

export type ChecklistItem = { id: string; label: string; required: boolean };

export const MIGRATION_CHECKLIST: ChecklistItem[] = [
  { id: "db-migrated", label: "Database migrations applied and verified", required: true },
  { id: "schema-compat", label: "Schema backward-compatible with previous release", required: true },
  { id: "grants-verified", label: "Grants/RLS verified on new public tables", required: true },
  { id: "seed-data", label: "Seed / demo data present where required", required: false },
];

export const ROLLBACK_CHECKLIST: ChecklistItem[] = [
  { id: "previous-build", label: "Previous build artifact available", required: true },
  { id: "db-snapshot", label: "Database snapshot captured pre-deploy", required: true },
  { id: "health-gate", label: "Post-deploy health check integrated with auto-rollback", required: true },
  { id: "runbook-linked", label: "Runbook link surfaced in deployment record", required: true },
];