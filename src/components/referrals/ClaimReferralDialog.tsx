import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  INDMONEY_REFERRAL_CODE,
  REFERRAL_REWARD_DAYS,
  maskClientId,
} from "@/lib/referrals/constants";
import { submitReferralRequest } from "@/lib/referrals/referrals.functions";

const BUCKET = "payment-proofs";
const MAX_BYTES = 4 * 1024 * 1024;

interface Props {
  readonly onClose: () => void;
}

/**
 * Phase 43 — Referral claim form.
 * Uploads a screenshot to the shared `payment-proofs` bucket under
 * `{userId}/referrals/…` (matches existing RLS policy) and then calls
 * the `submit_referral_request` RPC via a server function.
 */
export function ClaimReferralDialog({ onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const submitFn = useServerFn(submitReferralRequest);
  const [clientId, setClientId] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [declaration, setDeclaration] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (!declaration) throw new Error("Please accept the declaration");
      if (clientId.trim().length < 3) throw new Error("Enter your INDmoney client ID");

      let screenshotUrl: string | null = null;
      if (file) {
        if (file.size > MAX_BYTES) {
          throw new Error("Screenshot must be under 4 MB");
        }
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
        const path = `${user.id}/referrals/${Date.now()}-${crypto
          .randomUUID()
          .slice(0, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        // Bucket is private — store the storage path; admin creates a signed URL to view.
        screenshotUrl = path;
      }

      return submitFn({
        data: {
          broker: "INDMONEY",
          referralCode: INDMONEY_REFERRAL_CODE,
          brokerClientIdMasked: maskClientId(clientId),
          screenshotUrl,
          userNote: note.trim() || null,
          declarationAccepted: true,
        },
      });
    },
    onSuccess: () => {
      toast.success("Referral claim submitted for review");
      void qc.invalidateQueries({ queryKey: ["referral-requests"] });
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Claim referral bonus</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Submit proof that you opened an INDmoney account with our referral
          code and completed the required trade. Approved claims add{" "}
          {REFERRAL_REWARD_DAYS} days of Pro.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">
              INDmoney client ID
            </span>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="e.g. IND1234567"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-[10px] text-muted-foreground">
              We only store a masked version: {clientId ? maskClientId(clientId) : "••••••XXXX"}
            </span>
          </label>

          <label className="block">
            <span className="text-xs text-muted-foreground">
              Trade confirmation screenshot (optional but strongly recommended)
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-xs"
            />
          </label>

          <label className="block">
            <span className="text-xs text-muted-foreground">Note to reviewer (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={declaration}
              onChange={(e) => setDeclaration(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I declare that I opened an INDmoney account using the referral
              code <strong>{INDMONEY_REFERRAL_CODE}</strong> and completed the
              required trade. I understand submitting false information may
              result in denial of the bonus.
            </span>
          </label>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !declaration}
            className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {mutation.isPending ? "Submitting…" : "Submit claim"}
          </button>
        </div>
      </div>
    </div>
  );
}