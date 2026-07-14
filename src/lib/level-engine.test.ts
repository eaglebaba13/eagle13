import { describe, it, expect } from "vitest";
import {
  buildLevels,
  calculateDistance,
  findNearestLevel,
  getLevelSignal,
  getLevelStatus,
  sortLevels,
  type PlanetWithLevels,
} from "./level-engine";

const planet: PlanetWithLevels = {
  planet: "Sun",
  r1: 24500, r2: 24600, r3: 24700,
  s1: 24100, s2: 24000, s3: 23900,
};

describe("calculateDistance", () => {
  it("returns absolute distance", () => {
    expect(calculateDistance(100, 90)).toBe(10);
    expect(calculateDistance(90, 100)).toBe(10);
  });
});

describe("getLevelStatus", () => {
  it("TOUCHED at boundary tolerance for resistance", () => {
    expect(getLevelStatus(24508, 24500, true, 8)).toBe("TOUCHED");
  });
  it("BROKEN above resistance beyond tolerance", () => {
    expect(getLevelStatus(24520, 24500, true, 8)).toBe("BROKEN");
  });
  it("ACTIVE below resistance within 5x tolerance", () => {
    expect(getLevelStatus(24480, 24500, true, 8)).toBe("ACTIVE");
  });
  it("PENDING when far below resistance", () => {
    expect(getLevelStatus(24000, 24500, true, 8)).toBe("PENDING");
  });
  it("BROKEN below support", () => {
    expect(getLevelStatus(24080, 24100, false, 8)).toBe("BROKEN");
  });
  it("ACTIVE above support within 5x tolerance", () => {
    expect(getLevelStatus(24120, 24100, false, 8)).toBe("ACTIVE");
  });
});

describe("getLevelSignal", () => {
  it("WATCH within tolerance", () => {
    expect(getLevelSignal(24501, 24500, true, 8)).toBe("WATCH");
    expect(getLevelSignal(24100, 24100, false, 8)).toBe("WATCH");
  });
  it("BUY when price breaks above resistance", () => {
    expect(getLevelSignal(24520, 24500, true, 8)).toBe("BUY");
  });
  it("SELL when price rejects at resistance", () => {
    expect(getLevelSignal(24480, 24500, true, 8)).toBe("SELL");
  });
  it("SELL when price breaks below support", () => {
    expect(getLevelSignal(24000, 24100, false, 8)).toBe("SELL");
  });
  it("BUY when price bounces off support", () => {
    expect(getLevelSignal(24200, 24100, false, 8)).toBe("BUY");
  });
});

describe("buildLevels", () => {
  it("emits 6 level rows per planet", () => {
    const rows = buildLevels([planet], 24300, 8);
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.kind).sort()).toEqual(
      ["R1", "R2", "R3", "S1", "S2", "S3"].sort(),
    );
  });
  it("distance matches |price - value|", () => {
    const rows = buildLevels([planet], 24300, 8);
    for (const r of rows) expect(r.distance).toBe(Math.abs(24300 - r.value));
  });
  it("confidence clamps to [5, 99]", () => {
    const rows = buildLevels([planet], 24500, 8);
    for (const r of rows) {
      expect(r.confidence).toBeGreaterThanOrEqual(5);
      expect(r.confidence).toBeLessThanOrEqual(99);
    }
  });
  it("regression snapshot at price=24300, tol=8", () => {
    const rows = buildLevels([planet], 24300, 8);
    expect(rows).toMatchInlineSnapshot(`
      [
        {
          "confidence": 10,
          "distance": 400,
          "isResistance": true,
          "kind": "R3",
          "planet": "Sun",
          "signal": "SELL",
          "status": "PENDING",
          "value": 24700,
        },
        {
          "confidence": 10,
          "distance": 300,
          "isResistance": true,
          "kind": "R2",
          "planet": "Sun",
          "signal": "SELL",
          "status": "PENDING",
          "value": 24600,
        },
        {
          "confidence": 10,
          "distance": 200,
          "isResistance": true,
          "kind": "R1",
          "planet": "Sun",
          "signal": "SELL",
          "status": "PENDING",
          "value": 24500,
        },
        {
          "confidence": 10,
          "distance": 200,
          "isResistance": false,
          "kind": "S1",
          "planet": "Sun",
          "signal": "BUY",
          "status": "PENDING",
          "value": 24100,
        },
        {
          "confidence": 10,
          "distance": 300,
          "isResistance": false,
          "kind": "S2",
          "planet": "Sun",
          "signal": "BUY",
          "status": "PENDING",
          "value": 24000,
        },
        {
          "confidence": 10,
          "distance": 400,
          "isResistance": false,
          "kind": "S3",
          "planet": "Sun",
          "signal": "BUY",
          "status": "PENDING",
          "value": 23900,
        },
      ]
    `);
  });
});

describe("sortLevels + findNearestLevel", () => {
  it("sorts ascending by distance without mutating input", () => {
    const rows = buildLevels([planet], 24490, 8);
    const sorted = sortLevels(rows);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].distance).toBeGreaterThanOrEqual(sorted[i - 1].distance);
    }
    // input untouched
    expect(rows[0].kind).toBe("R3");
  });
  it("findNearestLevel returns closest level", () => {
    const rows = buildLevels([planet], 24490, 8);
    const nearest = findNearestLevel(rows);
    expect(nearest?.kind).toBe("R1");
    expect(nearest?.distance).toBe(10);
  });
  it("findNearestLevel returns null on empty input", () => {
    expect(findNearestLevel([])).toBeNull();
  });
  it("keeps first occurrence on equal distance (stable pick)", () => {
    // price equidistant between R1 (24500) and S1 (24100) at 24300
    const rows = buildLevels([planet], 24300, 8);
    const nearest = findNearestLevel(rows);
    // R1 comes first in insertion order among equidistant rows
    expect(nearest?.kind).toBe("R1");
  });
});