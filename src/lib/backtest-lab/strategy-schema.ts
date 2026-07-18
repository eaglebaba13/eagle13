// Phase 3G — Strategy schema validator.
// Rejects unknown families/operators, unbounded nesting, missing dataset
// identity, and formula mutation. Deterministic; no eval.

import type {
  ConditionGroup,
  ConditionLeaf,
  ConditionNode,
  SignalFamily,
  ComparisonOperator,
  LogicalOperator,
  StrategyDefinition,
} from "./types";

export class StrategyValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "StrategyValidationError";
  }
}

const FAMILIES: ReadonlySet<SignalFamily> = new Set([
  "DECISION", "GTI", "PCR", "BREADTH", "GANN_GAP",
  "ASTRO", "SMART_ALERT", "INSTITUTIONAL_FLOW", "OPTION_STRATEGY", "RESEARCH_LAB",
]);

const OPS: ReadonlySet<ComparisonOperator> = new Set([
  "EQUALS", "NOT_EQUALS", "GREATER_THAN", "LESS_THAN",
  "GREATER_OR_EQUAL", "LESS_OR_EQUAL", "IN", "NOT_IN", "EXISTS",
]);

const LOGICAL: ReadonlySet<LogicalOperator> = new Set(["AND", "OR", "NOT"]);

export const MAX_NESTING_DEPTH = 5;
export const MAX_UNIVERSE_SIZE = 25;
export const MAX_DATE_RANGE_DAYS = 365 * 20;

export function validateConditionNode(
  node: ConditionNode,
  depth = 0,
): void {
  if (depth > MAX_NESTING_DEPTH) {
    throw new StrategyValidationError("NESTING_TOO_DEEP", `Nesting exceeds ${MAX_NESTING_DEPTH}`);
  }
  if (node.kind === "LEAF") return validateLeaf(node);
  if (node.kind === "GROUP") {
    if (!LOGICAL.has(node.operator)) {
      throw new StrategyValidationError("BAD_LOGICAL", `Unknown logical operator: ${String(node.operator)}`);
    }
    if (node.operator === "NOT" && node.children.length !== 1) {
      throw new StrategyValidationError("BAD_NOT_ARITY", "NOT requires exactly one child");
    }
    if (node.children.length === 0) {
      throw new StrategyValidationError("EMPTY_GROUP", "Condition groups must have at least one child");
    }
    for (const c of node.children) validateConditionNode(c, depth + 1);
    return;
  }
  throw new StrategyValidationError("BAD_NODE_KIND", "Unknown node kind");
}

function validateLeaf(leaf: ConditionLeaf): void {
  if (!FAMILIES.has(leaf.family)) {
    throw new StrategyValidationError("UNSUPPORTED_FAMILY", `Unsupported signal family: ${leaf.family}`);
  }
  if (!OPS.has(leaf.operator)) {
    throw new StrategyValidationError("UNSUPPORTED_OPERATOR", `Unsupported operator: ${leaf.operator}`);
  }
  if (!/^[A-Za-z0-9_.]+$/.test(leaf.field)) {
    throw new StrategyValidationError("BAD_FIELD", `Invalid field identifier: ${leaf.field}`);
  }
  if (leaf.operator === "IN" || leaf.operator === "NOT_IN") {
    if (!Array.isArray(leaf.value)) {
      throw new StrategyValidationError("BAD_IN_VALUE", "IN / NOT_IN require an array value");
    }
  }
  if (leaf.operator === "EXISTS" && leaf.value !== undefined && leaf.value !== null) {
    throw new StrategyValidationError("BAD_EXISTS_VALUE", "EXISTS takes no value");
  }
}

export function validateStrategyDefinition(def: StrategyDefinition): void {
  if (def.schemaVersion !== 1) {
    throw new StrategyValidationError("BAD_SCHEMA_VERSION", "Unsupported schema version");
  }
  if (!def.strategyId || !def.name) {
    throw new StrategyValidationError("MISSING_IDENTITY", "strategyId and name required");
  }
  if (def.researchOnly !== true) {
    throw new StrategyValidationError("NOT_RESEARCH_ONLY", "researchOnly must be true");
  }
  if (!def.datasetId || !def.datasetHash) {
    throw new StrategyValidationError("MISSING_DATASET", "datasetId + datasetHash required");
  }
  if (!Number.isFinite(def.capital) || def.capital <= 0) {
    throw new StrategyValidationError("BAD_CAPITAL", "capital must be > 0");
  }
  if (!def.universe || def.universe.length === 0) {
    throw new StrategyValidationError("EMPTY_UNIVERSE", "universe must be non-empty");
  }
  if (def.universe.length > MAX_UNIVERSE_SIZE) {
    throw new StrategyValidationError("UNIVERSE_TOO_LARGE", "Universe exceeds bound");
  }
  const fromTs = Date.parse(def.from);
  const toTs = Date.parse(def.to);
  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs < fromTs) {
    throw new StrategyValidationError("BAD_DATE_RANGE", "invalid date range");
  }
  const days = (toTs - fromTs) / 86_400_000;
  if (days > MAX_DATE_RANGE_DAYS) {
    throw new StrategyValidationError("DATE_RANGE_TOO_LARGE", "date range too wide");
  }
  validateConditionNode(def.conditions);
  if (def.sizing.method === "FRACTIONAL_KELLY") {
    const k = def.sizing.kellyFraction ?? 0;
    if (!(k > 0 && k <= 0.5)) {
      throw new StrategyValidationError("BAD_KELLY", "Kelly fraction must be in (0, 0.5]");
    }
  }
}

// FNV-1a 32-bit — stable strategy hash for cache/dedup keys.
export function computeStrategyHash(def: StrategyDefinition): string {
  const canonical = JSON.stringify({
    v: def.schemaVersion,
    n: def.name,
    u: def.universe,
    a: def.assetClass,
    tf: def.timeframe,
    ds: def.datasetHash,
    fr: def.from,
    to: def.to,
    c: def.conditions,
    d: def.direction,
    e: def.entry,
    x: def.exit,
    s: def.sizing,
    cap: def.capital,
    r: def.risk,
    co: def.costs,
    sl: def.slippage,
    fv: def.formulaVersions,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}