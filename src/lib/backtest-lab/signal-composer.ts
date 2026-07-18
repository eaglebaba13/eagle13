// Phase 3G — Pure canonical signal condition evaluator.
// No eval, no user code, no formula mutation. Returns MATCH / SKIP /
// INELIGIBLE so missing inputs never fabricate a positive.

import type {
  ConditionGroup,
  ConditionLeaf,
  ConditionNode,
  SignalValue,
} from "./types";
import { resolveField } from "./types";

export type EvalResult = "MATCH" | "NO_MATCH" | "INELIGIBLE";

function compareLeaf(
  actual: SignalValue | undefined,
  leaf: ConditionLeaf,
): EvalResult {
  if (leaf.operator === "EXISTS") {
    return actual === undefined || actual === null ? "NO_MATCH" : "MATCH";
  }
  if (actual === undefined || actual === null) return "INELIGIBLE";

  switch (leaf.operator) {
    case "EQUALS":
      return actual === leaf.value ? "MATCH" : "NO_MATCH";
    case "NOT_EQUALS":
      return actual !== leaf.value ? "MATCH" : "NO_MATCH";
    case "GREATER_THAN":
      return typeof actual === "number" && typeof leaf.value === "number" && actual > leaf.value
        ? "MATCH" : "NO_MATCH";
    case "LESS_THAN":
      return typeof actual === "number" && typeof leaf.value === "number" && actual < leaf.value
        ? "MATCH" : "NO_MATCH";
    case "GREATER_OR_EQUAL":
      return typeof actual === "number" && typeof leaf.value === "number" && actual >= leaf.value
        ? "MATCH" : "NO_MATCH";
    case "LESS_OR_EQUAL":
      return typeof actual === "number" && typeof leaf.value === "number" && actual <= leaf.value
        ? "MATCH" : "NO_MATCH";
    case "IN":
      return Array.isArray(leaf.value) && leaf.value.includes(actual as SignalValue)
        ? "MATCH" : "NO_MATCH";
    case "NOT_IN":
      return Array.isArray(leaf.value) && !leaf.value.includes(actual as SignalValue)
        ? "MATCH" : "NO_MATCH";
  }
}

export function evaluateNode(
  node: ConditionNode,
  snapshot: Readonly<Record<string, SignalValue>> | null | undefined,
): EvalResult {
  if (node.kind === "LEAF") {
    const actual = resolveField(snapshot, node.family, node.field);
    return compareLeaf(actual, node);
  }
  return evaluateGroup(node, snapshot);
}

function evaluateGroup(
  group: ConditionGroup,
  snapshot: Readonly<Record<string, SignalValue>> | null | undefined,
): EvalResult {
  if (group.operator === "NOT") {
    const r = evaluateNode(group.children[0], snapshot);
    if (r === "INELIGIBLE") return "INELIGIBLE";
    return r === "MATCH" ? "NO_MATCH" : "MATCH";
  }
  let ineligible = false;
  if (group.operator === "AND") {
    for (const c of group.children) {
      const r = evaluateNode(c, snapshot);
      if (r === "INELIGIBLE") return "INELIGIBLE";
      if (r === "NO_MATCH") return "NO_MATCH";
    }
    return "MATCH";
  }
  // OR
  for (const c of group.children) {
    const r = evaluateNode(c, snapshot);
    if (r === "MATCH") return "MATCH";
    if (r === "INELIGIBLE") ineligible = true;
  }
  return ineligible ? "INELIGIBLE" : "NO_MATCH";
}