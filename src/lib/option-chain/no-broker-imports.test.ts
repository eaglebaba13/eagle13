import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(f.name) && !f.name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("option-chain forbidden imports", () => {
  it("does not import broker/order/execution modules", () => {
    const bad = /from\s+["'][^"']*(broker|order|execution|placeOrder|kite-execute)["']/i;
    for (const f of files("src/lib/option-chain")) {
      const text = readFileSync(f, "utf8");
      expect(bad.test(text), `${f} imports broker/order path`).toBe(false);
    }
  });
});