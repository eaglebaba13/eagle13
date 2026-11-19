import type { AlertJob } from "./modular-alert-schedule";
import { isVerifiedFoAlertEligible } from "./ban-filter";
import type { IndexQuote } from "../market.functions";
import { computeLevels, cprBias } from "../levels";

export type AlertContent = { text: string; version?: string; key?: string };
const site = "https://eaglebaba.lwill.in";
const istDate = (now: Date) => new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
const format = (value: number | null | undefined) => value == null ? "Unavailable" : value.toFixed(2);

function quoteLevels(quote: IndexQuote | null | undefined) {
  if (!quote) return "Quote unavailable";
  const levels = computeLevels(quote.prevDay, 0);
  const bias = cprBias(levels);
  return `${quote.name} · LTP ${format(quote.livePrice)} · prior session ${quote.prevDay.date}\n${bias.label} · R3 ${levels.r3} · R2 ${levels.r2} · R1 ${levels.r1} · Pivot ${levels.pivot} · S1 ${levels.s1} · S2 ${levels.s2} · S3 ${levels.s3}`;
}

export function createAlertContentLoader(now: Date) {
  const date = istDate(now);
  let market: ReturnType<typeof import("../market.functions").getMarketDataImpl> | undefined;
  const getMarket = async () => market ??= (await import("../market.functions")).getMarketDataImpl();
  let ban: ReturnType<typeof import("../market-data/fo-ban-tracker.server").getFoBanTrackerReport> | undefined;
  const getBan = async () => ban ??= (await import("../market-data/fo-ban-tracker.server")).getFoBanTrackerReport();
  let terminal: ReturnType<typeof import("../option-strategy-terminal/terminal.functions").getOptionStrategyTerminalInternal> | undefined;
  const getTerminal = async () => terminal ??= (await import("../option-strategy-terminal/terminal.functions")).getOptionStrategyTerminalInternal();

  return async (id: AlertJob): Promise<AlertContent | null> => {
    switch (id) {
      case "panchang": {
        const { computeAstroPositions } = await import("../astro-engine.server");
        const { computePanchangBundle } = await import("../multi-asset/panchang-bundle");
        const positions = computeAstroPositions(now);
        const sun = positions.planets.find(({ planet }) => planet === "Sun");
        const moon = positions.planets.find(({ planet }) => planet === "Moon");
        if (!sun || !moon) return null;
        const p = computePanchangBundle({ sunAbs: sun.absDegree, moonAbs: moon.absDegree, now: now.getTime() });
        return { text: `${p.date} · ${p.paksha} ${p.tithi}\nNakshatra ${p.nakshatra} · Yoga ${p.yoga} · Karana ${p.karana}\nMoon: ${positions.moonPhase.phaseName} · ${format(positions.moonPhase.illumination)}% illuminated` };
      }
      case "morning": {
        const data = await getMarket();
        return { text: `${date} IST · India VIX ${format(data.vix?.livePrice)}\n${quoteLevels(data.nifty)}\n\n${quoteLevels(data.banknifty)}\n${site}` };
      }
      case "context": {
        const { FO_UNIVERSE } = await import("../cycles/cycle-performance.server");
        const { fetchLiveQuotesBatch, getCachedMarketData } = await import("../cycles/market-data-adapter.server");
        const equities = FO_UNIVERSE.filter(({ category }) => category === "FO_EQUITY");
        const [data, quotes] = await Promise.all([getMarket(), fetchLiveQuotesBatch(equities.map(({ symbol }) => symbol))]);
        const movers = equities.flatMap(({ symbol, sector }) => {
          const change = quotes.get(symbol)?.changePct;
          return getCachedMarketData(symbol)?.isLive && typeof change === "number" && Number.isFinite(change)
            ? [{ symbol, sector, change }] : [];
        }).sort((a, b) => b.change - a.change);
        const sectors = new Map<string, { total: number; count: number }>();
        for (const { sector, change } of movers) {
          const previous = sectors.get(sector) ?? { total: 0, count: 0 };
          sectors.set(sector, { total: previous.total + change, count: previous.count + 1 });
        }
        const ranked = [...sectors].sort(([, a], [, b]) => b.total / b.count - a.total / a.count);
        const rankText = (items: typeof movers) => items.map(({ symbol, change }) => `${symbol} ${format(change)}%`).join(", ") || "Unavailable";
        const sectorText = (items: typeof ranked) => items.map(([sector, row]) => `${sector} ${format(row.total / row.count)}%`).join(", ") || "Unavailable";
        return { text: `India VIX ${format(data.vix?.livePrice)} · ${movers.length} F&O quotes\nTop movers: ${rankText(movers.slice(0, 5))}\nBottom movers: ${rankText(movers.slice(-5).reverse())}\nStrong sectors (mean F&O move): ${sectorText(ranked.slice(0, 3))}\nWeak sectors: ${sectorText(ranked.slice(-3).reverse())}` };
      }
      case "nifty":
      case "banknifty":
      case "sensex": {
        const quote = (await getMarket())[id];
        return quote ? { text: quoteLevels(quote) } : null;
      }
      case "commodity": {
        const data = await getMarket();
        if (data.goldSilverRatio == null) return null;
        return { text: `Gold / Silver futures ratio ${format(data.goldSilverRatio)}\n${quoteLevels(data.gold)}\n\n${quoteLevels(data.silver)}` };
      }
      case "crypto": {
        const { fetchLiveCryptoTickersImpl } = await import("../market-data/crypto-tickers.functions");
        const quotes = await fetchLiveCryptoTickersImpl();
        const lines = ["BTCUSDT", "ETHUSDT"].flatMap((symbol) => {
          const quote = quotes[symbol];
          if (!quote || now.getTime() - quote.updatedAt > 120_000 || !quote.updatedAt) return [];
          return [`${symbol} · ${format(quote.price)} · 24h low ${format(quote.low24h)} · 24h high ${format(quote.high24h)}`];
        });
        return lines.length ? { text: lines.join("\n") } : null;
      }
      case "flows": {
        const { fetchNseLiveFiiDii } = await import("../market-data/fii-dii.server");
        const result = await fetchNseLiveFiiDii();
        return result ? { key: result.date, text: `${result.date} · FII net ₹${format(result.fii.net)} Cr · DII net ₹${format(result.dii.net)} Cr` } : null;
      }
      case "navagraha": {
        const { getHTGannIntraInternal } = await import("../ht-gann-intra.functions");
        const output = await Promise.all((["NIFTY", "BANKNIFTY"] as const).map(async (symbol) => {
          const { intraMatrix: matrix } = await getHTGannIntraInternal({ symbol, date });
          const plan = (label: string, threshold: number, levels: typeof matrix.primarySafeBuySetup) => {
            const t = levels?.tradeLevels;
            return `Safe ${label} ${threshold}${t ? ` · Entry ${t.entry} · Hard SL ${t.sl} · TP1 ${t.tp1} · TP2 ${t.tp2} · TP3 ${t.tp3}` : " · Setup unavailable"}`;
          };
          return [symbol, plan("Buy", matrix.safeBuyThreshold, matrix.primarySafeBuySetup), plan("Sell", matrix.safeSellThreshold, matrix.primarySafeSellSetup)].join("\n");
        }));
        return { text: `${output.join("\n\n")}\n${site}/astro` };
      }
      case "cube": {
        const { getHTGannIntraInternal } = await import("../ht-gann-intra.functions");
        const { masterCube: cube } = await getHTGannIntraInternal({ symbol: "NIFTY", date });
        return { text: `${cube.isMasterCubeActive ? "A+ CUBE SETUP ACTIVE" : cube.verdictBadge}\n${cube.executionPlan}\n${site}/astro` };
      }
      case "chronowheel": {
        const tracker = await getBan();
        if (!Object.values(tracker.allMap).some((row) => isVerifiedFoAlertEligible(row))) return null;
        const { executeChronoWheelScan } = await import("../cycles/cycle-performance.server");
        const scan = await executeChronoWheelScan({ startDate: date, endDate: date, lookbackYears: 5 });
        const eligible = scan.results.filter(({ symbol, category }) => category === "FO_EQUITY" && isVerifiedFoAlertEligible(tracker.allMap[symbol]));
        const rank = (bias: string, direction: number) => eligible.filter((row) => row.confluenceBias.includes(bias))
          .sort((a, b) => direction * (b.avgReturn - a.avgReturn)).slice(0, 5)
          .map((row) => `${row.symbol} · ${row.confluenceBias} · mean return ${format(row.avgReturn)}% · ${row.totalWindows} windows`).join("\n");
        return { text: `Bullish\n${rank("BULLISH", 1) || "No eligible setups"}\nBearish\n${rank("BEARISH", -1) || "No eligible setups"}\n${site}/chronowheel` };
      }
      case "ban": {
        const { formatFoBanTelegramAlert } = await import("./telegram-delivery.server");
        const tracker = await getBan();
        if (tracker.source !== "NSE_LIVE" && !Object.values(tracker.allMap).some((row) => row.verifiedLive)) return null;
        return { text: formatFoBanTelegramAlert(tracker) };
      }
      case "coa": {
        const { fetchCanonicalOptionChain } = await import("../option-chain/canonical-snapshot.server");
        const { processOptionChainToLtpCalculator } = await import("../options/ltp-calculator-engine.server");
        const chain = await fetchCanonicalOptionChain({ underlying: "NIFTY" });
        if (!chain.ok || chain.snapshot?.dataQuality !== "OK" || !(Number(chain.snapshot.spotPrice) > 0)) return null;
        const { coaScenario: c, reversalLevels: r } = processOptionChainToLtpCalculator(chain.snapshot);
        return {
          version: JSON.stringify([c.scenarioId, c.supportState, c.resistanceState, r.supportStrike, r.resistanceStrike]),
          text: `NIFTY · ${c.tag} ${c.name}\nSupport ${r.supportStrike} · Resistance ${r.resistanceStrike}\nSafe Buy ${r.sModerate} · Safe Sell ${r.rModerate}\nMax Pain ${r.maxPainSl} · Max Gain ${r.maxGainTarget}\nWTT/WTB: support ${c.supportState} · resistance ${c.resistanceState}\nRule: ${c.recommendation}\n${site}/options-chain`,
        };
      }
      case "screener": {
        const tracker = await getBan();
        if (!Object.values(tracker.allMap).some((row) => isVerifiedFoAlertEligible(row))) return null;
        const { scanLtpBlastUniverse } = await import("../options/ltp-calculator-engine.server");
        const { getCachedMarketData } = await import("../cycles/market-data-adapter.server");
        const eligible = (await scanLtpBlastUniverse("ALL")).filter(({ symbol }) =>
          getCachedMarketData(symbol)?.isLive === true && isVerifiedFoAlertEligible(tracker.allMap[symbol]),
        );
        const rank = (side: string) => eligible.filter(({ triggerType }) => triggerType.startsWith(side))
          .sort((a, b) => a.distanceToNearestPct - b.distanceToNearestPct).slice(0, 5);
        const bulls = rank("BULLISH");
        const bears = rank("BEARISH");
        const lines = (rows: typeof bulls) => rows.map(({ symbol, ltp, nearestLine }) => `${symbol} · ${format(ltp)} · ${nearestLine}`).join("\n");
        return { version: JSON.stringify([bulls, bears].map((group) => group.map(({ symbol, nearestLine }) => [symbol, nearestLine]))), text: `Bullish\n${lines(bulls) || "No eligible setups"}\nBearish\n${lines(bears) || "No eligible setups"}\n${site}/options-chain` };
      }
      case "pcr": {
        const { getDecisionSnapshotInternal } = await import("../decision.functions");
        const { fetchCanonicalOptionChain } = await import("../option-chain/canonical-snapshot.server");
        const { aggregateStrikes, safeRatio } = await import("../combined-pcr/pcr-math");
        const [snapshot, chain] = await Promise.all([getDecisionSnapshotInternal(), fetchCanonicalOptionChain({ underlying: "NIFTY" })]);
        const pcr = snapshot.capabilities.pcrCombined;
        const oi = chain.ok && chain.snapshot?.dataQuality === "OK" ? aggregateStrikes(chain.snapshot.strikes) : null;
        const nifty = oi ? safeRatio(oi.putOi, oi.callOi) : null;
        return { text: `NIFTY PCR ${format(nifty)} · Combined PCR ${format(pcr.pcrOi)} · Score ${format(pcr.combinedScore)}\nResearch signal ${snapshot.decision.action}` };
      }
      case "optionBuying":
      case "terminal": {
        const view = await getTerminal();
        const d = view.decisionEngine;
        if (view.source === "UNAVAILABLE" || view.source === "RESEARCH_DEMO") return null;
        const strategy = id === "terminal" ? view.engine.recommended.map(({ profile }) => profile.label).join(", ") : "";
        const weights = d.indicators.map((i) => `${i.label}: ${i.bias} · weight ${i.weight} · bull +${i.bullContribution} / bear +${i.bearContribution}`).join("\n");
        return { version: JSON.stringify([d.action, strategy, d.strike.strike]), text: `${d.action} · confidence ${d.confidence}%\n${strategy}\n${weights}\n${d.reasoning.join("\n")}\nRecommended ITM strike: ${d.strike.moneyness === "ITM" ? d.strike.strike ?? "Unavailable" : "Unavailable"}\n${site}/option-strategy` };
      }
      case "bells":
        return null;
    }
  };
}
