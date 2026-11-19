import { describe, expect, it } from "vitest";
import { alertJobIds, defaultJobSettings, evaluateAlertSchedule, type AlertJob } from "./modular-alert-schedule";

function at(id: AlertJob, date: string, schedule = defaultJobSettings(id).schedule) {
  return evaluateAlertSchedule(id, { enabled: true, schedule, cooldownMinutes: 0 }, new Date(date));
}

describe("modular alert schedules", () => {
  it("registers 19 unique jobs with safe disabled defaults", () => {
    expect(new Set(alertJobIds).size).toBe(19);
    for (const id of alertJobIds) {
      expect(evaluateAlertSchedule(id, defaultJobSettings(id), new Date())).toEqual({ slots: [], watch: false });
    }
  });

  it("uses IST slots and stable fingerprints through repeated ticks", () => {
    expect(at("panchang", "2026-11-19T00:30:00Z").slots).toEqual([{ key: "2026-11-19:custom:06:00" }]);
    expect(at("nifty", "2026-11-19T03:45:05Z").slots).toEqual(at("nifty", "2026-11-19T03:45:55Z").slots);
    expect(at("nifty", "2026-11-21T03:45:00Z").slots).toEqual([]);
    expect(at("nifty", "2026-11-19T04:00:00Z", "09:30").slots).toHaveLength(1);
  });

  it("covers market-hour PCR slots and decision polling", () => {
    for (const time of ["03:45", "03:50", "10:00"]) expect(at("pcr", `2026-11-19T${time}:00Z`).slots).toHaveLength(1);
    for (const time of ["03:44", "03:46", "10:05"]) expect(at("pcr", `2026-11-19T${time}:00Z`).slots).toHaveLength(0);
    expect(at("screener", "2026-11-19T04:00:00Z")).toMatchObject({ watch: true, slots: [{ key: "2026-11-19:screener:09:30" }] });
    expect(at("flows", "2026-11-19T18:00:00Z").watch).toBe(true);
    expect(at("terminal", "2026-11-19T18:00:00Z").watch).toBe(false);
  });

  it("handles local exchange dates across midnight and US DST", () => {
    expect(at("bells", "2026-11-20T21:00:00Z").slots).toContainEqual({
      key: "NYSE / NASDAQ:2026-11-20:closes", message: "NYSE / NASDAQ closes · 02:30 IST",
    });
    expect(at("bells", "2026-07-17T20:00:00Z").slots).toContainEqual({
      key: "NYSE / NASDAQ:2026-07-17:closes", message: "NYSE / NASDAQ closes · 01:30 IST",
    });
    expect(at("bells", "2026-11-19T03:45:00Z").slots).toContainEqual({
      key: "NSE / BSE:2026-11-19:opens", message: "NSE / BSE opens · 09:15 IST",
    });
    expect(at("bells", "2026-11-19T18:25:00Z").slots).toContainEqual({
      key: "MCX non-agricultural:2026-11-19:closes", message: "MCX non-agricultural closes · 23:55 IST",
    });
  });
});
