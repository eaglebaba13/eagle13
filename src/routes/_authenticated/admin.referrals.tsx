import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  adminApproveReferral,
  adminMarkReferralUnderReview,
  adminRejectReferral,
  listAdminReferralRequests,
} from "@/lib/referrals/referrals.functions";
import {
  REFERRAL_STATUS_LABEL,
  type ReferralRequestRow,
  type ReferralStatus,
} from "@/lib/referrals/types";

export const Route = createFileRoute("/_authenticated/admin/referrals")({
  head: () => ({ meta: [{ title: "Admin · Referrals — EagleBABA" }] }),
  component: AdminReferralsPage,
});

const FILTERS: readonly { id: ReferralStatus | "ALL"; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "PENDING", label: "Pending" },
  { id: "UNDER_REVIEW", label: "Under review" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
  { id: "EXPIRED", label: "Expired" },
  { id: "CANCELED", label: "Canceled" },
];

function AdminReferralsPage() {
  const { role } = useAuth();
  const listFn = useServerFn(listAdminReferralRequests);
  const reviewFn = useServerFn(adminMarkReferralUnderReview);
  const approveFn = useServerFn(adminApproveReferral);
  const rejectFn = useServerFn(adminRejectReferral);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ReferralStatus | "ALL">("PENDING");

  const isAdmin = role === "admin";

  const q = useQuery({
    queryKey: ["admin", "referral-requests"],
    queryFn: () => listFn(),
    enabled: isAdmin,
  });

  const rows = useMemo(() => {
    const all = q.data ?? [];
    if (filter === "ALL") return all;
    return all.filter((r) => r.status === filter);
  }, [q.data, filter]);

  const reviewM = useMutation({
    mutationFn: (id: string) => reviewFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "referral-requests"] }),
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Update failed"),
  });
  const approveM = useMutation({
    mutationFn: (v: { id: string; note: string }) =>
      approveFn({ data: { id: v.id, adminNote: v.note || null } }),
    onSuccess: () => {
      toast.success("Referral approved · 7 days Pro granted");
      void qc.invalidateQueries({ queryKey: ["admin", "referral-requests"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Approve failed"),
  });
  const rejectM = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      rejectFn({ data: { id: v.id, reason: v.reason } }),
    onSuccess: () => {
      toast.success("Referral rejected");
      void qc.invalidateQueries({ queryKey: ["admin", "referral-requests"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Reject failed"),
  });

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">Admin access required</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This page is restricted to administrators.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Referral requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review INDmoney referral claims. Approving a claim grants 7 days
            of Pro to the user and writes to the audit log.
          </p>
        </header>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                filter === f.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <section className="rounded-xl border border-border bg-card">
          {q.isLoading ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              No referral claims for this filter.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <AdminRow
                  key={r.id}
                  row={r}
                  onReview={() => reviewM.mutate(r.id)}
                  onApprove={(note) => approveM.mutate({ id: r.id, note })}
                  onReject={(reason) => rejectM.mutate({ id: r.id, reason })}
                  busy={reviewM.isPending || approveM.isPending || rejectM.isPending}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function AdminRow({
  row,
  onReview,
  onApprove,
  onReject,
  busy,
}: {
  row: ReferralRequestRow;
  onReview: () => void;
  onApprove: (note: string) => void;
  onReject: (reason: string) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const submitted = new Date(row.submitted_at).toLocaleString();

  return (
    <li className="grid grid-cols-1 gap-3 px-6 py-4 md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{row.broker}</span> ·{" "}
          Client <span className="font-mono">{row.broker_client_id_masked}</span> ·{" "}
          Code <span className="font-mono">{row.referral_code}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          User <span className="font-mono">{row.user_id.slice(0, 8)}…</span> ·
          Submitted {submitted} · Status{" "}
          <span className="font-medium text-foreground">
            {REFERRAL_STATUS_LABEL[row.status]}
          </span>
        </div>
        {row.screenshot_url ? (
          <div className="mt-1 text-[11px] text-muted-foreground">
            Screenshot path: <span className="font-mono">{row.screenshot_url}</span>
          </div>
        ) : (
          <div className="mt-1 text-[11px] text-amber-500">No screenshot attached</div>
        )}
        {row.user_note ? (
          <div className="mt-1 text-xs">Note: {row.user_note}</div>
        ) : null}
        {row.rejection_reason ? (
          <div className="mt-1 text-xs text-red-500">
            Rejected: {row.rejection_reason}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col items-stretch gap-2 md:items-end">
        {row.status === "PENDING" || row.status === "UNDER_REVIEW" ? (
          <>
            {row.status === "PENDING" ? (
              <button
                type="button"
                onClick={onReview}
                disabled={busy}
                className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
              >
                Mark under review
              </button>
            ) : null}

            {!rejecting ? (
              <div className="flex flex-col gap-1 md:min-w-[280px]">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Admin note (optional)"
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onApprove(note)}
                    disabled={busy}
                    className="flex-1 rounded-md bg-emerald-500 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500/90 disabled:opacity-60"
                  >
                    Approve · +7 days Pro
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejecting(true)}
                    className="rounded-md border border-red-500/50 px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1 md:min-w-[280px]">
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Rejection reason (required)"
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onReject(reason)}
                    disabled={busy || reason.trim().length < 3}
                    className="flex-1 rounded-md bg-red-500 px-3 py-1 text-xs font-medium text-white hover:bg-red-500/90 disabled:opacity-60"
                  >
                    Confirm reject
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejecting(false);
                      setReason("");
                    }}
                    className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </li>
  );
}