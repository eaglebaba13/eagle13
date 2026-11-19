export const ALERT_JOBS = {
  panchang: ["Panchang Now", "06:00"],
  morning: ["EagleBABA Morning Intelligence", "09:00"],
  context: ["Market Context", "09:00"],
  nifty: ["NIFTY 50 Bias & Levels", "09:15"],
  banknifty: ["BANKNIFTY Bias & Levels", "09:15"],
  sensex: ["SENSEX Bias & Levels", "09:15"],
  commodity: ["Commodity Alert", "23:30"],
  crypto: ["Crypto Alert", "20:00"],
  flows: ["FII / DII Net Flow", ""],
  navagraha: ["EagleBABA Navagraha 360°", "09:15"],
  cube: ["4-Pillar Cube Workstation", "09:15"],
  chronowheel: ["EagleBABA ChronoWheel", "09:15"],
  ban: ["F&O Ban & Near-Ban List", "09:15"],
  coa: ["AI LTP Calculator & COA 1.0", "09:15"],
  screener: ["LTP Blast F&O Screener", "09:15"],
  pcr: ["Nifty PCR, Combined PCR & Research Signal", ""],
  optionBuying: ["NIFTY 50 Option Buying Strategy", ""],
  terminal: ["Live Option Strategy Terminal", ""],
  bells: ["Market Opening & Closing Bells", ""],
} as const;

export type AlertJob = keyof typeof ALERT_JOBS;
export const alertJobIds = Object.keys(ALERT_JOBS) as AlertJob[];
export type AlertJobSettings = { enabled: boolean; schedule: string; cooldownMinutes: number };
export const defaultJobSettings = (id: AlertJob): AlertJobSettings => ({
  enabled: false, schedule: ALERT_JOBS[id][1], cooldownMinutes: 0,
});

function clock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
    weekday: !["Sat", "Sun"].includes(part("weekday") ?? ""),
  };
}

const BELLS = [
  ["NSE / BSE", "Asia/Kolkata", "09:15", "15:30"],
  ["MCX agricultural", "Asia/Kolkata", "09:00", "17:00"],
  ["MCX internationally linked agricultural", "Asia/Kolkata", "09:00", "21:00"],
  ["MCX non-agricultural", "Asia/Kolkata", "09:00", "23:30"],
  ["Tokyo / Korea / ASX", "Asia/Kolkata", "05:30", "11:30"],
  ["HKEX", "Asia/Kolkata", "06:45", "13:30"],
  ["Shanghai / Shenzhen", "Asia/Kolkata", "07:00", "12:30"],
  ["Euronext / DAX", "Asia/Kolkata", "12:30", "21:00"],
  ["LSE / SIX", "Asia/Kolkata", "13:30", "22:00"],
  ["NYSE / NASDAQ", "America/New_York", "09:30", "16:00"],
] as const;

export function evaluateAlertSchedule(id: AlertJob, settings: AlertJobSettings, now: Date) {
  const slots: { key: string; message?: string }[] = [];
  if (!settings.enabled) return { slots, watch: false };
  const ist = clock(now, "Asia/Kolkata");
  const market = ist.weekday && ist.time >= "09:15" && ist.time <= "15:30";
  if (settings.schedule === ist.time && (ist.weekday || id === "crypto" || id === "panchang")) {
    slots.push({ key: `${ist.date}:custom:${ist.time}`, ...(id === "bells" ? {
      message: BELLS.map(([exchange, zone, open, close]) => `${exchange} · ${open}–${close} (${zone})`).join("\n"),
    } : {}) });
  }
  if (id === "pcr" && market && ist.time !== settings.schedule && Number(ist.time.slice(3)) % 5 === 0) {
    slots.push({ key: `${ist.date}:pcr:${ist.time}` });
  }
  if (id === "screener" && market && ist.time !== settings.schedule && Number(ist.time.slice(3)) % 15 === 0) {
    slots.push({ key: `${ist.date}:screener:${ist.time}` });
  }
  if (id === "bells") {
    for (const [exchange, zone, open, close] of BELLS) {
      const local = clock(now, zone);
      const closingTime = exchange === "MCX non-agricultural" &&
        new Intl.DateTimeFormat("en", { timeZone: "America/New_York", timeZoneName: "short" })
          .formatToParts(now).some(({ type, value }) => type === "timeZoneName" && value === "EST") ? "23:55" : close;
      if (!local.weekday || (local.time !== open && local.time !== closingTime)) continue;
      const action = local.time === open ? "opens" : "closes";
      slots.push({ key: `${exchange}:${local.date}:${action}`, message: `${exchange} ${action} · ${ist.time} IST` });
    }
  }
  return {
    slots,
    watch: id === "flows" || (market && ["coa", "screener", "optionBuying", "terminal"].includes(id)),
  };
}
