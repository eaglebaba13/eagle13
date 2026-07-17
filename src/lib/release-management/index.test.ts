import { describe, it, expect } from "vitest";
import {
  MIGRATION_CHECKLIST,
  ROLLBACK_CHECKLIST,
  buildReleaseNotes,
  bumpVersion,
  parseSemver,
} from "./index";

describe("release-management", () => {
  it("parseSemver handles v-prefixed versions", () => {
    expect(parseSemver("v1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("bumpVersion resets lower components", () => {
    expect(bumpVersion("1.4.9", "major")).toBe("2.0.0");
    expect(bumpVersion("1.4.9", "minor")).toBe("1.5.0");
    expect(bumpVersion("1.4.9", "patch")).toBe("1.4.10");
  });

  it("parseSemver rejects invalid", () => {
    expect(() => parseSemver("nope")).toThrow();
  });

  it("buildReleaseNotes groups by kind and lifts breaking/security", () => {
    const notes = buildReleaseNotes(
      "1.0.0",
      [
        { kind: "feat", summary: "A" },
        { kind: "breaking", summary: "removed X" },
        { kind: "security", summary: "CSP tightened" },
        { kind: "fix", summary: "bug" },
      ],
      "2026-07-17T00:00:00Z",
    );
    expect(notes.sections.feat).toEqual(["A"]);
    expect(notes.sections.breaking[0]).toBe("removed X");
    expect(notes.highlights[0]).toMatch(/BREAKING/);
    expect(notes.highlights.some((h) => h.startsWith("Security"))).toBe(true);
  });

  it("checklists include required migration+rollback items", () => {
    expect(MIGRATION_CHECKLIST.some((c) => c.id === "db-migrated" && c.required)).toBe(true);
    expect(ROLLBACK_CHECKLIST.some((c) => c.id === "db-snapshot" && c.required)).toBe(true);
  });
});