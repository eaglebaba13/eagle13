// Phase 43 — Server-only Telegram admin notifier.
// SAFE: never throws to the caller — a Telegram outage must not block
// legitimate user submissions. The bot token is read from process.env
// and never leaves the server.

interface NotifyPayload {
  readonly requestId: string;
  readonly userId: string;
  readonly userEmail: string | null;
  readonly broker: string;
  readonly referralCode: string;
  readonly clientIdMasked: string;
  readonly hasScreenshot: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function notifyAdminOfReferral(p: NotifyPayload): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // silently no-op until admin configures Telegram

  const lines = [
    "🆕 <b>New INDmoney referral claim</b>",
    `Request: <code>${escapeHtml(p.requestId)}</code>`,
    `User: <code>${escapeHtml(p.userEmail ?? p.userId)}</code>`,
    `Broker: ${escapeHtml(p.broker)}`,
    `Code: <code>${escapeHtml(p.referralCode)}</code>`,
    `Client ID: <code>${escapeHtml(p.clientIdMasked)}</code>`,
    `Screenshot: ${p.hasScreenshot ? "yes" : "no"}`,
  ];
  const text = lines.join("\n");

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    // Never propagate — log only.
    console.error("[referrals] telegram notify failed:", err);
  }
}