# Phase 41 · Item 4 — Decision Confidence Semantics

The Decision Engine returns four related quantities that must NOT be
conflated in the UI: netScore (signed direction), confidence (reliability),
risk (independent trade risk), and conflicts (module disagreements).

## The "0% Confidence" contradiction

confidence is seeded from Math.abs(netScore) * 100 then reduced by
penalties (missing modules, conflicts, market closed). When netScore ~ 0
and the action is WAIT, the result is ~0 — displayed as "Confidence 0%",
which reads as "engine is 100% confident it's wrong". Semantically wrong.

## Rule

In src/routes/decision.tsx, when action === "WAIT" AND round(confidence) <= 1,
the Confidence card renders "N/A" with the caption "Insufficient signals —
engine waiting". All other cases render the numeric percentage and grade
unchanged.

## Follow-up (deferred)

A future patch may replace DecisionSnapshot.confidence with a discriminated
union { kind:"score",pct } | { kind:"unavailable",reason }. Not done in
Phase 41 to keep the change surface small.
