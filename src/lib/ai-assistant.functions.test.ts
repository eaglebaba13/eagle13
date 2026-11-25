import { describe, expect, it, vi } from "vitest";
import {
  sanitizeAssistantOutput,
  buildDomainFallbackAnswer,
  resolveAiAssistantReply,
} from "./ai-assistant.functions";

describe("assistant output guard", () => {
  it("blocks credentials and implementation snippets", () => {
    expect(sanitizeAssistantOutput("api_key: highly-sensitive-value")).not.toContain("highly-sensitive-value");
    expect(sanitizeAssistantOutput("function calculate() { return 42; }")).not.toContain("calculate");
  });

  it("keeps ordinary market explanations", () => {
    expect(sanitizeAssistantOutput("PCR compares put and call open interest.")).toBe(
      "PCR compares put and call open interest.",
    );
  });
});

describe("resolveAiAssistantReply & intent-aware bilingual domain intelligence", () => {
  it("uses OpenAI when OPENAI_API_KEY is valid and returns sanitized response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "WTT stands for Weak Towards Top (>= 75% shift)." } }],
      }),
    }) as unknown as typeof fetch;

    const result = await resolveAiAssistantReply({
      question: "what is wtt",
      language: "en",
      env: { OPENAI_API_KEY: "test-placeholder-key" },
      fetchImpl: fetchMock,
    });

    expect(result.provider).toBe("openai");
    expect(result.answer).toContain("Weak Towards Top");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to Gemini when OpenAI returns 401 and GEMINI_API_KEY is configured", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "WTT means upward OI/Volume pressure." }] } }],
        }),
      }) as unknown as typeof fetch;

    const result = await resolveAiAssistantReply({
      question: "what is wtt",
      language: "en",
      env: { OPENAI_API_KEY: "test-openai", GEMINI_API_KEY: "test-gemini" },
      fetchImpl: fetchMock,
    });

    expect(result.provider).toBe("gemini");
    expect(result.answer).toContain("WTT");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("records OPENAI_HTTP_401 fallbackReason and resolves PURE BLOOD BATH (COA #8) cleanly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;

    const enRes = await resolveAiAssistantReply({
      question: "Explain PURE BLOOD BATH (COA #8)",
      language: "en",
      env: { OPENAI_API_KEY: "invalid-key" },
      fetchImpl: fetchMock,
    });
    expect(enRes.provider).toBe("glossary");
    expect(enRes.fallbackReason).toBe("OPENAI_HTTP_401");
    expect(enRes.answer).toContain("PURE BLOOD BATH");
    expect(enRes.answer).toContain("suppressed");
    expect(enRes.answer).toContain("Max Pain");

    const hiRes = buildDomainFallbackAnswer("PURE BLOOD BATH (COA #8)", "hi");
    expect(hiRes).toContain("PURE BLOOD BATH");
    expect(hiRes).toContain("suppressed");
  });

  it("explains OVM-9: Dual-Side Trap (Type A) and Primary Safe Buy Setup (Support Reversal)", () => {
    const trapEn = buildDomainFallbackAnswer("What is OVM-9: Dual-Side Trap (Type A)?", "en");
    expect(trapEn).toContain("Dual-Side Trap");
    expect(trapEn).toContain("Straddle Compression");
    expect(trapEn).toContain("WAIT");

    const safeBuyEn = buildDomainFallbackAnswer("EAGLEBABA PRIMARY SAFE BUY SETUP (SUPPORT REVERSAL)", "en");
    expect(safeBuyEn).toContain("Support Reversal");
    expect(safeBuyEn).toContain("Invalidation Stop");
    expect(safeBuyEn).toContain("slRiskTier");

    const safeBuyHi = buildDomainFallbackAnswer("EAGLEBABA PRIMARY SAFE BUY SETUP (SUPPORT REVERSAL)", "hi");
    expect(safeBuyHi).toContain("Support Reversal");
    expect(safeBuyHi).toContain("Invalidation Stop");
  });

  it("answers Hinglish directional/pressure queries with PAZ/PDI/OVM-9/VWAP guidance and disclaimer", () => {
    const q1 = buildDomainFallbackAnswer("aaj market kidhar jayega", "hi");
    expect(q1).toContain("PAZ");
    expect(q1).toContain("OVM-9");
    expect(q1).toContain("VWAP");
    expect(q1).toContain("सलाह नहीं");

    const q2 = buildDomainFallbackAnswer("intraday ka pressure kis side hai", "en");
    expect(q2).toContain("PAZ & PDI");
    expect(q2).toContain("OVM-9");
    expect(q2).toContain("non-advisory");
  });

  it("answers core EagleBABA terms (WTT, RSB, D1 1:1, OI vs Volume, FVG/SMT, Gann/CPR)", () => {
    expect(buildDomainFallbackAnswer("what is wtt", "en")).toContain("Weak Towards Top");
    expect(buildDomainFallbackAnswer("what is d1 1:1 scalp", "en")).toContain("25-pt");
    expect(buildDomainFallbackAnswer("oi vs volume and pcr", "en")).toContain("Put OI / Call OI");
    expect(buildDomainFallbackAnswer("session flow expiry barrier", "en")).toContain("EXPIRY_BARRIER_RANGE");
    expect(buildDomainFallbackAnswer("session flow atm volume", "hi")).toContain("PUT_FLOW_EDGE");
    expect(buildDomainFallbackAnswer("fvg unicorn smt", "en")).toContain("Fair Value Gap");
    expect(buildDomainFallbackAnswer("gann and cpr", "en")).toContain("Central Pivot Range");
  });

  it("answers natural conversational, platform, dashboard, VWAP, option buying, stock analysis, and GAP queries", () => {
    const whatIsThis = buildDomainFallbackAnswer("what is this", "en");
    expect(whatIsThis).toContain("EagleBABA");
    expect(whatIsThis).toContain("Navigation Drawer");

    const eagleKyaHai = buildDomainFallbackAnswer("EagleBABA kya hai", "hi");
    expect(eagleKyaHai).toContain("EagleBABA");
    expect(eagleKyaHai).toContain("ब्रोकर ऑर्डर एग्जीक्यूशन");

    const howToUse = buildDomainFallbackAnswer("how to use", "en");
    expect(howToUse).toContain("/dashboard");
    expect(howToUse).toContain("/options-chain");
    expect(howToUse).toContain("/live-chart");

    const kisPage = buildDomainFallbackAnswer("kis page par kya hai", "hi");
    expect(kisPage).toContain("/dashboard");
    expect(kisPage).toContain("/chronowheel");

    const vwapEn = buildDomainFallbackAnswer("what is VWAP", "en");
    expect(vwapEn).toContain("Volume Weighted Average Price");

    const dashHi = buildDomainFallbackAnswer("dashboard kya dikhata hai", "hi");
    expect(dashHi).toContain("CPR LEVELS");
    expect(dashHi).toContain("SAFE ZONES");
    expect(dashHi).toContain("INDIA VIX");

    const optBuyHi = buildDomainFallbackAnswer("option buying kaise karte hai", "hi");
    expect(optBuyHi).toContain("OVM-9");
    expect(optBuyHi).toContain("Invalidation Stop");

    const callPutHi = buildDomainFallbackAnswer("call ya put me entry kab leni chahiye", "hi");
    expect(callPutHi).toContain("CE");
    expect(callPutHi).toContain("PE");

    const stockHi = buildDomainFallbackAnswer("stocks analyse kaise karte hai", "hi");
    expect(stockHi).toContain("STOCKS 4-LINE");
    expect(stockHi).toContain("/fo-ban-list");

    const gapEn = buildDomainFallbackAnswer("GAP · No verified option OI observation kya hai", "en");
    expect(gapEn).toContain("data-integrity marker");
    expect(gapEn).toContain("09:15–15:30 IST");

    const gapHi = buildDomainFallbackAnswer("GAP · No verified option OI observation kya hai", "hi");
    expect(gapHi).toContain("डेटा-इंटीग्रिटी");
  });
});
