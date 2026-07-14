import { createServerFn } from "@tanstack/react-start";
import type { AuditReport, ReferenceFixture } from "./astro-audit";

const fixtureModules = import.meta.glob<{ default: ReferenceFixture }>(
  "./__fixtures__/astro-reference/*.json",
  { eager: true },
);

function loadFixtures(): ReferenceFixture[] {
  const out: ReferenceFixture[] = [];
  for (const [path, mod] of Object.entries(fixtureModules)) {
    const f = (mod as { default: ReferenceFixture }).default;
    if (!f || !f.fixtureVersion || f.fixtureVersion.startsWith("example-")) continue;
    void path;
    out.push(f);
  }
  out.sort((a, b) => a.timestampIso.localeCompare(b.timestampIso));
  return out;
}

export const runAstroAuditFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    fixtures: number;
    reports: AuditReport[];
    generatedAt: string;
  }> => {
    const { runAstroAudit } = await import("./astro-audit.server");
    const fixtures = loadFixtures();
    const reports = fixtures.map((f) => runAstroAudit(f));
    return {
      fixtures: fixtures.length,
      reports,
      generatedAt: new Date().toISOString(),
    };
  },
);