import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(p);
  }
  return files;
}

const BANNED = /\b(BUY|SELL|LONG|SHORT|GO LONG|GO SHORT|ORDER|POSITION SIZE)\b/;
// Wording guard: the entire Gann Gap module surface must never suggest
// broker action. Test filenames are inspected too so any accidental fixture
// containing forbidden words fails the suite. Local test file is skipped.

describe("Gann Gap module — no broker wording", () => {
  const root = "src/lib/gann-gap";
  const skip = new Set(["no-broker-wording.test.ts"]);
  const files = walk(root).filter((f) => !skip.has(f.split("/").pop()!));
  for (const f of files) {
    it(`${f} contains no BUY/SELL/LONG/SHORT wording`, () => {
      const src = readFileSync(f, "utf8");
      // Strip block/line comments to allow "long-form" prose that isn't a signal.
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      const m = stripped.match(BANNED);
      expect(m, `banned wording in ${f}: ${m?.[0]}`).toBeNull();
    });
  }
});