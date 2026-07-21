import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ClaimReferralDialog } from "@/components/referrals/ClaimReferralDialog";
import {
  cancelReferralRequest,
  listMyReferralRequests,
} from "@/lib/referrals/referrals.functions";
import {
  REFERRAL_STATUS_LABEL,
  isTerminalReferralStatus,
  type ReferralRequestRow,
} from "@/lib/referrals/types";
import { REFERRAL_REWARD_DAYS } from "@/lib/referrals/constants";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({ meta: [{ title: "Referrals — EagleBABA" }] }),
  component: ReferralsPage,
});

function ReferralsPage() {
  const listFn = useServerFn(listMyReferralRequests);
  const cancelFn = useServerFn(cancelReferralRequest);
  const qc = useQueryClient();
  const [claimOpen, setClaimOpen] = useState(false);

  const q = useQuery({
    queryKey: ["referral-requests", "self"],
    queryFn: () => listFn(),
  });

  const cancelM = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Referral claim canceled");
      void qc.invalidateQueries({ queryKey: ["referral-requests"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Cancel failed"),
  });

  const rows = q.data ?? [];
  const hasOpen = rows.some((r) => !isTerminalReferralStatus(r.status));

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Referral rewards</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Earn {REFERRAL_REWARD_DAYS} days of Pro for each approved
              INDmoney referral.
            </p>
          </div>
          <button
            type="button"
            disabled={hasOpen}
            onClick={() => setClaimOpen(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            title={hasOpen ? "You already have an open claim" : undefined}
          >
            {hasOpen ? "Claim submitted" : "Claim referral bonus"}
          </button>
        </header>

        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold">Your referral history</h2>
          </div>
          {q.isLoading ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              No referral claims yet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <RowItem
                  key={r.id}
                  row={r}
                  onCancel={() => cancelM.mutate(r.id)}
                  canceling={cancelM.isPending}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {claimOpen ? <ClaimReferralDialog onClose={() => setClaimOpen(false)} /> : null}
    </div>
  );
}

function RowItem({
  row,
  onCancel,
  canceling,
}: {
  row: ReferralRequestRow;
  onCancel: () => void;
  canceling: boolean;
}) {
  const submitted = new Date(row.submitted_at).toLocaleString();
  const cancelable = !isTerminalReferralStatus(row.status);
  return (
    <li className="flex items-start justify-between gap-4 px-6 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{row.broker}</span>
          <span className="text-xs text-muted-foreground">
            · Client {row.broker_client_id_masked}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Submitted {submitted}
        </div>
        {row.rejection_reason ? (
          <div className="mt-1 text-xs text-red-500">
            Rejected: {row.rejection_reason}
          </div>
        ) : null}
        {row.admin_note && row.status === "APPROVED" ? (
          <div className="mt-1 text-xs text-emerald-500">
            {row.admin_note}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          {REFERRAL_STATUS_LABEL[row.status]}
        </span>
        {cancelable ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={canceling}
            className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-60"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </li>
  );
}