# Phase 41 · Item 2 — Option-Chain Data-Quality Diagnostics

OptionChainCapability previously surfaced BANKNIFTY warnings as the opaque
string "1 data-quality warning(s).". That masked the actual quality codes
emitted by assessDataQuality.

## Change

src/lib/option-chain/capability.ts now expands the PARTIAL branch to:

    `${n} data-quality warning(s): CODE_A, CODE_B — <first detail>`

QualityIssue.code values are already stable (INSUFFICIENT_STRIKES,
DUPLICATE_STRIKES, ZERO_OI, STALE_TIMESTAMP, FUTURE_TIMESTAMP, etc.), and
detail includes affected strikes or fields. That is now surfaced through
the capability text into RuntimeEvidence.warnings so BANKNIFTY diagnostics
answer "which check fired" instead of "how many".
