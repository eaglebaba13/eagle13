// EagleBABA Intent-Aware Bilingual Trading & Platform Domain Resolver
// Research & education only — never gives financial advice or executes orders.

export type AssistantLanguage = "en" | "hi";

interface DomainRule {
  readonly id: string;
  readonly patterns: readonly RegExp[];
  readonly en: string;
  readonly hi: string;
}

const DOMAIN_RULES: readonly DomainRule[] = [
  {
    id: "bloodbath",
    patterns: [
      /\b(?:pure\s*)?blood\s*bath\b/i,
      /\bcoa\s*#?\s*8\b/i,
      /\bcascade\s*breakdown\b/i,
    ],
    en: [
      "**PURE BLOOD BATH (COA #8 / Cascade Breakdown)** signals aggressive bearish option-chain and price pressure (heavy Call writing velocity + Put long liquidation).",
      "• **One-Sided Gating:** Bullish / Call counter-trend entries (`EOS` / `S-MOD` bounces) are **suppressed** (`BEARISH_ONLY`) to prevent catching a falling knife.",
      "• **Risk & SL Discipline:** Research setups focus only on resistance-rejection (`BUY_PE`) with `Invalidation Stop` above `EOR` / `PAZ-Res`, watching `Max Pain (SL)` and `D1 (1:1)` (`25`-pt cap) distance before any action. (Research & education only.)",
    ].join("\n"),
    hi: [
      "**PURE BLOOD BATH (COA #8 / Cascade Breakdown)** बाज़ार में तेज़ मंदी (bearish) का दबाव दर्शाता है—जहाँ भारी Call राइटिंग और Put अनवाइंडिंग एक साथ होती है।",
      "• **One-Sided Gating:** ऐसे समय में बुलिश / Call काउंटर-ट्रेंड एंट्री (`EOS` / `S-MOD`) **suppressed** रहती हैं ताकि गिरते बाज़ार में फँसने से बचा जा सके।",
      "• **SL और रिस्क अनुशासन:** केवल रेजिस्टेंस-रिजेक्शन (`BUY_PE`) संरचना पर ध्यान दिया जाता है, `Invalidation Stop` (`EOR` / `PAZ-Res` के ऊपर), `Max Pain (SL)` और `D1 (1:1)` (`25`-pt कैप) के साथ। (केवल रिसर्च और शिक्षा के लिए।)",
    ].join("\n"),
  },
  {
    id: "dual-side-trap",
    patterns: [
      /\bdual[-\s]*side\s*trap\b/i,
      /\bovm[-\s]*9\b.*\btrap\b/i,
      /\btype\s*[ab]\b.*\btrap\b/i,
      /\bstraddle\s*trap\b/i,
    ],
    en: [
      "**OVM-9: Dual-Side Trap (Type A / Type B)** warns of high two-sided chop and stop-hunt risk:",
      "• **Type A (Straddle Compression):** Both Call and Put writers are adding aggressively at nearly equal slopes, pinning price and accelerating theta decay.",
      "• **Type B (Unwinding / Liquidation):** Both sides are unwinding contracts, causing erratic whipsaws and false breakouts.",
      "• **Discipline:** RSB marks aggressive entries and outer targets (`T2`/`T3`) as invalidated (`WAIT` state). Wait for one side to establish clear dominance (`Momentum Surge` or `Cascade Breakdown`) and confirm at key levels.",
    ].join("\n"),
    hi: [
      "**OVM-9: Dual-Side Trap (Type A / Type B)** दो-तरफ़ा चॉप और स्टॉप-हंट के उच्च जोखिम की चेतावनी देता है:",
      "• **Type A (Straddle Trap):** Call और Put दोनों साइड में बराबर तेज़ी से राइटिंग हो रही है, जिससे प्राइस रेंज में फँसकर थीटा डिके तेज़ होता है।",
      "• **Type B (Liquidation):** दोनों साइड के कॉन्ट्रैक्ट्स घट रहे हैं, जिससे दोनों तरफ़ फेक ब्रेकआउट और स्टॉप-हंट हो सकते हैं।",
      "• **अनुशासन:** इस स्थिति में सिस्टम `WAIT` मोड दिखाता है—जब तक एक साइड स्पष्ट बढ़त न ले और लेवल कन्फर्म न हो, जल्दबाज़ी से बचें।",
    ].join("\n"),
  },
  {
    id: "safe-buy-support-reversal",
    patterns: [
      /\bprimary\s*safe\s*buy\b/i,
      /\bsafe\s*buy\b/i,
      /\bsupport\s*reversal\b/i,
      /\bs[-\s]*mod\b/i,
    ],
    en: [
      "**EagleBABA Primary Safe Buy Setup (Support Reversal)** looks for controlled mean-reversion bounces from verified support (`PAZ-Sup` / `EOS` / `S-MOD`):",
      "• **Entry Logic:** Price tests the support reversal zone while `OVM-9` is NOT in `Cascade Breakdown` (`Bloodbath`) or `Dual-Side Trap`.",
      "• **Confirmation & Invalidation:** Look forPut OI support stability (`STABLE_STRONG` or `WTB_TO_STRONG` / `SHIFTED_B2T`), place `Invalidation Stop` cleanly below the support band, and evaluate `slRiskTier` (`TIGHT` / `MODERATE` / `WIDE`) + `1:1` / `T1`–`T3` R:R.",
    ].join("\n"),
    hi: [
      "**EagleBABA Primary Safe Buy Setup (Support Reversal)** सत्यापित सपोर्ट ज़ोन (`PAZ-Sup` / `EOS` / `S-MOD`) से संभावित बाउंस को ट्रैक करता है:",
      "• **एंट्री लॉजिक:** प्राइस सपोर्ट रिवर्सल ज़ोन पर आए और `OVM-9` में `Cascade Breakdown` (`Bloodbath`) या `Dual-Side Trap` न हो।",
      "• **कन्फर्मेशन और स्टॉप-लॉस:** Put सपोर्ट मजबूत रहे (`STABLE_STRONG` / `WTB_TO_STRONG` / `SHIFTED_B2T`), `Invalidation Stop` सपोर्ट ज़ोन के नीचे रहे, और `slRiskTier` व `T1`–`T3` रिस्क-रिवॉर्ड अनुकूल हो।",
    ].join("\n"),
  },
  {
    id: "directional-pressure",
    patterns: [
      /\baaj\s*market\b/i,
      /\bkidhar\s*(?:jayega|jaega|ja\s*raha|jaa\s*raha)\b/i,
      /\bkis\s*side\b/i,
      /\bintraday\s*(?:ka\s*)?pressure\b/i,
      /\bmarket\s*(?:direction|bias|view|today)\b/i,
      /\bbullish\s*(?:or|ya)\s*bearish\b/i,
    ],
    en: [
      "EagleBABA provides non-advisory market structure research (no guaranteed direction or financial advice). To read **live intraday pressure**, check these 3 layers together:",
      "1. **PAZ & PDI (`WTT` / `WTB` / Shifts):** On `/options-chain`, check `EOS` (`PAZ-Sup`) and `EOR` (`PAZ-Res`) pressure tags (`STABLE_STRONG`, `WTT_TO_STRONG`, `WTB_TO_STRONG`, `SHIFTED_B2T`, `SHIFTED_T2B`).",
      "2. **OVM-9 & ATM Volume vs ΔOI:** Check whether Put writing (`Momentum Surge` / `Slight Bullish`) or Call writing (`Cascade Breakdown` / `Slight Bearish`) dominates.",
      "3. **Key Levels & Confirmation:** Align with `CPR` (`TC`/`PP`/`BC`), `VWAP`, and `RSB` (`EXECUTION VALID` vs gated) on `/live-chart` before forming any view.",
    ].join("\n"),
    hi: [
      "EagleBABA एक रिसर्च प्लेटफ़ॉर्म है (कोई गारंटीड दिशा या वित्तीय सलाह नहीं देता)। **आज का इंट्राडे प्रेशर** समझने के लिए इन 3 स्तरों को एक साथ देखें:",
      "1. **PAZ और PDI (`WTT` / `WTB` / शिफ्ट्स):** `/options-chain` पर `EOS` और `EOR` के प्रेशर टैग (`STABLE_STRONG`, `WTT_TO_STRONG`, `WTB_TO_STRONG`, `SHIFTED_B2T`, `SHIFTED_T2B`) देखें।",
      "2. **OVM-9 और ΔOI / Volume:** देखें कि Put राइटिंग (`Momentum Surge` / `Slight Bullish`) हावी है या Call राइटिंग (`Cascade Breakdown` / `Slight Bearish`)।",
      "3. **लेवल कन्फर्मेशन:** `/live-chart` पर `CPR`, `VWAP` और `RSB` (`EXECUTION VALID` या gated) के साथ प्राइस एक्शन कन्फर्म करें।",
    ].join("\n"),
  },
  {
    id: "wtt",
    patterns: [/\b(?:wtt|weak\s*towards\s*top)\b/i],
    en: "WTT (Weak Towards Top) means a secondary strike above the primary anchor (PAZ) has reached >= 75% of the primary strike's Open Interest or Volume. In EagleBABA's PDI / COA 1.0 framework, WTT signals upward shifting pressure toward the higher strike (`WTT_TO_STRONG`).",
    hi: "WTT (Weak Towards Top) का अर्थ है कि मुख्य एंकर (PAZ) से ऊपर के किसी स्ट्राइक पर Open Interest या Volume मुख्य स्ट्राइक के 75% या उससे अधिक पहुँच गया है। EagleBABA के PDI / COA 1.0 फ्रेमवर्क में यह ऊपर के स्ट्राइक की ओर दबाव दर्शाता है।",
  },
  {
    id: "wtb",
    patterns: [/\b(?:wtb|weak\s*towards\s*bottom)\b/i],
    en: "WTB (Weak Towards Bottom) means a secondary strike below the primary anchor (PAZ) has reached >= 75% of the primary strike's Open Interest or Volume. It signals downward shifting pressure toward the lower strike (`WTB_TO_STRONG`).",
    hi: "WTB (Weak Towards Bottom) का अर्थ है कि मुख्य एंकर (PAZ) से नीचे के किसी स्ट्राइक पर Open Interest या Volume मुख्य स्ट्राइक के 75% या उससे अधिक पहुँच गया है। यह नीचे के स्ट्राइक की ओर दबाव दर्शाता है।",
  },
  {
    id: "paz",
    patterns: [/\b(?:paz|primary\s*anchor|eos|eor)\b/i],
    en: "PAZ (Primary Anchor Zones: `PAZ-Sup` / `EOS` and `PAZ-Res` / `EOR`) are found by scanning outward from the ATM strike to locate the dominant Put Support and Call Resistance anchors by Volume and OI.",
    hi: "PAZ (Primary Anchor Zones: `PAZ-Sup` / `EOS` और `PAZ-Res` / `EOR`) ATM स्ट्राइक से बाहर स्कैन करके Volume/OI के आधार पर प्रमुख Support और Resistance एंकर तय करते हैं।",
  },
  {
    id: "pdi",
    patterns: [/\b(?:pdi|pressure\s*drift)\b/i],
    en: "PDI (Pressure Drift Index) measures challenger strike strength as a percentage of the primary PAZ anchor. >= 75% triggers drift (`WTT ↗` / `WTB ↘`) and classifies anchor pressure as `STABLE_STRONG`, `WTT_TO_STRONG`, `WTB_TO_STRONG`, `SHIFTED_B2T`, or `SHIFTED_T2B`.",
    hi: "PDI (Pressure Drift Index) मुख्य PAZ एंकर के मुकाबले दूसरे स्ट्राइक की ताकत (%) मापता है। 75%+ होने पर `WTT ↗` / `WTB ↘` ड्रिफ्ट और `STABLE_STRONG`, `WTT_TO_STRONG`, `WTB_TO_STRONG`, `SHIFTED_B2T`, `SHIFTED_T2B` स्टेट दिखता है।",
  },
  {
    id: "rsb-d1",
    patterns: [/\b(?:rsb|reversal\s*(?:&|and)?\s*stretch|d1|1:1\s*scalp)\b/i],
    en: "RSB (Reversal & Stretch Bands) provides Conservative/Aggressive Entry, Invalidation Stop (with `slDistancePts` and `TIGHT`/`MODERATE`/`WIDE` risk tier), and Targets `T1`–`T3` (`RSB-Ext` adds +1 strike on B2T shifts). **D1 (1:1) Scalp** tracks a 1:1 fixed-points move with a **25-pt recommended cap** and flags `overExtended` when distance > 25 pts.",
    hi: "RSB (Reversal & Stretch Bands) Conservative/Aggressive Entry, Invalidation Stop (`TIGHT`/`MODERATE`/`WIDE` रिस्क टियर सहित) और `T1`–`T3` लक्ष्य देता है। **D1 (1:1) Scalp** 25-पॉइंट कैप के साथ 1:1 फिक्स्ड-पॉइंट प्लान दिखाता है और >25 pts होने पर `overExtended` चेतावनी देता है।",
  },
  {
    id: "oi-volume-pcr",
    patterns: [
      /\b(?:oi\b|open\s*interest|pcr|volume|session\s*flow|expiry\s*barrier|flow\s*edge|delta\s*oi)\b/i,
    ],
    en: [
      "**Intraday OI vs. Volume & Session Flow Intelligence:**",
      "• **Session OI Profile:** High OI concentration on expiry signals `EXPIRY_BARRIER_RANGE` (range-bound pinning), while lower OI favors `DIRECTIONAL_MOMENTUM`; large OI on a non-expiry day triggers `EVENT_HIGH_OI_OVERRIDE`.",
      "• **ATM Participation & ΔOI Contrast:** Compare ATM Call vs. Put volume dominance against ΔOI buildup. When one side builds ΔOI on lower volume while the opposing side leads ATM volume flow, EagleBABA classifies `CALL_FLOW_EDGE`, `PUT_FLOW_EDGE`, or `BALANCED_RANGE` alongside PCR (`Put OI / Call OI`).",
    ].join("\n"),
    hi: [
      "**इंट्राडे OI बनाम Volume और सेशन फ्लो इंटेलिजेंस:**",
      "• **Session OI Profile:** एक्सपायरी पर अधिक OI `EXPIRY_BARRIER_RANGE` (रेंज-बाउंड पिनिंग) दिखाता है, कम OI `DIRECTIONAL_MOMENTUM` को सपोर्ट करता है, और नॉन-एक्सपायरी पर बड़ा OI `EVENT_HIGH_OI_OVERRIDE` ट्रिगर करता है।",
      "• **ATM भागीदारी और ΔOI तुलना:** ATM Call बनाम Put वॉल्यूम की तुलना ΔOI से करें—EagleBABA इसे `CALL_FLOW_EDGE`, `PUT_FLOW_EDGE`, या `BALANCED_RANGE` के रूप में दिखाता है।",
    ].join("\n"),
  },
  {
    id: "smc-fvg-unicorn",
    patterns: [/\b(?:fvg|fair\s*value\s*gap|unicorn|smt)\b/i],
    en: "FVG (Fair Value Gap) is a 3-candle imbalance (`candle[2].low > candle[0].high` bullish or `candle[2].high < candle[0].low` bearish). ICT Unicorn combines a Breaker Block overlapping an FVG, while SMT checks divergence across correlated instruments.",
    hi: "FVG (Fair Value Gap) 3-कैंडल का प्राइस इम्बैलेंस है। ICT Unicorn सेटअप Breaker Block और FVG के ओवरलैप को देखता है, और SMT संबंधित इंडेक्स के बीच डाइवर्जेंस चेक करता है।",
  },
  {
    id: "gann-cpr-astro",
    patterns: [/\b(?:gann|cpr|chronowheel|astro)\b/i],
    en: "EagleBABA combines Gann Square of 9 price octaves, Central Pivot Range (`CPR`: `TC`, `PP`, `BC` width for trending vs reversal sessions), and ChronoWheel astronomical timing windows for structured market research.",
    hi: "EagleBABA रिसर्च के लिए Gann Square of 9 लेवल्स, Central Pivot Range (`CPR`: `TC`, `PP`, `BC`) और ChronoWheel एस्ट्रो टाइमिंग विंडो का उपयोग करता है।",
  },
  {
    id: "risk-sl",
    patterns: [/\b(?:stop\s*loss|sl\b|risk\s*management|position\s*siz|max\s*pain)\b/i],
    en: "Risk & SL Discipline: Always define `Invalidation Stop` before entry, check `slDistancePts` and `slRiskTier` (`TIGHT` / `MODERATE` / `WIDE`), respect `Max Pain (SL)`, and avoid entries when `R:R` is unfavorable (`Stop Distance > T1 Distance`) or during `09:15–09:20` settlement.",
    hi: "रिस्क और SL अनुशासन: एंट्री से पहले `Invalidation Stop` तय रखें, `slDistancePts` व `slRiskTier` (`TIGHT`/`MODERATE`/`WIDE`) जाँचें, `Max Pain (SL)` का ध्यान रखें और `09:15–09:20` ओपनिंग विंडो या खराब R:R में ट्रेड से बचें।",
  },
];

