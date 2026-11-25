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
    id: "session-log-gap",
    patterns: [
      /\bno\s*verified\s*option\s*oi\b/i,
      /\bgap\s*·\s*no\s*verified\b/i,
      /\b(?:session\s*log|oi\s*observation)\s*gap\b/i,
      /\bwhat\s*is\s*gap\s*in\s*session\b/i,
      /\bgap\s*kya\s*hai\b/i,
    ],
    en: [
      "**`GAP · No verified option OI observation`** is a data-integrity marker in EagleBABA session logs—not a market signal.",
      "• **Why it appears:** No verified Option OI snapshot was recorded for that specific timestamp interval (for example, outside live NSE market hours `09:15–15:30 IST`, during a holiday/weekend, or during a transient feed interruption).",
      "• **Design Rule:** EagleBABA never fabricates or interpolates missing OI rows; unverified intervals are transparently logged as `GAP`.",
    ].join("\n"),
    hi: [
      "**`GAP · No verified option OI observation`** सेशन लॉग में एक डेटा-इंटीग्रिटी मार्कर है—यह कोई छुपा हुआ ट्रेड सिग्नल नहीं है।",
      "• **यह क्यों दिखता है:** उस विशेष टाइम-इंटरवल के लिए कोई सत्यापित Option OI स्नैपशॉट उपलब्ध नहीं था (जैसे लाइव मार्केट समय `09:15–15:30 IST` के बाहर, छुट्टी/वीकेंड, या अस्थायी डेटा फीड गैप के कारण)।",
      "• **नियम:** EagleBABA कभी भी नकली OI डेटा नहीं बनाता; बिना वेरिफाइड डेटा वाले अंतराल को `GAP` दिखाया जाता है।",
    ].join("\n"),
  },
  {
    id: "platform-overview",
    patterns: [
      /\bwhat\s*is\s*this\b/i,
      /\beaglebaba\s*kya\s*hai\b/i,
      /\bwhat\s*is\s*eaglebaba\b/i,
      /\byeh\s*kya\s*hai\b/i,
      /\babout\s*(?:this\s*)?(?:app|platform|website|terminal)\b/i,
    ],
    en: [
      "**EagleBABA** is an institutional market-research, option-chain analytics, intraday flow, and Gann/time-cycle research terminal (for research & education only—broker order execution is strictly disabled).",
      "• **Global Workspace:** Full-width layout with a top-right **`≡` Navigation Drawer** (20+ desks) and **`A-` / `100%` / `A+`** font-size scaling saved in your browser.",
      "• **Core Pillars:** Live index/commodity/crypto quotes & `CPR`/`Safe Zones` (`/dashboard`), 60 FPS charting (`/live-chart`), COA 1.0 & Session Flow (`/options-chain`), `Unicorn & SMT Radar`, and `ChronoWheel` timing cycles.",
    ].join("\n"),
    hi: [
      "**EagleBABA** एक इंस्टीट्यूशनल मार्केट रिसर्च, ऑप्शन-चेन एनालिटिक्स, इंट्राडे फ्लो और Gann/टाइम-साइकिल रिसर्च प्लेटफ़ॉर्म है (केवल रिसर्च और शिक्षा के लिए—ब्रोकर ऑर्डर एग्जीक्यूशन पूरी तरह बंद है)।",
      "• **ग्लोबल लेआउट:** फुल-विड्थ स्क्रीन, टॉप-राइट **`≡` मेनू ड्रॉअर** (20+ डेस्क), और **`A-` / `100%` / `A+`** फॉन्ट साइज कंट्रोल।",
      "• **मुख्य मॉड्यूल:** `/dashboard` (लाइव कोट्स, `CPR`, `Safe Zones`), `/live-chart` (60 FPS चार्ट + `OC Matrix`), `/options-chain` (AI LTP / COA 1.0), `Unicorn Radar` और `ChronoWheel`।",
    ].join("\n"),
  },
  {
    id: "how-to-use-and-pages",
    patterns: [
      /\bhow\s*to\s*use\b/i,
      /\bkaise\s*use\s*kare\b/i,
      /\bkis\s*page\s*par\s*kya\s*hai\b/i,
      /\b(?:all\s*)?pages\s*(?:guide|list|overview)\b/i,
      /\bwhich\s*page\b/i,
      /\bnavigation\b/i,
    ],
    en: [
      "**How to Use EagleBABA (Page Directory via Top-Right `≡` Menu):**",
      "1. **`/dashboard`:** Start with `NIFTY 50 — LIVE`, `CPR LEVELS`, `SAFE ZONES`, `INDIA VIX`, and `Runtime Readiness`.",
      "2. **`/options-chain` (AI LTP Calculator & COA 1.0):** Check `PAZ` (`EOS`/`EOR`), `PDI` (`WTT`/`WTB`), `OVM-9` regime, `Session Flow`, and `RSB` + `D1 (1:1)` levels.",
      "3. **`/live-chart`:** View 60 FPS candles with `VWAP`, `OC Matrix`, `D1 (1:1)`, `Astro/Gann`, and `ICT Unicorn` overlays.",
      "4. **Specialized Desks:** `/options-analytics` & `/combined-pcr` (OI/PCR trends), `/unicorn-radar` & `/liquidity-heatmap` (Orderflow/FVG/SMT), `/chronowheel` & `/astro` (Time-cycles), `/fo-ban-list` (MWPL), `/backtest` & `/market-replay` (testing), `/alerts` & `/telegram-log` (alerts).",
    ].join("\n"),
    hi: [
      "**EagleBABA का उपयोग कैसे करें (टॉप-राइट `≡` मेनू के प्रमुख पेज):**",
      "1. **`/dashboard`:** `NIFTY 50 — LIVE`, `CPR LEVELS`, `SAFE ZONES`, `INDIA VIX` और `Runtime Readiness` देखें।",
      "2. **`/options-chain` (AI LTP Calculator):** `PAZ` (`EOS`/`EOR`), `PDI` (`WTT`/`WTB`), `OVM-9`, `Session Flow` और `RSB` + `D1 (1:1)` लेवल्स जाँचें।",
      "3. **`/live-chart`:** `VWAP`, `OC Matrix`, `D1 (1:1)`, `Astro/Gann` और `Unicorn` ओवरले के साथ 60 FPS चार्ट देखें।",
      "4. **अन्य डेस्क:** `/options-analytics`, `/combined-pcr`, `/unicorn-radar`, `/liquidity-heatmap`, `/chronowheel`, `/fo-ban-list`, `/backtest`, `/market-replay`, `/alerts` और `/telegram-log`।",
    ].join("\n"),
  },
  {
    id: "dashboard-guide",
    patterns: [
      /\bdashboard\s*kya\s*dikhata\s*hai\b/i,
      /\bwhat\s*does\s*dashboard\s*show\b/i,
      /\bdashboard\s*(?:cards|widgets|guide|explain)\b/i,
      /\bruntime\s*readiness\b/i,
    ],
    en: [
      "**What `/dashboard` Shows:**",
      "• **`NIFTY 50 — LIVE` (and BankNifty/Sensex/Gold tabs):** Verified spot LTP, session change, and previous working day OHLC.",
      "• **`CPR LEVELS`:** Top Central (`TC`), Pivot (`PP`), Bottom Central (`BC`), and CPR Width % (narrow CPR often precedes directional expansion; wide CPR favors range/reversal).",
      "• **`SAFE ZONES`:** Symmetric `Safe Buy (Support Rev)` and `Safe Sell (Resistance Rev)` bands around previous close; blocked automatically if data freshness fails.",
      "• **`INDIA VIX` & `Runtime Readiness`:** Volatility regime (`CALM` / `ELEVATED` / `HIGH FEAR`) plus live/degraded/blocked module health. Always confirm with structure—no single card guarantees direction.",
    ].join("\n"),
    hi: [
      "**`/dashboard` क्या दिखाता है:**",
      "• **`NIFTY 50 — LIVE`:** सत्यापित स्पॉट LTP, बदलाव और पिछले कार्यदिवस का OHLC।",
      "• **`CPR LEVELS`:** `TC`, `PP`, `BC` और CPR चौड़ाई % (संकीर्ण CPR ट्रेंडिंग मूव और चौड़ा CPR रेंज/रिवर्सल दर्शाता है)।",
      "• **`SAFE ZONES`:** सपोर्ट (`Safe Buy`) और रेजिस्टेंस (`Safe Sell`) रिवर्सल ज़ोन (डेटा पुराना होने पर सुरक्षित रूप से ब्लॉक हो जाते हैं)।",
      "• **`INDIA VIX` व `Runtime Readiness`:** वोलैटिलिटी और सिस्टम डेटा हेल्थ (`LIVE` / `DEGRADED` / `BLOCKED`)। कोई भी कार्ड गारंटीड प्रॉफिट नहीं देता।",
    ].join("\n"),
  },
  {
    id: "option-buying-logic",
    patterns: [
      /\boption\s*buying\s*kaise\b/i,
      /\bcall\s*(?:ya|or)\s*put\b/i,
      /\bentry\s*kab\s*leni\b/i,
      /\bwhen\s*to\s*(?:buy\s*)?(?:call|put|enter)\b/i,
      /\bhow\s*to\s*(?:trade|analyze)\s*options?\b/i,
    ],
    en: [
      "**Option Buying & Call vs. Put Evaluation Framework (Research & Education):**",
      "• **Concept:** Option buyers pay premium (subject to theta decay and IV crush), so directional momentum and timing matter. Calls (`CE`) align with bullish structure; Puts (`PE`) align with bearish structure.",
      "• **EagleBABA Call vs. Put Checklist (`/options-chain` + `/live-chart`):**",
      "  1. **Regime (`OVM-9`):** Look for `Momentum Surge` (`BULLISH_ONLY`) or `Cascade Breakdown` (`BEARISH_ONLY`), and avoid `Dual-Side Trap` (`WAIT`).",
      "  2. **Anchors & Flow:** Check `PAZ` (`EOS`/`EOR`), `PDI` (`WTB_TO_STRONG` / `SHIFTED_B2T` vs `WTT_TO_STRONG` / `SHIFTED_T2B`), and `Session Flow` (`PUT_FLOW_EDGE` / `CALL_FLOW_EDGE` + `ATM Volume` vs `ΔOI`).",
      "  3. **Execution & Risk:** Require `EXECUTION VALID` in `RSB`, verify `slRiskTier` (`TIGHT` / `MODERATE` / `WIDE`), respect `Invalidation Stop` / `Max Pain`, and keep `D1 (1:1)` within the `25`-pt cap.",
    ].join("\n"),
    hi: [
      "**ऑप्शन बाइंग और Call बनाम Put एंट्री लॉजिक (रिसर्च और शिक्षा के लिए):**",
      "• **मूल सिद्धांत:** ऑप्शन बायर प्रीमियम देता है (जिसमें थीटा डिके का जोखिम होता है), इसलिए स्पष्ट मोमेंटम और सही लेवल ज़रूरी हैं। तेजी में `CE` (Call) और मंदी में `PE` (Put) संरचना देखी जाती है।",
      "• **EagleBABA चेकलिस्ट (`/options-chain` + `/live-chart`):**",
      "  1. **`OVM-9` रेजीम:** `Momentum Surge` (`BULLISH_ONLY`) या `Cascade Breakdown` (`BEARISH_ONLY`) देखें; `Dual-Side Trap` में `WAIT` रखें।",
      "  2. **एंकर व फ्लो:** `PAZ` (`EOS`/`EOR`), `PDI` (`WTT`/`WTB`/शिफ्ट) और `Session Flow` (`ATM Volume` बनाम `ΔOI`) जाँचें।",
      "  3. **रिस्क और SL:** `RSB` में `EXECUTION VALID`, `Invalidation Stop` (`slRiskTier`), `Max Pain` और `D1 (1:1)` (`25`-pt कैप) का पालन करें।",
    ].join("\n"),
  },
  {
    id: "stock-analysis",
    patterns: [
      /\bstocks?\s*(?:analyse|analyze|analysis)\s*kaise\b/i,
      /\bhow\s*to\s*analyze\s*stocks?\b/i,
      /\bstock\s*selection\b/i,
      /\b4[-\s]*line\b/i,
    ],
    en: [
      "**How to Analyze Stocks on EagleBABA:**",
      "1. **Price Structure (`/live-chart`):** Check trend relative to `VWAP`, `CPR` (`TC`/`PP`/`BC`), and `Liquidity / FVG` zones.",
      "2. **F&O Option Chain (`/options-chain`):** Switch mode to **`STOCKS 4-LINE`** or **`LTP BLAST SCREENER`** to inspect support/resistance reversals and OI buildup on 200+ F&O equities.",
      "3. **Ban & Breadth Context:** Verify `/fo-ban-list` (high `MWPL` % or NSE F&O Ban restricts fresh positions) and `/market-breadth` / `/combined-pcr` for overall market tailwinds.",
    ].join("\n"),
    hi: [
      "**EagleBABA पर स्टॉक्स का विश्लेषण कैसे करें:**",
      "1. **प्राइस स्ट्रक्चर (`/live-chart`):** `VWAP`, `CPR` (`TC`/`PP`/`BC`) और `Liquidity / FVG` लेवल्स के साथ ट्रेंड देखें।",
      "2. **F&O ऑप्शन चेन (`/options-chain`):** 200+ F&O स्टॉक्स के लिए **`STOCKS 4-LINE`** या **`LTP BLAST SCREENER`** मोड में सपोर्ट/रेजिस्टेंस व OI देखें।",
      "3. **बैन और ब्रेड्थ:** `/fo-ban-list` (`MWPL` % व बैन स्टेटस) और `/market-breadth` से समग्र बाज़ार की स्थिति जाँचें।",
    ].join("\n"),
  },
  {
    id: "vwap",
    patterns: [/\bvwap\b/i, /\bvolume\s*weighted\s*average\s*price\b/i],
    en: "**VWAP (Volume Weighted Average Price)** is the intraday average price weighted by traded volume (`Σ(Price × Volume) / ΣVolume`). Institutional desks use VWAP on `/live-chart` as a dynamic fair-value benchmark: sustained price above VWAP signals buyer control, while sustained price below VWAP signals seller control.",
    hi: "**VWAP (Volume Weighted Average Price)** दिन के दौरान वॉल्यूम के आधार पर निकाला गया औसत मूल्य है (`Σ(Price × Volume) / ΣVolume`)। `/live-chart` पर कीमत VWAP से ऊपर टिकना खरीदारों की मजबूती और नीचे टिकना विक्रेताओं का दबाव दर्शाता है।",
  },
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
      "• **Confirmation & Invalidation:** Look for Put OI support stability (`STABLE_STRONG` or `WTB_TO_STRONG` / `SHIFTED_B2T`), place `Invalidation Stop` cleanly below the support band, and evaluate `slRiskTier` (`TIGHT` / `MODERATE` / `WIDE`) + `1:1` / `T1`–`T3` R:R.",
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
    id: "iv-volatility",
    patterns: [/\b(?:iv\b|implied\s*volatility|vix|india\s*vix)\b/i],
    en: "**IV (Implied Volatility) & India VIX:** IV reflects the market's expected price range priced into option premiums. In EagleBABA, `/options-chain` uses ATM IV to compute the **Weekly Range** and flags `IV EXPANSION ⚡` when IV >= 18%, while `/dashboard` tracks `INDIA VIX` regimes (`COMPLACENT`, `CALM`, `ELEVATED`, `HIGH FEAR`).",
    hi: "**IV (Implied Volatility) और India VIX:** IV बताता है कि बाज़ार में कितनी संभावित हलचल (expected range) प्रीमियम में शामिल है। `/options-chain` पर ATM IV से **Weekly Range** निकलती है और `/dashboard` पर `INDIA VIX` रिस्क रेजीम दिखता है।",
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
        `आपके प्रश्न **"${question.slice(0, 80)}"** के लिए EagleBABA रिसर्च मार्गदर्शन:`,
        "• **प्लेटफ़ॉर्म उपयोग:** `/dashboard` पर `NIFTY 50 — LIVE`, `CPR` व `Safe Zones` देखें; `/options-chain` पर `OVM-9`, `PAZ` (`EOS`/`EOR`), `Session Flow` व `RSB` जाँचें; `/live-chart` पर `VWAP` और `OC Matrix` से कन्फर्म करें।",
        "• आप सीधे **Option Buying (Call/Put)**, **Stock Analysis**, **VWAP**, **PURE BLOOD BATH (COA #8)**, **Dual-Side Trap**, **Safe Buy**, **GAP logs**, या **WTT/WTB** के बारे में पूछ सकते हैं।",
      ].join("\n")
    : [
        `EagleBABA research guidance for **"${question.slice(0, 80)}"**:`,
        "• **Workflow:** Check `/dashboard` (`CPR`, `Safe Zones`, `India VIX`), inspect `/options-chain` (`OVM-9`, `PAZ` `EOS`/`EOR`, `Session Flow`, `RSB` & `D1 1:1`), and confirm price structure with `VWAP` & `OC Matrix` on `/live-chart`.",
        "• Ask specifically about **Option Buying (Call vs Put)**, **Stock Analysis**, **VWAP**, **PURE BLOOD BATH (COA #8)**, **Dual-Side Trap**, **Primary Safe Buy**, **GAP session logs**, or **WTT/WTB**.",
      ].join("\n");
}
