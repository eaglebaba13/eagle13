import { createFileRoute, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useEntitlements } from "@/lib/use-entitlements";
import {
  buildUpiUri,
  isRequestActive,
  qrImageUrlFor,
  statusTone,
  validateUtr,
  type ManualPaymentRequest,
} from "@/lib/manual-payment";
import {
  cancelManualPaymentRequest,
  createManualPaymentRequest,
  getManualPaymentEnvelope,
  listMyManualPayments,
  submitManualPaymentUtr,
} from "@/lib/manual-payment.functions";
import { formatRupees } from "@/lib/manual-payment-config";

const searchSchema = z.object({
  plan: z.enum(["pro", "professional"]).optional(),
  cycle: z.enum(["monthly", "annual"]).optional(),
});

export const Route = createFileRoute("/_authenticated/payment-status")({
  head: () => ({
    meta: [
      { title: "Payment Status — EagleBABA" },
      {
        name: "description",
        content:
          "Scan the UPI QR, submit your transaction reference, and track your EagleBABA subscription activation.",
      },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  component: PaymentStatusPage,
});

function PaymentStatusPage() {
  const { user } = useAuth();
  const { refresh: refreshEnt } = useEntitlements();
  const search = useSearch({ from: "/_authenticated/payment-status" });

  const list = useServerFn(listMyManualPayments);
  const create = useServerFn(createManualPaymentRequest);
  const cancel = useServerFn(cancelManualPaymentRequest);
  const submit = useServerFn(submitManualPaymentUtr);
  const envelope = useServerFn(getManualPaymentEnvelope);

  const [rows, setRows] = useState<ManualPaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = async () => {
    try {
      const data = await list();
      setRows(data);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const active = rows.find((r) => isRequestActive(r.status));

  const startNew = async () => {
    if (!search.plan || !search.cycle) return;
    setCreating(true);
    setErr(null);
    try {
      await create({ data: { plan: search.plan, cycle: search.cycle } });
      setMsg("Payment request created. Please scan the QR and pay the exact amount.");
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const cancelReq = async (id: string) => {
    try {
      await cancel({ data: { id } });
      await reload();
      setMsg("Payment request canceled.");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Payment Status</h1>
          <p className="text-sm text-muted-foreground">
            Pay via UPI QR, submit your UTR, and we&apos;ll activate your plan after manual
            verification.
          </p>
        </header>

        {msg && (
          <div className="rounded-md bg-emerald-500/10 text-emerald-300 text-xs px-3 py-2">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-md bg-red-500/10 text-red-300 text-xs px-3 py-2">Error: {err}</div>
        )}

        {!active && search.plan && search.cycle && (
          <section className="rounded-xl border border-amber-400/30 bg-amber-500/[0.04] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-300">
              Start UPI payment
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You&apos;re about to purchase the{" "}
              <span className="font-medium capitalize text-foreground">
                {search.plan} · {search.cycle}
              </span>{" "}
              plan via UPI QR. This creates a new payment request that expires in 24 hours.
            </p>
            <button
              type="button"
              disabled={creating}
              onClick={startNew}
              className="mt-4 rounded-md bg-amber-400/90 hover:bg-amber-400 py-2 px-4 text-sm font-semibold text-slate-900 disabled:opacity-50"
            >
              {creating ? "Generating…" : "Generate QR"}
            </button>
          </section>
        )}

        {active ? (
          <ActivePaymentCard
            req={active}
            envelope={envelope}
            submit={submit}
            onCancel={() => cancelReq(active.id)}
            onSubmitted={async () => {
              await reload();
              await refreshEnt();
            }}
          />
        ) : (
          !search.plan && (
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-muted-foreground">
              You have no active payment request. Choose a plan from the{" "}
              <Link to="/pricing" className="text-amber-300 underline">
                pricing page
              </Link>{" "}
              to start a UPI payment.
            </section>
          )
        )}

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Past requests
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {rows.map((r) => (
                <li key={r.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-mono text-xs">{r.paymentReference}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="capitalize">
                        {r.requestedPlan} · {r.billingCycle}
                      </span>{" "}
                      · {formatRupees(r.expectedAmount)} · created{" "}
                      {new Date(r.createdAt).toLocaleString()}
                    </div>
                    {r.rejectionReason && (
                      <div className="mt-1 text-xs text-red-300">
                        Reason: {r.rejectionReason}
                      </div>
                    )}
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(r.status).className}`}
                  >
                    {statusTone(r.status).label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

interface ActivePaymentCardProps {
  req: ManualPaymentRequest;
  envelope: ReturnType<typeof useServerFn<typeof getManualPaymentEnvelope>>;
  submit: ReturnType<typeof useServerFn<typeof submitManualPaymentUtr>>;
  onCancel: () => void | Promise<void>;
  onSubmitted: () => void | Promise<void>;
}

function ActivePaymentCard({ req, envelope, submit, onCancel, onSubmitted }: ActivePaymentCardProps) {
  const [env, setEnv] = useState<Awaited<ReturnType<typeof envelope>> | null>(null);
  const [utr, setUtr] = useState("");
  const [amountPaid, setAmountPaid] = useState<string>((req.expectedAmount / 100).toFixed(0));
  const [app, setApp] = useState("");
  const [note, setNote] = useState("");
  const [paymentDate, setPaymentDate] = useState<string>("");
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  useEffect(() => {
    void envelope({ data: { plan: req.requestedPlan, cycle: req.billingCycle } })
      .then(setEnv)
      .catch(() => setEnv(null));
  }, [envelope, req.requestedPlan, req.billingCycle]);

  const upiUri = useMemo(
    () =>
      buildUpiUri({
        upiId: req.upiId,
        payeeName: req.payeeName ?? env?.payeeName ?? "EagleBABA",
        amountRupees: req.expectedAmount / 100,
        reference: req.paymentReference,
      }),
    [req, env],
  );
  const qrUrl = env?.qrImageOverride ?? qrImageUrlFor(upiUri, 320);

  const copy = async (v: string, label: string) => {
    try {
      await navigator.clipboard.writeText(v);
      setLocalErr(null);
      // No global toast infra — rely on inline feedback
      alert(`${label} copied`);
    } catch {
      /* ignore */
    }
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setLocalErr("Screenshot must be under 5 MB.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
      setLocalErr("Only JPG, PNG, WEBP or PDF accepted.");
      return;
    }
    setUploading(true);
    setLocalErr(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not_authenticated");
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${user.id}/${req.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("payment-proofs")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      setScreenshotPath(path);
    } catch (e) {
      setLocalErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const submitProof = async () => {
    const check = validateUtr(utr);
    if (!check.ok) {
      setLocalErr(`Invalid UTR (${check.reason ?? "check format"}).`);
      return;
    }
    const paise = Math.round(parseFloat(amountPaid || "0") * 100);
    if (!Number.isFinite(paise) || paise <= 0) {
      setLocalErr("Enter the exact amount paid.");
      return;
    }
    setSubmitting(true);
    setLocalErr(null);
    try {
      await submit({
        data: {
          id: req.id,
          utr,
          amountPaidPaise: paise,
          paymentApp: app || null,
          userNote: note || null,
          paymentDate: paymentDate ? new Date(paymentDate).toISOString() : null,
          screenshotPath: screenshotPath ?? null,
        },
      });
      await onSubmitted();
    } catch (e) {
      setLocalErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const tone = statusTone(req.status);

  return (
    <section className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/[0.06] via-slate-900/40 to-slate-900/80 p-6 shadow-lg">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wider text-amber-300">Active payment</div>
          <div className="text-lg font-semibold capitalize">
            {req.requestedPlan} · {req.billingCycle}
          </div>
          <div className="text-xs text-muted-foreground font-mono mt-1">{req.paymentReference}</div>
        </div>
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.className}`}
        >
          {tone.label}
        </span>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="flex flex-col items-center rounded-xl border border-white/10 bg-white/5 p-4">
          <img
            src={qrUrl}
            alt="UPI QR"
            width={288}
            height={288}
            className="rounded-md bg-white p-2 max-w-full"
            loading="lazy"
          />
          <div className="mt-4 w-full space-y-2 text-sm">
            <Row label="Amount" value={formatRupees(req.expectedAmount)} onCopy={() => copy((req.expectedAmount / 100).toFixed(2), "Amount")} />
            <Row label="UPI ID" value={req.upiId} onCopy={() => copy(req.upiId, "UPI ID")} />
            <Row label="Payee" value={req.payeeName ?? "EagleBABA"} />
            <Row
              label="Reference"
              value={req.paymentReference}
              onCopy={() => copy(req.paymentReference, "Reference")}
              mono
            />
          </div>
          <a
            href={qrUrl}
            download={`${req.paymentReference}.png`}
            className="mt-3 text-xs text-amber-300 underline"
          >
            Download QR
          </a>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Instructions
          </h3>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            {(env?.instructions ?? []).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            Expires: {new Date(req.expiresAt).toLocaleString()} · Support:{" "}
            <a className="text-amber-300 underline" href={`mailto:${env?.supportEmail ?? ""}`}>
              {env?.supportEmail ?? "—"}
            </a>
          </p>
        </div>
      </div>

      {req.status === "CREATED" || req.status === "REJECTED" ? (
        <div className="mt-6 border-t border-white/10 pt-6 space-y-3">
          <h3 className="text-sm font-semibold">Submit payment proof</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <Field label="UTR / Transaction ID*">
              <input
                type="text"
                value={utr}
                onChange={(e) => setUtr(e.target.value.trim())}
                placeholder="e.g. 412345678901"
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Amount paid (₹)*">
              <input
                type="number"
                min={1}
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Payment date & time">
              <input
                type="datetime-local"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Payment app">
              <input
                type="text"
                value={app}
                onChange={(e) => setApp(e.target.value)}
                placeholder="GPay / PhonePe / Paytm"
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Screenshot / receipt (JPG, PNG, WEBP, PDF · ≤5 MB)">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs"
              />
              {uploading && <span className="text-xs text-amber-300">Uploading…</span>}
              {screenshotPath && !uploading && (
                <span className="text-xs text-emerald-300">Uploaded ✓</span>
              )}
            </Field>
            <Field label="Note (optional)">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={2}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm"
              />
            </Field>
          </div>
          {localErr && (
            <div className="rounded-md bg-red-500/10 text-red-300 text-xs px-3 py-2">
              {localErr}
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              disabled={submitting}
              onClick={submitProof}
              className="rounded-md bg-amber-400/90 hover:bg-amber-400 py-2 px-4 text-sm font-semibold text-slate-900 disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit for verification"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-red-500/40 text-red-300 py-2 px-4 text-sm hover:bg-red-500/10"
            >
              Cancel request
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 border-t border-white/10 pt-6 text-sm text-muted-foreground">
          Your submission is on record. An admin will verify it shortly (typically within{" "}
          {env?.approvalSlaHours ?? 24} hours). No further action needed.
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-white/15 py-1.5 px-3 text-xs hover:bg-white/5"
            >
              Cancel request
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  onCopy,
  mono = false,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-black/20 px-3 py-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`${mono ? "font-mono text-xs" : "text-sm"} truncate max-w-[60%] text-right`}>
        {value}
      </span>
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="rounded border border-white/10 px-2 py-0.5 text-[10px] hover:bg-white/5"
        >
          Copy
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
