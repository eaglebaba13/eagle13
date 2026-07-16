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

const FORBIDDEN = [
  /from\s+["'][^"']*(broker|order|execution|placeOrder|kite-execute)["']/i,
  /from\s+["'][^"']*decision-(engine|center)["']/i,
  /from\s+["'][^"']*signal-engine["']/i,
  /from\s+["'][^"']*(alerts?|notification)["']/i,
];

describe("market-breadth forbidden imports", () => {
  it("does not import broker/order/decision/signal/alert modules", () => {
    for (const f of files("src/lib/market-breadth")) {
      const text = readFileSync(f, "utf8");
      for (const re of FORBIDDEN) {
        expect(re.test(text), `${f} matches forbidden import ${re}`).toBe(false);
      }
    }
  });
});
