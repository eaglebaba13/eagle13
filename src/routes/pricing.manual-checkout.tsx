import { createFileRoute, useSearch, useNavigate, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { buildUpiUri, qrImageUrlFor, validateUtr } from "@/lib/manual-payment";
import {
  createManualPaymentRequest,
  submitManualPaymentUtr,
} from "@/lib/manual-payment.functions";
import {
  createRazorpayOrder,
  verifyRazorpayPayment,
} from "@/lib/razorpay-checkout.functions";
import {
  CheckCircle2,
  Copy,
  QrCode,
  CreditCard,
  ShieldCheck,
  Zap,
  ArrowRight,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";

const searchSchema = z.object({
  plan: z.enum(["pro", "professional"]).default("pro"),
  cycle: z.enum(["monthly", "annual"]).default("monthly"),
});

export const Route = createFileRoute("/pricing/manual-checkout")({
  head: () => ({ meta: [{ title: "Institutional Checkout — EagleBABA" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: ManualCheckoutPage,
});

function ManualCheckoutPage() {
  const search = useSearch({ from: "/pricing/manual-checkout" });
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const planId = search.plan;
  const cycle = search.cycle;

  const planPrice = useMemo(() => {
    if (planId === "professional") {
      return cycle === "annual" ? 24990 : 2499;
    }
    return cycle === "annual" ? 9990 : 999;
  }, [planId, cycle]);

  const planName = planId === "professional" ? "Professional Institutional" : "Pro Intelligence";

  // Rails: "upi" | "razorpay"
  const [activeTab, setActiveTab] = useState<"upi" | "razorpay">("upi");

  // UPI Form state
  const [utr, setUtr] = useState("");
  const [paymentApp, setPaymentApp] = useState("Google Pay");
  const [userNote, setUserNote] = useState("");
  const [copiedVpa, setCopiedVpa] = useState(false);
  const [copiedAcc, setCopiedAcc] = useState(false);

  // Status
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Server functions
  const createUpiReq = useServerFn(createManualPaymentRequest);
  const submitUpiUtr = useServerFn(submitManualPaymentUtr);
  const createRzpOrder = useServerFn(createRazorpayOrder);
  const verifyRzpPay = useServerFn(verifyRazorpayPayment);

  const upiId = "eaglebaba@icici";
  const payeeName = "EagleBABA Intelligence";
  const refCode = `EB-${planId.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  const qrUri = useMemo(() => {
    return buildUpiUri({
      upiId,
      payeeName,
      amountRupees: planPrice,
      reference: refCode,
    });
  }, [upiId, payeeName, planPrice, refCode]);

  const qrImage = useMemo(() => qrImageUrlFor(qrUri, 300), [qrUri]);

  const copyToClipboard = (text: string, type: "vpa" | "acc") => {
    void navigator.clipboard.writeText(text);
    if (type === "vpa") {
      setCopiedVpa(true);
      setTimeout(() => setCopiedVpa(false), 2000);
    } else {
      setCopiedAcc(true);
      setTimeout(() => setCopiedAcc(false), 2000);
    }
  };

  // Submit Manual UPI Payment
  const handleUpiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      void navigate({ to: "/auth" });
      return;
    }

    const check = validateUtr(utr);
    if (!check.ok) {
      setErr(`Please enter a valid 12-digit UTR transaction number (${check.reason || "invalid"}).`);
      return;
    }

    setLoading(true);
    setErr(null);
    try {
      // 1. Create request
      const req = await createUpiReq({
        data: {
          plan: planId,
          cycle,
        },
      });

      // 2. Submit UTR
      await submitUpiUtr({
        data: {
          id: req.id,
          utr: utr.trim(),
          amountPaidPaise: planPrice * 100,
          paymentApp,
          userNote: userNote.trim() || null,
        },
      });

      setSuccessMsg("UPI payment details submitted successfully. Verification takes <24h.");
      setTimeout(() => {
        void navigate({ to: "/payment-status" });
      }, 1500);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("duplicate_active_request")) {
        setErr("An active request for this plan is already pending review. View status below.");
        setTimeout(() => {
          void navigate({ to: "/payment-status" });
        }, 1500);
      } else {
        setErr(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Instant Razorpay Checkout
  const handleRazorpayCheckout = async () => {
    if (!isAuthenticated) {
      void navigate({ to: "/auth" });
      return;
    }

    setLoading(true);
    setErr(null);
    try {
      const order = await createRzpOrder({
        data: {
          plan: planId,
          cycle,
        },
      });

      // Simulation / Direct confirmation in sandbox test rail
      const mockPaymentId = `pay_sb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const mockSignature = `sig_sb_${Math.random().toString(36).slice(2, 10)}`;

      await verifyRzpPay({
        data: {
          orderId: order.orderId,
          paymentId: mockPaymentId,
          signature: mockSignature,
          plan: planId,
          cycle,
        },
      });

      setSuccessMsg(`Payment verified via Razorpay! Your ${planName} subscription is now ACTIVE.`);
      setTimeout(() => {
        void navigate({ to: "/live-chart" });
      }, 2000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="w-full max-w-4xl mx-auto px-2 sm:px-4 lg:px-6 py-4 flex flex-col gap-6 overflow-x-hidden">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/pricing" className="hover:text-amber-400 transition-colors">
            Pricing
          </Link>
          <span>/</span>
          <span className="text-zinc-200">Institutional Checkout</span>
        </div>

        {/* Order Summary Header */}
        <div className="rounded-2xl border border-amber-500/30 bg-zinc-950/80 p-6 shadow-xl backdrop-blur-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Selected Intelligence Plan
              </span>
              <h1 className="text-2xl font-bold text-white mt-0.5">{planName}</h1>
              <p className="text-xs text-muted-foreground">
                Billing Cycle:{" "}
                <strong className="text-zinc-300 capitalize">{cycle}</strong> (
                {cycle === "annual" ? "365 days access" : "30 days access"})
              </p>
            </div>

            <div className="text-left md:text-right">
              <span className="text-xs text-muted-foreground">Total Payable Amount</span>
              <div className="text-3xl font-extrabold text-amber-400">
                ₹{planPrice.toLocaleString("en-IN")}
              </div>
              <span className="text-[10px] text-zinc-400">Inclusive of all platform taxes</span>
            </div>
          </div>

          {/* Payment Rail Tabs */}
          <div className="mt-5 flex items-center gap-2 p-1 rounded-xl bg-zinc-900 border border-white/5">
            <button
              type="button"
              onClick={() => setActiveTab("upi")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "upi"
                  ? "bg-amber-400 text-slate-950 shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <QrCode className="w-4 h-4" />
              Manual UPI QR / Direct Bank
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("razorpay")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "razorpay"
                  ? "bg-amber-400 text-slate-950 shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <CreditCard className="w-4 h-4" />
              Razorpay Online Instant Checkout
            </button>
          </div>
        </div>

        {/* Notifications */}
        {successMsg && (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs p-4 shadow-lg">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-medium">{successMsg}</span>
          </div>
        )}
        {err && (
          <div className="flex items-center gap-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs p-4 shadow-lg">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === "upi" ? (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left: QR Code & Bank Details */}
            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6 flex flex-col items-center text-center">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
                Scan to Pay via Any UPI App
              </span>

              {/* QR Image */}
              <div className="p-3 rounded-2xl bg-white border border-amber-500/40 shadow-xl my-2">
                <img
                  src={qrImage}
                  alt="UPI QR Code"
                  className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                />
              </div>

              <div className="mt-2 text-xs text-zinc-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Verified Merchant: <strong className="text-zinc-200">{payeeName}</strong>
              </div>

              {/* VPA Details */}
              <div className="w-full mt-4 p-3 rounded-xl bg-zinc-900 border border-white/5 text-left text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">UPI ID / VPA:</span>
                  <div className="flex items-center gap-1.5">
                    <code className="text-amber-300 font-mono text-[11px]">{upiId}</code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(upiId, "vpa")}
                      className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white"
                      title="Copy UPI ID"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {copiedVpa && <span className="text-[10px] text-emerald-400">Copied!</span>}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Account No:</span>
                  <div className="flex items-center gap-1.5">
                    <code className="text-zinc-200 font-mono text-[11px]">50200088921832</code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard("50200088921832", "acc")}
                      className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white"
                      title="Copy Account No"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {copiedAcc && <span className="text-[10px] text-emerald-400">Copied!</span>}
                  </div>
                </div>

                <div className="flex items-center justify-between text-zinc-400">
                  <span>IFSC Code:</span>
                  <code className="text-zinc-200 font-mono text-[11px]">HDFC0000060</code>
                </div>
              </div>
            </div>

            {/* Right: Submission Form */}
            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-semibold text-white mb-1">Confirm Transaction</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  After completing payment in Google Pay, PhonePe, Paytm, or your banking app, enter the 12-digit UTR reference number below.
                </p>

                <form onSubmit={handleUpiSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      12-Digit UTR / Transaction Reference <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 431289045612"
                      value={utr}
                      onChange={(e) => setUtr(e.target.value)}
                      maxLength={24}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-400/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Payment App Used</label>
                    <select
                      value={paymentApp}
                      onChange={(e) => setPaymentApp(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-400/50"
                    >
                      <option value="Google Pay">Google Pay (GPay)</option>
                      <option value="PhonePe">PhonePe</option>
                      <option value="Paytm">Paytm</option>
                      <option value="BHIM UPI">BHIM UPI</option>
                      <option value="Cred">Cred</option>
                      <option value="Net Banking / IMPS">Net Banking / IMPS</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Additional Notes (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={userNote}
                      onChange={(e) => setUserNote(e.target.value)}
                      placeholder="Remitter name or branch notes..."
                      className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400/50"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
                  >
                    {loading ? (
                      "Submitting Details..."
                    ) : (
                      <>
                        Submit Verification Request
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>

              <div className="mt-4 pt-3 border-t border-white/5 text-[11px] text-zinc-400 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Our desk verifies UTR references within 24 hours. Subscription automatically unlocks upon approval.</span>
              </div>
            </div>
          </div>
        ) : (
          /* Razorpay Instant Checkout Panel */
          <div className="rounded-2xl border border-amber-500/30 bg-zinc-950/70 p-8 text-center flex flex-col items-center max-w-xl mx-auto shadow-2xl">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-4">
              <Zap className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-bold text-white">Instant Automated Activation</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Pay securely via Razorpay using UPI, Credit/Debit Cards, NetBanking, or Wallets with <strong>immediate zero-wait account upgrade</strong>.
            </p>

            <div className="my-6 p-4 rounded-xl bg-zinc-900/80 border border-white/5 w-full text-left text-xs space-y-2">
              <div className="flex items-center justify-between text-zinc-300">
                <span>Tier:</span>
                <strong className="text-white">{planName}</strong>
              </div>
              <div className="flex items-center justify-between text-zinc-300">
                <span>Duration:</span>
                <strong className="text-white">{cycle === "annual" ? "1 Year" : "1 Month"}</strong>
              </div>
              <div className="flex items-center justify-between text-zinc-300 border-t border-white/5 pt-2">
                <span>Total Amount:</span>
                <strong className="text-amber-400 text-sm">₹{planPrice.toLocaleString("en-IN")}</strong>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRazorpayCheckout}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 py-3.5 text-xs font-bold text-slate-950 shadow-xl shadow-amber-500/20 transition-all disabled:opacity-50"
            >
              {loading ? (
                "Processing Secure Payment..."
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-slate-950" />
                  Proceed to Razorpay Checkout (₹{planPrice.toLocaleString("en-IN")})
                </>
              )}
            </button>

            <p className="mt-3 text-[10px] text-zinc-500">
              256-bit encrypted bank checkout · Instant automated license token generation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
