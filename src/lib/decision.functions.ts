// Phase 17 — server aggregator for the Decision Intelligence Engine.
//
// This function ONLY CONSUMES outputs from already-validated engines. It
// never recomputes Astro, Signals, Support/Resistance, Backtest, Replay, or
// Options analytics. If a module is unavailable it is marked absent so the
// pure decision engine can redistribute weights transparently.

import { createServerFn } from "@tanstack/react-start";
import { cached } from "./server-cache";
import { getAstro } from "./astro.functions";
import { getMarketData } from "./market.functions";
import { getOptionsChain } from "./options-chain.functions";
import { nseSession } from "./terminal-clock";
import {
  computePCR,
  rankWriting,
  rankUnwinding,
} from "./options-analytics";
import {
  astroSignal,
  optionsSignal,
  pcrSignal,
  breadthSignal,
  sectorSignal,
  vixSignal,
  historicalSignal,
  replaySignal,
  computeDecision,
  type Decision,
  type ModuleSignal,
  type Bias,
} from "./decision-engine";

export type DecisionSnapshot = {
  decision: Decision;
  signals: ModuleSignal[];
  context: {
    symbol: "NIFTY" | "BANKNIFTY";
    vix: number | null;
    marketOpen: boolean;
    provider: string;
    optionsSource: string;
    nifty: number | null;
    banknifty: number | null;
  };
  generatedAt: string;
};

export const getDecisionSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<DecisionSnapshot> =>
    cached<DecisionSnapshot>(
      "decision-snapshot",
      async () => {
        // Reuse every existing engine — never recompute.
        const [astroRes, marketRes, chainRes] = await Promise.allSettled([
          getAstro(),
          getMarketData(),
          getOptionsChain({ data: { symbol: "NIFTY" } }),
        ]);

        const astro = astroRes.status === "fulfilled" ? astroRes.value : null;
        const market = marketRes.status === "fulfilled" ? marketRes.value : null;
        const chain = chainRes.status === "fulfilled" ? chainRes.value : null;

        const marketOpen = nseSession().isOpen;

        // ----- Astro signal -----
        const astroSig: ModuleSignal = astro
          ? astroSignal({
              bullCount: astro.bullCount,
              bearCount: astro.bearCount,
              retroCount: astro.retroCount,
              emaBias: astro.emaBias,
            })
          : absentSignal("astro", 0.25, "Astro");

        // ----- Options + PCR signals -----
        let optionsSig: ModuleSignal = absentSignal("options", 0.2, "Options");
        let pcrSig: ModuleSignal = absentSignal("pcr", 0.1, "PCR");
        let optionsSource = chain?.integrity.sourceStatus ?? "UNAVAILABLE";
        if (chain && chain.integrity.sourceStatus !== "UNAVAILABLE") {
          const legs = chain.snapshot.legs;
          const pcr = computePCR(legs);
          const topPutWriting = rankWriting(legs, chain.snapshot.spot, "PE", 3);
          const topCallWriting = rankWriting(legs, chain.snapshot.spot, "CE", 3);
          const topPutUnwind = rankUnwinding(legs, chain.snapshot.spot, "PE", 3);
          const topCallUnwind = rankUnwinding(legs, chain.snapshot.spot, "CE", 3);
          const putWriteVol = topPutWriting.reduce((a, r) => a + r.changeOi, 0);
          const callWriteVol = topCallWriting.reduce((a, r) => a + r.changeOi, 0);
          const putUnwindVol = Math.abs(
            topPutUnwind.reduce((a, r) => a + r.changeOi, 0),
          );
          const callUnwindVol = Math.abs(
            topCallUnwind.reduce((a, r) => a + r.changeOi, 0),
          );
          const bull =
            putWriteVol > callWriteVol * 1.1 || callUnwindVol > putUnwindVol * 1.1;
          const bear =
            callWriteVol > putWriteVol * 1.1 || putUnwindVol > callUnwindVol * 1.1;
          optionsSig = optionsSignal({
            pcrOi: pcr.pcrOi,
            writingBiasBull: bull,
            writingBiasBear: bear,
            present: chain.integrity.isTradable || chain.integrity.sourceStatus === "LIVE",
            note: `PCR-OI ${pcr.pcrOi.toFixed(2)} · put-write ${putWriteVol.toLocaleString()} vs call-write ${callWriteVol.toLocaleString()}`,
          });
          pcrSig = pcrSignal({ pcrOi: pcr.pcrOi });
        }

        // ----- Breadth: indices trending together = positive breadth -----
        const advancers: string[] = [];
        const decliners: string[] = [];
        const check = (name: string, pct: number | null | undefined) => {
          if (pct == null) return;
          if (pct > 0.05) advancers.push(name);
          else if (pct < -0.05) decliners.push(name);
        };
        if (market) {
          check("NIFTY", market.nifty?.changePct);
          check("BANKNIFTY", market.banknifty?.changePct);
          check("VIX", market.vix ? -market.vix.changePct : null);
          check("Gold", market.gold?.changePct);
          check("Silver", market.silver?.changePct);
          check("BTC", market.btc?.changePct);
        }
        const breadthSig = breadthSignal({
          advancers: advancers.length,
          decliners: decliners.length,
          present: advancers.length + decliners.length > 0,
        });

        // ----- Sector rotation (NIFTY vs BANKNIFTY relative strength) -----
        let sectorSig: ModuleSignal = absentSignal("sector", 0.1, "Sector Rotation");
        if (market?.nifty && market.banknifty) {
          const diff = market.banknifty.changePct - market.nifty.changePct;
          const strength = Math.min(1, Math.abs(diff) / 1.5);
          const bias: Bias = diff > 0.2 ? "BULL" : diff < -0.2 ? "BEAR" : "NEUTRAL";
          sectorSig = sectorSignal({
            leadingBias: bias,
            strength,
            note: `BANK NIFTY vs NIFTY ${diff.toFixed(2)}%`,
            present: true,
          });
        }

        // ----- VIX -----
        const vixVal = market?.vix?.livePrice ?? null;
        const vixSig = vixSignal({
          vix: vixVal,
          changePct: market?.vix?.changePct ?? null,
        });

        // ----- Historical accuracy / replay: not consumed at this time. -----
        // The pure engine handles missing modules transparently.
        const historicalSig = historicalSignal({
          winRatePct: null,
          direction: "NEUTRAL",
          sampleSize: 0,
        });
        const replaySig = replaySignal({
          agreesWithDirection: null,
          direction: "NEUTRAL",
        });

        const signals = [
          astroSig,
          optionsSig,
          pcrSig,
          breadthSig,
          sectorSig,
          vixSig,
          historicalSig,
          replaySig,
        ];

        const decision = computeDecision(signals, {
          vix: vixVal,
          historicalAccuracy: null,
          marketOpen,
          generatedAt: new Date().toISOString(),
        });

        return {
          decision,
          signals,
          context: {
            symbol: "NIFTY",
            vix: vixVal,
            marketOpen,
            provider: chain?.snapshot.provider ?? "Yahoo / EagleBABA engines",
            optionsSource,
            nifty: market?.nifty?.livePrice ?? null,
            banknifty: market?.banknifty?.livePrice ?? null,
          },
          generatedAt: new Date().toISOString(),
        };
      },
      { ttlMs: 30_000 },
    ),
);

function absentSignal(
  key: ModuleSignal["key"],
  weight: number,
  label: string,
): ModuleSignal {
  return {
    key,
    label,
    bias: "NEUTRAL",
    score: 0,
    confidence: 0,
    weight,
    present: false,
    note: "Not available",
  };
}