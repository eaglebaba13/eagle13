import type { StagingCheck } from "./staging-validation-types";
import { SECRET_LIKE_PATTERN } from "../production-readiness-types";

export interface BundleAuditInput {
  mainBundleKb: number;
  routeChunksKb: Record<string, number>;
  largestModulesKb: Record<string, number>;
  duplicateDeps: readonly string[];
  chartLibCount: number;
  fixtureInclusion: readonly string[];
  sourceMapPolicy: "off_in_prod" | "on_in_prod" | "unknown";
  mediaAssets: readonly string[];
  nativeBinaries: readonly string[];
  serverOnlyModulesInClient: readonly string[];
  clientBundleSample: string;
}

const LARGE_MEDIA_EXT = /\.(mp4|mov|webm|mp3|wav|zip|node)$/i;

export function auditBundle(input: BundleAuditInput): StagingCheck[] {
  const checks: StagingCheck[] = [];
  const hardIssues: string[] = [];
  SECRET_LIKE_PATTERN.lastIndex = 0;
  const hasSecret = SECRET_LIKE_PATTERN.test(input.clientBundleSample);
  SECRET_LIKE_PATTERN.lastIndex = 0;
  if (hasSecret) hardIssues.push("secret_in_bundle");
  if (input.serverOnlyModulesInClient.length > 0) hardIssues.push("server_only_module_leaked");
  if (input.nativeBinaries.length > 0) hardIssues.push("native_binary_in_bundle");
  if (input.mediaAssets.some((m) => LARGE_MEDIA_EXT.test(m))) hardIssues.push("large_media_bundled");
  if (hardIssues.length > 0) {
    checks.push({
      id: "bundle.secret_or_leak",
      category: "BUILD",
      title: "Bundle audit hard blockers",
      status: "FAIL",
      severity: "blocker",
      detail: hardIssues.join(","),
      hardBlocker: true,
    });
  }
  if (input.duplicateDeps.length > 0) {
    checks.push({
      id: "bundle.duplicates",
      category: "BUILD",
      title: "Duplicate dependencies in bundle",
      status: "WARNING",
      severity: "warning",
      detail: input.duplicateDeps.join(","),
    });
  }
  if (input.chartLibCount > 1) {
    checks.push({
      id: "bundle.multiple_chart_libs",
      category: "BUILD",
      title: "Multiple chart libraries bundled",
      status: "WARNING",
      severity: "warning",
      detail: `${input.chartLibCount} chart libraries detected`,
    });
  }
  if (input.sourceMapPolicy === "on_in_prod") {
    checks.push({
      id: "bundle.sourcemap_on_prod",
      category: "BUILD",
      title: "Source maps enabled in production",
      status: "WARNING",
      severity: "warning",
    });
  }
  checks.push({
    id: "bundle.size",
    category: "BUILD",
    title: "Main bundle size",
    status: input.mainBundleKb > 1500 ? "WARNING" : "PASS",
    severity: input.mainBundleKb > 1500 ? "warning" : "info",
    detail: `${input.mainBundleKb}KB main`,
  });
  return checks;
}