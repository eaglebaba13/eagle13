import { test } from "node:test";
import assert from "node:assert/strict";
import { __test, getSnapshot, getHealth } from "../src/collector.mjs";

test("collector accepts valid tick and produces LIVE snapshot", () => {
  __test.reset();
  __test.setStatus("CONNECTED");
  __test.injectTick({ lp: 72.4, lp_time: 1_784_522_640 });
  const snap = getSnapshot();
  assert.equal(snap.ratio, 72.4);
  assert.equal(snap.signal, "NEUTRAL");
  assert.equal(snap.freshness, "LIVE");
  assert.equal(snap.connectionStatus, "CONNECTED");
});

test("collector rejects malformed tick", () => {
  __test.reset();
  __test.setStatus("CONNECTED");
  __test.injectTick({ lp: NaN });
  __test.injectTick({ lp: -5 });
  __test.injectTick({ lp: 0 });
  __test.injectTick({});
  const snap = getSnapshot();
  assert.equal(snap.ratio, null);
  assert.equal(snap.signal, "UNAVAILABLE");
});

test("health reports symbolResolved and connection", () => {
  __test.reset();
  __test.setStatus("CONNECTED");
  __test.injectTick({ lp: 65, lp_time: 1_784_522_640 });
  const h = getHealth();
  assert.equal(h.connected, true);
  assert.equal(h.symbolResolved, true);
  assert.equal(h.status, "ok");
});

test("stale-data failure test: after long silence signal becomes UNAVAILABLE", () => {
  __test.reset();
  __test.setStatus("CONNECTED");
  __test.injectTick({ lp: 70, lp_time: 1_784_522_640 });
  // 20 minutes later
  const snap = getSnapshot(Date.now() + 20 * 60_000);
  assert.equal(snap.freshness, "UNAVAILABLE");
  assert.equal(snap.signal, "UNAVAILABLE");
  assert.equal(snap.ratio, null);
});