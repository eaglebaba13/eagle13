import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  adminApproveManualPayment,
  adminListManualPayments,
  adminMarkManualPaymentUnderReview,
  adminRejectManualPayment,
  adminSignScreenshotUrl,
} from "@/lib/manual-payment.functions";
import {
  MANUAL_PAYMENT_STATUSES,
  statusTone,
  type ManualPaymentRequest,
  type ManualPaymentStatus,
} from "@/lib/manual-payment";
import { formatRupees } from "@/lib/manual-payment-config";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  head: () => ({ meta: [{ title: "Admin · Payments — EagleBABA" }] }),
  component: AdminPaymentsPage,
});

function AdminPaymentsPage() {
  const { role } = useAuth();
  const list = useServerFn(adminListManualPayments);
  const approve = useServerFn(adminApproveManualPayment);
  const reject = useServerFn(adminRejectManualPayment);
  const review = useServerFn(adminMarkManualPaymentUnderReview);
  const signUrl = useServerFn(adminSignScreenshotUrl);

  const [rows, setRows] = useState<ManualPaymentRequest[]>([]);
  const [dupUtrs, setDupUtrs] = useState<string[]>([]);
  const [filter, setFilter] = useState<ManualPaymentStatus | "ALL">("SUBMITTED");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = async () => {
    setErr(null);
    try {
      const res = await list({ data: filter === "ALL" ? {} : { status: filter } });
      setRows(res.rows);
      setDupUtrs(res.duplicateUtrs);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    if (role !== "admin") return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, filter]);

  if (role !== "admin") {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-2xl rounded-xl border border-red-500/40 bg-red-500/[0.06] p-6 text-sm text-red-300">
          Admin access required.
        </div>
      </div>
    );
  }

  const doAction = async (id: string, fn: () => Promise<unknown>, note: string) => {
    setBusy(id);
    setMsg(null);
    setErr(null);
    try {
      await fn();
      setMsg(note);
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const openProof = async (path: string | null) => {
    if (!path) return;
    try {
      const { url } = await signUrl({ data: { path } });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const exportCsv = () => {
    const header = [
      "user_id",
      "reference",
      "plan",
      "cycle",
      "expected_amount_paise",
      "amount_paid_paise",
      "currency",
      "utr",
      "status",
      "submitted_at",
      "verified_at",
    ];
    const lines = [header.join(",")].concat(
      rows.map((r) =>
        [
          r.userId,
          r.paymentReference,
          r.requestedPlan,
          r.billingCycle,
          r.expectedAmount,
          r.amountPaid ?? "",
          r.currency,
          r.utrNumber ?? "",
          r.status,
          r.submittedAt ?? "",
          r.verifiedAt ?? "",
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `manual-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Payments · Admin Review</h1>
            <p className="text-sm text-muted-foreground">
              Verify UPI payments and activate subscriptions. Each approval is audit-logged.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as ManualPaymentStatus | "ALL")}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm"
            >
              <option value="ALL">All</option>
              {MANUAL_PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={reload}
              className="rounded-md border border-white/10 px-3 py-1 text-sm hover:bg-white/5"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-md border border-white/10 px-3 py-1 text-sm hover:bg-white/5"
            >
              Export CSV
            </button>
          </div>
        </header>

        {msg && (
          <div className="rounded-md bg-emerald-500/10 text-emerald-300 text-xs px-3 py-2">{msg}</div>
        )}
        {err && (
          <div className="rounded-md bg-red-500/10 text-red-300 text-xs px-3 py-2">Error: {err}</div>
        )}

        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-muted-foreground">
              No payment requests match this filter.
            </div>
          ) : (
            rows.map((r) => (
              <AdminRow
                key={r.id}
                r={r}
                dup={r.utrNumber ? dupUtrs.includes(r.utrNumber) : false}
                busy={busy === r.id}
                onReview={() =>
                  doAction(r.id, () => review({ data: { id: r.id } }), "Marked under review.")
                }
                onApprove={(adminNote) =>
                  doAction(
                    r.id,
                    () => approve({ data: { id: r.id, adminNote } }),
                    "Approved. Subscription activated.",
                  )
                }
                onReject={(reason) =>
                  doAction(
                    r.id,
                    () => reject({ data: { id: r.id, reason } }),
                    "Rejected.",
                  )
                }
                onOpenProof={() => openProof(r.screenshotUrl)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface AdminRowProps {
  r: ManualPaymentRequest;
  dup: boolean;
  busy: boolean;
  onReview: () => void;
  onApprove: (note: string) => void;
  onReject: (reason: string) => void;
  onOpenProof: () => void;
}

function AdminRow({ r, dup, busy, onReview, onApprove, onReject, onOpenProof }: AdminRowProps) {
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const tone = statusTone(r.status);
  const amountMismatch = useMemo(
    () => r.amountPaid !== null && r.amountPaid !== r.expectedAmount,
    [r],
  );
  const canReview = r.status === "SUBMITTED";
  const canDecide = r.status === "SUBMITTED" || r.status === "UNDER_REVIEW";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 grid gap-3 md:grid-cols-[1fr,auto]">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs">{r.paymentReference}</span>
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.className}`}
          >
            {tone.label}
          </span>
          {dup && (
            <span className="inline-flex rounded-full border border-red-400/40 bg-red-500/10 text-red-300 px-2 py-0.5 text-[10px] uppercase">
              Duplicate UTR
            </span>
          )}
          {amountMismatch && (
            <span className="inline-flex rounded-full border border-amber-400/40 bg-amber-500/10 text-amber-300 px-2 py-0.5 text-[10px] uppercase">
              Amount mismatch
            </span>
          )}
        </div>
        <div className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
          <span>
            User: <span className="font-mono text-foreground">{r.userId}</span>
          </span>
          <span>
            Plan:{" "}
            <span className="capitalize text-foreground">
              {r.requestedPlan} · {r.billingCycle}
            </span>
          </span>
          <span>
            Expected: <span className="text-foreground">{formatRupees(r.expectedAmount)}</span>
          </span>
          <span>
            Paid:{" "}
            <span className={amountMismatch ? "text-amber-300" : "text-foreground"}>
              {r.amountPaid !== null ? formatRupees(r.amountPaid) : "—"}
            </span>
          </span>
          <span>
            UTR: <span className="font-mono text-foreground">{r.utrNumber ?? "—"}</span>
          </span>
          <span>App: {r.paymentApp ?? "—"}</span>
          <span>Submitted: {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "—"}</span>
          <span>Payment date: {r.paymentDate ? new Date(r.paymentDate).toLocaleString() : "—"}</span>
        </div>
        {r.userNote && (
          <p className="mt-2 text-xs text-muted-foreground">Note: {r.userNote}</p>
        )}
        {r.screenshotUrl && (
          <button
            type="button"
            onClick={onOpenProof}
            className="mt-2 text-xs text-amber-300 underline"
          >
            View proof
          </button>
        )}
      </div>
      <div className="space-y-2 md:min-w-[260px]">
        {canDecide ? (
          <>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Admin note (optional)"
              className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs"
            />
            <div className="flex gap-2 flex-wrap">
              {canReview && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onReview}
                  className="rounded-md border border-white/15 px-3 py-1 text-xs hover:bg-white/5 disabled:opacity-50"
                >
                  Under review
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => onApprove(note)}
                className="rounded-md bg-emerald-500/80 px-3 py-1 text-xs font-medium text-slate-900 disabled:opacity-50"
              >
                Approve
              </button>
            </div>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Rejection reason (required to reject)"
              className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs"
            />
            <button
              type="button"
              disabled={busy || reason.trim().length < 3}
              onClick={() => onReject(reason)}
              className="w-full rounded-md border border-red-500/40 text-red-300 px-3 py-1 text-xs hover:bg-red-500/10 disabled:opacity-50"
            >
              Reject
            </button>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">
            {r.status === "APPROVED"
              ? `Verified ${r.verifiedAt ? new Date(r.verifiedAt).toLocaleString() : ""}`
              : r.rejectionReason
                ? `Reason: ${r.rejectionReason}`
                : "No actions available."}
          </div>
        )}
      </div>
    </div>
  );
}
