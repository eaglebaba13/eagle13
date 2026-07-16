import type { ReadinessResult } from "./production-readiness-types";

export interface BuildAuditInput {
  buildSucceeded: boolean;
  bundleServerOnlyLeaks: number;
  bundleSecretsFound: number;
  devRoutesInProduction: number;
  largeBundleAssetsKb: number;
  brokerCodeActive: boolean;
}

export function auditBuild(i: BuildAuditInput): ReadinessResult[] {
  return [
    {
      id: "build.success",
      category: "BUILD",
      title: "Production build succeeds",
      status: i.buildSucceeded ? "PASS" : "FAIL",
      severity: i.buildSucceeded ? "info" : "blocker",
      hardBlocker: !i.buildSucceeded,
    },
    {
      id: "build.server-only-leak",
      category: "BUILD",
      title: "No server-only imports in client bundle",
      status: i.bundleServerOnlyLeaks === 0 ? "PASS" : "FAIL",
      severity: i.bundleServerOnlyLeaks === 0 ? "info" : "blocker",
      hardBlocker: i.bundleServerOnlyLeaks > 0,
      detail: i.bundleServerOnlyLeaks ? `${i.bundleServerOnlyLeaks} module(s)` : undefined,
    },
    {
      id: "build.no-secrets",
      category: "BUILD",
      title: "No secret values in bundle",
      status: i.bundleSecretsFound === 0 ? "PASS" : "FAIL",
      severity: i.bundleSecretsFound === 0 ? "info" : "blocker",
      hardBlocker: i.bundleSecretsFound > 0,
    },
    {
      id: "build.dev-routes",
      category: "BUILD",
      title: "Dev routes not linked in production",
      status: i.devRoutesInProduction === 0 ? "PASS" : "WARNING",
      severity: "warning",
    },
    {
      id: "build.size",
      category: "BUILD",
      title: "Bundle size",
      status: i.largeBundleAssetsKb < 4000 ? "PASS" : "WARNING",
      severity: "info",
      evidence: [{ key: "kb", value: i.largeBundleAssetsKb }],
    },
    {
      id: "build.broker-inactive",
      category: "GOVERNANCE",
      title: "Broker/order paths inactive",
      status: i.brokerCodeActive ? "FAIL" : "PASS",
      severity: i.brokerCodeActive ? "blocker" : "info",
      hardBlocker: i.brokerCodeActive,
    },
  ];
}
