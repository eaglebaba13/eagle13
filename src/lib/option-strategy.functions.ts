// NIFTY50 OPTION BUYING STRATEGY — data + decision-support layer.
// IMPORTANT: This is an ADDITIONAL, independent module. It does NOT modify any
// existing Astro calculation, business logic, API, database, or route. It only
// READS the existing EagleBaba astro engine (computeAstroPositions) to obtain a
// bullish/bearish astro bias, and combines it with live market breadth, India
// VIX, sector strength and an option-chain PCR proxy to produce a directional
// BUY CE / BUY PE / WAIT recommendation.
import { createServerFn } from "@tanstack/react-start";
import { fetchJson } from "./http";
import {
  biasFromPct,
  sectorBreadth,
  vixStrategy,
  pcrFocusFromOI,
  pcrFocusFromRatio,
} from "./strategy-math";
import { cached } from "./server-cache";
import {
  YahooChartSchema,
  NseOptionChainSchema,
  parseProvider,
} from "./providers";

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/* ------------------------------ quotes ------------------------------ */

export type Quote = {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  ok: boolean;
};

async function fetchQuote(symbol: string, name: string): Promise<Quote> {
  const url = `${YAHOO}${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const json = parseProvider(YahooChartSchema, await fetchJson<unknown>(url), `Yahoo (${symbol})`);
  const result = json.chart.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);
  const meta = result.meta;
  const q = result.indicators?.quote?.[0] ?? {};
  const closes: number[] = (q.close ?? []).filter((c): c is number => c != null);
  const price = round2(meta.regularMarketPrice ?? closes[closes.length - 1] ?? 0);
  const prevClose = round2(
    meta.chartPreviousClose ??
      meta.previousClose ??
      closes[closes.length - 2] ??
      price,
  );
  const change = round2(price - prevClose);
  const changePct = prevClose ? round2((change / prevClose) * 100) : 0;
  return { symbol, name, price, prevClose, change, changePct, ok: true };
}

function safeQuote(symbol: string, name: string): Promise<Quote | null> {
  return fetchQuote(symbol, name).catch(() => null);
}

/* ------------------------------ config ------------------------------ */

// Top-10 NIFTY constituents (~60% index weight). Weightages approximate the
// latest official NIFTY 50 index composition and can drift slightly.
const TOP10: { symbol: string; name: string; weight: number }[] = [
  { symbol: "HDFCBANK.NS", name: "HDFC Bank", weight: 13.1 },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank", weight: 8.6 },
  { symbol: "RELIANCE.NS", name: "Reliance", weight: 8.1 },
  { symbol: "INFY.NS", name: "Infosys", weight: 5.4 },
  { symbol: "ITC.NS", name: "ITC", weight: 4.0 },
  { symbol: "TCS.NS", name: "TCS", weight: 3.9 },
  { symbol: "LT.NS", name: "L&T", weight: 3.8 },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel", weight: 3.6 },
  { symbol: "AXISBANK.NS", name: "Axis Bank", weight: 3.1 },
  { symbol: "SBIN.NS", name: "SBI", weight: 2.9 },
];

// Sector indices (Yahoo NSE sector symbols). key is canonical id used by engine.
const SECTORS: { key: string; symbol: string; name: string }[] = [
  { key: "banking", symbol: "^NSEBANK", name: "Banking" },
  { key: "it", symbol: "^CNXIT", name: "IT" },
  { key: "financial", symbol: "NIFTY_FIN_SERVICE.NS", name: "Financial Services" },
  { key: "oilgas", symbol: "^CNXENERGY", name: "Oil & Gas / Energy" },
  { key: "auto", symbol: "^CNXAUTO", name: "Auto" },
  { key: "fmcg", symbol: "^CNXFMCG", name: "FMCG" },
  { key: "pharma", symbol: "^CNXPHARMA", name: "Pharma" },
  { key: "metal", symbol: "^CNXMETAL", name: "Metal" },
  { key: "realty", symbol: "^CNXREALTY", name: "Realty" },
  { key: "psu", symbol: "^CNXPSUBANK", name: "PSU Bank" },
];

/* ------------------------------ types ------------------------------ */

export type TopStock = {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  weight: number;
  advancing: boolean;
  contribution: number; // weighted % contribution to index move
};

export type Sector = {
  key: string;
  name: string;
  changePct: number;
  advance: number;
  decline: number;
  strength: number; // -100..100
  bias: "Bullish" | "Bearish" | "Neutral";
};

export type Breadth = {
  advances: number;
  declines: number;
  ratio: number;
  label: string;
  bias: "Bullish" | "Bearish" | "Neutral";
};

export type OptionChain = {
  pcr: number;
  totalCallOI: number;
  totalPutOI: number;
  changeCallOI: number;
  changePutOI: number;
  highestCallOI: number; // strike
  highestPutOI: number; // strike
  support: number;
  resistance: number;
  source: "NSE" | "DERIVED";
  focus: "CALL" | "PUT" | "NEUTRAL";
};

export type VixStrategy = {
  vix: number;
  changePct: number;
  band: "ITM" | "ATM" | "OTM";
  label: string;
  tone: "green" | "yellow" | "red";
};

export type Recommendation = {
  action: "BUY CE" | "BUY PE" | "WAIT";
  confidence: number;
  bullScore: number;
  bearScore: number;
  reasons: string[];
};

export type OptionStrategyData = {
  asOf: string;
  nifty: Quote;
  vix: VixStrategy;
  top10: TopStock[];
  weightedBreadthScore: number; // -100..100
  top10Bias: "Bullish" | "Bearish" | "Neutral";
  sectors: Sector[];
  sectorStrength: number; // -100..100
  nseBreadth: Breadth;
  niftyBreadth: Breadth;
  optionChain: OptionChain;
  astro: { bias: "Bullish" | "Bearish" | "Neutral"; bullCount: number; bearCount: number; retroCount: number; moonNakshatra: string };
  recommendation: Recommendation;
  specialAlert: { type: "CALL" | "PUT" | "NONE"; active: boolean };
};

/* --------------------------- option chain --------------------------- */

// Attempt live NSE option chain; fall back to a transparent PCR proxy derived
// from live breadth + VIX when the NSE endpoint is unavailable (common from
// datacenter IPs, as it requires browser cookies).
async function fetchOptionChain(
  spot: number,
  bullFrac: number,
): Promise<OptionChain> {
  try {
    const raw = await fetchJson<unknown>(
      "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY",
      {
        timeoutMs: 6000,
        retries: 1,
        headers: {
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://www.nseindia.com/option-chain",
        },
      },
    );
    const json = parseProvider(NseOptionChainSchema, raw, "NSE option chain");
    const rows = json.records?.data ?? [];
    if (!rows.length) throw new Error("empty chain");
    let totalCallOI = 0,
      totalPutOI = 0,
      changeCallOI = 0,
      changePutOI = 0;
    let hiCall = { oi: -1, strike: 0 },
      hiPut = { oi: -1, strike: 0 };
    for (const r of rows) {
      const ce = r.CE,
        pe = r.PE;
      if (ce) {
        totalCallOI += ce.openInterest ?? 0;
        changeCallOI += ce.changeinOpenInterest ?? 0;
        if ((ce.openInterest ?? 0) > hiCall.oi)
          hiCall = { oi: ce.openInterest ?? 0, strike: ce.strikePrice ?? 0 };
      }
      if (pe) {
        totalPutOI += pe.openInterest ?? 0;
        changePutOI += pe.changeinOpenInterest ?? 0;
        if ((pe.openInterest ?? 0) > hiPut.oi)
          hiPut = { oi: pe.openInterest ?? 0, strike: pe.strikePrice ?? 0 };
      }
    }
    const pcr = totalCallOI ? round2(totalPutOI / totalCallOI) : 1;
    return {
      pcr,
      totalCallOI,
      totalPutOI,
      changeCallOI,
      changePutOI,
      highestCallOI: hiCall.strike,
      highestPutOI: hiPut.strike,
      support: hiPut.strike, // max put OI = support
      resistance: hiCall.strike, // max call OI = resistance
      source: "NSE",
      focus: pcrFocusFromOI(changeCallOI, changePutOI),
    };
  } catch {
    // Derived PCR proxy: bullish breadth ⇒ put writing ⇒ PCR > 1.
    const pcr = round2(clamp(0.6 + bullFrac * 1.0, 0.4, 1.8));
    const base = 4_500_000;
    const totalPutOI = Math.round(base * (0.6 + bullFrac));
    const totalCallOI = Math.round(base * (0.6 + (1 - bullFrac)));
    const step = 50;
    const atm = Math.round(spot / step) * step;
    const changeCallOI = Math.round((1 - bullFrac - 0.5) * 1_200_000);
    const changePutOI = Math.round((bullFrac - 0.5) * 1_200_000);
    return {
      pcr,
      totalCallOI,
      totalPutOI,
      changeCallOI,
      changePutOI,
      highestCallOI: atm + step * 2,
      highestPutOI: atm - step * 2,
      support: atm - step * 2,
      resistance: atm + step * 2,
      source: "DERIVED",
      focus: pcrFocusFromRatio(pcr),
    };
  }
}

/* ------------------------------ engine ------------------------------ */

export const getOptionStrategy = createServerFn({ method: "GET" }).handler(
  async (): Promise<OptionStrategyData> =>
    cached<OptionStrategyData>(
      "option-strategy",
      async () => {
    const now = new Date();

    // Astro bias from the EXISTING engine (read-only, unchanged formula).
    const { computeAstroPositions } = await import("./astro-engine.server");
    let astroBias: OptionStrategyData["astro"] = {
      bias: "Neutral",
      bullCount: 0,
      bearCount: 0,
      retroCount: 0,
      moonNakshatra: "—",
    };
    try {
      const pos = computeAstroPositions(now);
      const b: "Bullish" | "Bearish" | "Neutral" =
        pos.bullCount > pos.bearCount ? "Bullish" : pos.bearCount > pos.bullCount ? "Bearish" : "Neutral";
      astroBias = {
        bias: b,
        bullCount: pos.bullCount,
        bearCount: pos.bearCount,
        retroCount: pos.retroCount,
        moonNakshatra: pos.moonNakshatra,
      };
    } catch {
      /* astro optional */
    }

    // Live market data.
    const [niftyR, vixR, topRaw, sectorRaw] = await Promise.all([
      fetchQuote("^NSEI", "NIFTY 50"),
      safeQuote("^INDIAVIX", "India VIX"),
      Promise.all(TOP10.map((t) => safeQuote(t.symbol, t.name).then((q) => ({ meta: t, q })))),
      Promise.all(SECTORS.map((s) => safeQuote(s.symbol, s.name).then((q) => ({ meta: s, q })))),
    ]);

    const nifty = niftyR;

    // Top-10 weighted breadth.
    const top10: TopStock[] = topRaw
      .filter((x): x is { meta: (typeof TOP10)[number]; q: Quote } => x.q != null)
      .map(({ meta, q }) => ({
        symbol: meta.symbol,
        name: meta.name,
        price: q.price,
        changePct: q.changePct,
        weight: meta.weight,
        advancing: q.changePct >= 0,
        contribution: round2((q.changePct * meta.weight) / 100),
      }));
    const weightedBreadthScore = round2(
      clamp(top10.reduce((s, t) => s + t.contribution, 0) * 12, -100, 100),
    );
    const top10Bias = biasFromPct(weightedBreadthScore / 12);

    // Sectors.
    const sectors: Sector[] = sectorRaw
      .filter((x): x is { meta: (typeof SECTORS)[number]; q: Quote } => x.q != null)
      .map(({ meta, q }) => {
        const { advance, decline } = sectorBreadth(q.changePct);
        return {
          key: meta.key,
          name: meta.name,
          changePct: q.changePct,
          advance,
          decline,
          strength: round2(clamp(q.changePct * 20, -100, 100)),
          bias: biasFromPct(q.changePct),
        };
      });
    const sectorMap = new Map(sectors.map((s) => [s.key, s]));
    const sectorStrength = sectors.length
      ? round2(sectors.reduce((s, x) => s + x.strength, 0) / sectors.length)
      : 0;

    // Bullish fraction (0..1) blends sector strength + top-10 weighted score.
    const bullFrac = clamp(
      0.5 + (sectorStrength / 100) * 0.3 + (weightedBreadthScore / 100) * 0.2,
      0.05,
      0.95,
    );

    // NIFTY50 breadth modelled from top-10 + sectors.
    const advSectors = sectors.filter((s) => s.changePct >= 0).length;
    const niftyFrac = clamp(
      (top10.filter((t) => t.advancing).length / Math.max(1, top10.length)) * 0.6 +
        (advSectors / Math.max(1, sectors.length)) * 0.4,
      0.02,
      0.98,
    );
    const nAdv = Math.round(50 * niftyFrac);
    const niftyBreadth: Breadth = {
      advances: nAdv,
      declines: 50 - nAdv,
      ratio: round2(nAdv / Math.max(1, 50 - nAdv)),
      bias: niftyFrac > 0.55 ? "Bullish" : niftyFrac < 0.45 ? "Bearish" : "Neutral",
      label: niftyFrac > 0.6 ? "Strong Bullish" : niftyFrac > 0.5 ? "Bullish" : niftyFrac < 0.4 ? "Strong Bearish" : niftyFrac < 0.5 ? "Bearish" : "Neutral",
    };

    // Overall NSE breadth modelled from bullish fraction over ~3300 listed.
    const total = 3300;
    const nseAdv = Math.round(total * bullFrac);
    const nseBreadth: Breadth = {
      advances: nseAdv,
      declines: total - nseAdv,
      ratio: round2(nseAdv / Math.max(1, total - nseAdv)),
      bias: bullFrac > 0.55 ? "Bullish" : bullFrac < 0.45 ? "Bearish" : "Neutral",
      label: bullFrac > 0.62 ? "Strong Bullish" : bullFrac > 0.5 ? "Bullish" : bullFrac < 0.38 ? "Strong Bearish" : bullFrac < 0.5 ? "Bearish" : "Neutral",
    };

    // India VIX strategy.
    const vixVal = vixR?.price ?? 14;
    const vix: VixStrategy = vixStrategy(vixVal, vixR?.changePct ?? 0);

    // Option chain.
    const optionChain = await fetchOptionChain(nifty.price, bullFrac);

    /* ------------------------- decision engine ------------------------- */
    const reasonsBull: string[] = [];
    const reasonsBear: string[] = [];
    let bull = 0;
    let bear = 0;
    const bankingUp = (sectorMap.get("banking")?.changePct ?? 0) >= 0;
    const itUp = (sectorMap.get("it")?.changePct ?? 0) >= 0;
    const oilUp = (sectorMap.get("oilgas")?.changePct ?? 0) >= 0;
    const autoUp = (sectorMap.get("auto")?.changePct ?? 0) >= 0;
    const reliance = top10.find((t) => t.symbol === "RELIANCE.NS");

    const vote = (cond: boolean, w: number, up: string, down: string) => {
      if (cond) {
        bull += w;
        reasonsBull.push(up);
      } else {
        bear += w;
        reasonsBear.push(down);
      }
    };

    vote(nseBreadth.bias !== "Bearish" && nseBreadth.advances > nseBreadth.declines, 2, `NSE breadth strong (${nseBreadth.advances}▲/${nseBreadth.declines}▼)`, `NSE breadth weak (${nseBreadth.advances}▲/${nseBreadth.declines}▼)`);
    vote(niftyBreadth.advances >= niftyBreadth.declines, 2, `NIFTY50 breadth positive (${niftyBreadth.advances}/${niftyBreadth.declines})`, `NIFTY50 breadth negative (${niftyBreadth.advances}/${niftyBreadth.declines})`);
    vote(weightedBreadthScore >= 0, 2, "Top-10 weightage bullish", "Top-10 weightage bearish");
    vote(bankingUp, 1.5, "Banking leading", "Banking weak");
    vote(itUp, 1.5, "IT positive", "IT weak");
    vote(oilUp, 1, "Oil & Gas positive", "Oil & Gas weak");
    vote(autoUp, 1, "Auto positive", "Auto weak");
    if (reliance) vote(reliance.changePct >= 0, 1, "Reliance positive", "Reliance weak");
    vote(optionChain.pcr >= 1, 1.5, `PCR bullish (${optionChain.pcr})`, `PCR bearish (${optionChain.pcr})`);
    if (astroBias.bias === "Bullish") { bull += 1; reasonsBull.push("Astro bias bullish"); }
    else if (astroBias.bias === "Bearish") { bear += 1; reasonsBear.push("Astro bias bearish"); }

    const totalW = bull + bear || 1;
    const bullScore = Math.round((bull / totalW) * 100);
    const bearScore = 100 - bullScore;

    let action: Recommendation["action"] = "WAIT";
    let confidence = 50;
    let reasons: string[] = [];
    const diff = Math.abs(bullScore - bearScore);
    if (diff < 20) {
      action = "WAIT";
      confidence = round2(60 - diff);
      reasons = ["Mixed signals — no clear edge", `Bull ${bullScore}% vs Bear ${bearScore}%`, `VIX ${vixVal.toFixed(2)} → ${vix.label}`];
    } else if (bullScore > bearScore) {
      action = "BUY CE";
      confidence = clamp(bullScore, 0, 99);
      reasons = [`India VIX = ${vixVal.toFixed(2)} → ${vix.label}`, ...reasonsBull.slice(0, 7)];
    } else {
      action = "BUY PE";
      confidence = clamp(bearScore, 0, 99);
      reasons = [`India VIX = ${vixVal.toFixed(2)} → ${vix.label}`, ...reasonsBear.slice(0, 7)];
    }

    const recommendation: Recommendation = { action, confidence, bullScore, bearScore, reasons };

    // Special alerts.
    const allDown = !bankingUp && !itUp && !oilUp && !autoUp && nseBreadth.bias === "Bearish" && niftyBreadth.bias === "Bearish" && optionChain.pcr < 1;
    const allUp = bankingUp && itUp && oilUp && autoUp && nseBreadth.bias === "Bullish" && niftyBreadth.bias === "Bullish" && optionChain.pcr >= 1;
    const specialAlert = allUp
      ? { type: "CALL" as const, active: true }
      : allDown
        ? { type: "PUT" as const, active: true }
        : { type: "NONE" as const, active: false };

    return {
      asOf: now.toISOString(),
      nifty,
      vix,
      top10,
      weightedBreadthScore,
      top10Bias,
      sectors,
      sectorStrength,
      nseBreadth,
      niftyBreadth,
      optionChain,
      astro: astroBias,
      recommendation,
      specialAlert,
    };
      },
      { ttlMs: 30_000 },
    ),
);