export function buildDomainFallbackAnswer(question: string, language: AssistantLanguage): string {
  const matched = DOMAIN_RULES.filter((rule) => rule.patterns.some((p) => p.test(question)));
  if (matched.length > 0) {
    const body = matched
      .slice(0, 2)
      .map((rule) => rule[language])
      .join("\n\n");
    const note =
      language === "hi"
        ? "\n\n_(EagleBABA डोमेन इंटेलिजेंस — केवल रिसर्च और शिक्षा के लिए।)_"
        : "\n\n_(EagleBABA Domain Intelligence — research & education only.)_";
    return `${body}${note}`;
  }

  return language === "hi"
    ? [
        `आपके प्रश्न **"${question.slice(0, 80)}"** के लिए रिसर्च मार्गदर्शन:`,
        "• लाइव इंट्राडे स्थिति के लिए `/options-chain` पर **OVM-9 Regime**, **PAZ (`EOS`/`EOR`) प्रेशर टैग**, और **RSB (`Invalidation Stop` + `D1 1:1`)** जाँचें।",
        "• आप मुझसे **PURE BLOOD BATH (COA #8)**, **Dual-Side Trap**, **Primary Safe Buy (Support Reversal)**, **WTT/WTB**, **RSB**, **CPR**, या **Gann** के बारे में विस्तार से पूछ सकते हैं।",
      ].join("\n")
    : [
        `Research guidance for **"${question.slice(0, 80)}"**:`,
        "• Check **OVM-9 Regime**, **PAZ (`EOS`/`EOR`) pressure tags**, and **RSB (`Invalidation Stop` + `D1 1:1`)** on `/options-chain`, alongside `CPR` & `VWAP` on `/live-chart`.",
        "• You can ask directly about **PURE BLOOD BATH (COA #8)**, **OVM-9 Dual-Side Trap**, **Primary Safe Buy (Support Reversal)**, **WTT/WTB**, **RSB**, **D1 (1:1)**, **FVG/SMT**, or intraday pressure.",
      ].join("\n");
}
