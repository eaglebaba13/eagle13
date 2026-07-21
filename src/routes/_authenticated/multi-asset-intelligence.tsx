import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import {
  getLatestMorningReport,
  retryMorningBriefDelivery,
  morningBriefDisclaimer,
} from "@/lib/multi-asset/report.functions";
import { MORNING_REPORT_VERSION } from "@/lib/multi-asset/report-composer";

export const Route = createFileRoute("/_authenticated/multi-asset-intelligence")({
  head: () => ({
    meta: [
      { title: "Multi-Asset Intelligence · EagleBABA" },
      { name: "description", content: "Daily multi-asset intelligence brief with pivot levels, Gann, Astro, macro ratio and morning Telegram delivery status." },
    ],
  }),
  component: MultiAssetIntelligencePage,
});

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "SENT") return "default";
  if (s === "FAILED") return "destructive";
  return "secondary";
}

function MultiAssetIntelligencePage() {
  const fetchLatest = useServerFn(getLatestMorningReport);
  const retry = useServerFn(retryMorningBriefDelivery);
  const router = useRouter();

  const q = useQuery({
    queryKey: ["morning-brief", "latest"],
    queryFn: () => fetchLatest(),
    staleTime: 30_000,
  });

  const retryMut = useMutation({
    mutationFn: () => retry(),
    onSuccess: () => q.refetch(),
  });

  const record = q.data;
  const payload = record?.payload;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Multi-Asset Intelligence</h1>
        <p className="text-sm text-muted-foreground">
          Scheduled 08:15 Asia/Kolkata · Version <code>{MORNING_REPORT_VERSION}</code>
        </p>
      </header>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <CardTitle>Latest Morning Brief</CardTitle>
          <div className="flex items-center gap-2">
            {record ? (
              <Badge variant={statusVariant(record.deliveryStatus)}>
                {record.deliveryStatus} · {record.deliveryAttempts} attempts
              </Badge>
            ) : (
              <Badge variant="secondary">No report yet</Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={retryMut.isPending}
              onClick={() => retryMut.mutate()}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Retry delivery
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {q.isLoading && <p className="text-muted-foreground">Loading latest report…</p>}
          {q.isError && (
            <p className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Unable to load latest report.
              <button className="underline" onClick={() => router.invalidate()}>Retry</button>
            </p>
          )}
          {record && payload && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">Report</p>
                <p><code>{payload.reportId}</code></p>
                <p className="text-muted-foreground text-xs mt-2">Data quality</p>
                <p><Badge variant="outline">{record.dataQuality}</Badge></p>
                <p className="text-muted-foreground text-xs mt-2">Generated</p>
                <p>{new Date(payload.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">Macro ratio</p>
                <p>
                  Ratio: <strong>{payload.ratio.ratio ?? "UNAVAILABLE"}</strong>
                  {" · "}Bias: <Badge>{payload.ratio.macroBias}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  Configured thresholds: {payload.ratio.lowerThreshold} / {payload.ratio.upperThreshold}
                </p>
                <p className="text-muted-foreground text-xs mt-2">Telegram delivery</p>
                <p>
                  Status: <strong>{record.deliveryStatus}</strong>
                  {record.deliveryError ? ` · ${record.deliveryError}` : ""}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Coverage matrix</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>NIFTY / BANKNIFTY</strong>: Pivot · Gann · Astro (validated).</p>
          <p><strong>XAUUSD / XAGUSD</strong>: Pivot · macro ratio. Gann & Astro coverage: UNAVAILABLE in this release.</p>
          <p><strong>BTC / ETH (24×7)</strong>: Pivot only. Gann & Astro coverage: UNAVAILABLE.</p>
          <p><strong>GOLD / SILVER (spot)</strong>: Reserved for future physical-metal provider wiring.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Disclaimer</CardTitle></CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{morningBriefDisclaimer()}</pre>
        </CardContent>
      </Card>
    </div>
  );
}