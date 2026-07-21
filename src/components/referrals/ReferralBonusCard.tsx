import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";
import {
  INDMONEY_REFERRAL_CODE,
  INDMONEY_REFERRAL_URL,
  REFERRAL_REWARD_DAYS,
  copyToClipboard,
} from "@/lib/referrals/constants";
import { listMyReferralRequests } from "@/lib/referrals/referrals.functions";
import {
  REFERRAL_STATUS_LABEL,
  isTerminalReferralStatus,
  type ReferralRequestRow,
} from "@/lib/referrals/types";

function StatusPill({ row }: { row: ReferralRequestRow }) {
  const tone =
    row.status === "APPROVED"
      ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
      : row.status === "REJECTED"
      ? "bg-red-500/15 text-red-500 border-red-500/30"
      : row.status === "PENDING" || row.status === "UNDER_REVIEW"
      ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
      : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone}`}
    >
      {REFERRAL_STATUS_LABEL[row.status]}
    </span>
  );
}

/**
 * Phase 43 — Referral Bonus card. Shown on the profile page.
 * Client-side only: reads the user's referral history via a server fn.
 */
export function ReferralBonusCard() {
  const listFn = useServerFn(listMyReferralRequests);
  const q = useQuery({
    queryKey: ["referral-requests", "self"],
    queryFn: () => listFn(),
  });
  const [copied, setCopied] = useState(false);

  const latest: ReferralRequestRow | undefined = q.data?.[0];
  const hasOpenClaim = latest && !isTerminalReferralStatus(latest.status);

  async function copyCode() {
    const ok = await copyToClipboard(INDMONEY_REFERRAL_CODE);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Referral code copied");
    } else {
      toast.error("Could not copy. Please copy manually.");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            Earn {REFERRAL_REWARD_DAYS} days of Pro — free
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Open a free INDmoney account with our referral, complete the
            required trade, then submit the claim below. Approved claims add{" "}
            {REFERRAL_REWARD_DAYS} days of Pro to your subscription.
          </p>
        </div>
        {latest ? <StatusPill row={latest} /> : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <a
          href={INDMONEY_REFERRAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <ExternalLink size={14} />
          Open INDmoney account
        </a>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-muted/40 px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <Copy size={14} />
          {copied ? "Copied" : `Copy code · ${INDMONEY_REFERRAL_CODE}`}
        </button>
      </div>

      <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        <p>
          <strong className="text-foreground">Steps:</strong> (1) open the
          account using this referral code, (2) complete the required trade,
          (3) submit your claim with a screenshot of the confirmed trade.
          Reviews are manual and usually complete within 24 hours.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/referrals"
          className="text-xs font-medium text-primary hover:underline"
        >
          View referral history →
        </Link>
        <Link
          to="/referrals"
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
          aria-disabled={hasOpenClaim ? true : undefined}
        >
          {hasOpenClaim ? "Claim submitted" : "Claim referral bonus"}
        </Link>
      </div>
    </section>
  );
}