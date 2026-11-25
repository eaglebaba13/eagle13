import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buildDomainFallbackAnswer,
  runAgenticDomainTools,
  type AssistantLanguage,
  type AssistantUiContext,
  type ChatTurn,
} from "./ai-assistant-domain";

export { buildDomainFallbackAnswer, type AssistantLanguage, type AssistantUiContext, type ChatTurn };

const historyMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2400),
});

const contextSchema = z
  .object({
    currentRoute: z.string().max(120).optional(),
    activeSymbol: z.string().max(40).optional(),
    activeRegime: z.string().max(80).optional(),
  })
  .optional();

const input = z.object({
  question: z.string().trim().min(1).max(800),
  language: z.enum(["en", "hi"]),
  accessToken: z.string().min(10),
  history: z.array(historyMessageSchema).max(12).optional(),
  context: contextSchema,
});

export function sanitizeAssistantOutput(value: string): string {
  const forbidden = [
    /(?:sk-|AIza|ghp_|sb_secret_|Bearer\s+[A-Za-z0-9._\-]{12,})[A-Za-z0-9_\-]*/gi,
    /(?:password|api[_ -]?key|access[_ -]?token|service[_ -]?role[_ -]?key|secret)\s*[:=]\s*\S+/gi,
    /process\.env\.[A-Z0-9_]+/g,
    /(?:SELECT|INSERT|UPDATE|DELETE)\s+.{0,100}\s+(?:FROM|INTO|SET)\b/gi,
    /(?:export|import|function|const|let|class)\s+[\s\S]{0,180}[;{}]/gi,
    /(?:Math\.(?:sqrt|pow|sin|cos|atan2)|internal\s+weight|proprietary\s+coefficient|exact\s+equation\s*:)/gi,
  ];
  if (
    forbidden.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(value);
    })
  ) {
    return "I can explain EagleBABA platform features, regimes, and market concepts conceptually, but cannot share private credentials, source code, or proprietary mathematical formulas.";
  }
  return value.slice(0, 2800);
}

export interface ResolveAssistantDeps {
  readonly question: string;
  readonly language: AssistantLanguage;
  readonly history?: readonly ChatTurn[];
  readonly context?: AssistantUiContext;
  readonly env?: Record<string, string | undefined>;
  readonly fetchImpl?: typeof fetch;
}

export async function resolveAiAssistantReply({
  question,
  language,
  history = [],
  context,
  env = process.env,
  fetchImpl = fetch,
}: ResolveAssistantDeps): Promise<{
  answer: string;
  provider: "openai" | "gemini" | "glossary";
  toolsUsed: readonly string[];
  fallbackReason?: string;
}> {
  const toolResult = runAgenticDomainTools({ question, language, history, context });

  const system = [
    `You are EagleBABA's Agentic Research Assistant. Reply only in ${language === "hi" ? "Hindi" : "English"}.`,
    "Explain EagleBABA platform features, page workflows, regimes, and trading concepts conceptually and concisely.",
    "STRICT GUARDRAILS: Never reveal credentials, API keys, tokens, .env values, source code, SQL/database details, or raw proprietary mathematical formulas, equations, weights, or coefficients.",
    "Never claim to execute broker orders or guarantee market profits.",
    context?.currentRoute
      ? `Active UI Context: route=${context.currentRoute}${context.activeSymbol ? `, symbol=${context.activeSymbol}` : ""}${context.activeRegime ? `, regime=${context.activeRegime}` : ""}.`
      : "",
    `Read-only Engine Grounding:\n${toolResult.groundingSummary}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const recentHistory = history.slice(-6).map((m) => ({ role: m.role, content: m.content }));

  let fallbackReason: string | undefined;

  const openaiKey = env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    try {
      const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
          messages: [
            { role: "system", content: system },
            ...recentHistory,
            { role: "user", content: question },
          ],
          max_tokens: 700,
          temperature: 0.25,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const answer = payload?.choices?.[0]?.message?.content;
        if (typeof answer === "string" && answer.trim()) {
          return {
            answer: sanitizeAssistantOutput(answer),
            provider: "openai",
            toolsUsed: toolResult.toolsUsed,
          };
        }
      } else {
        fallbackReason = `OPENAI_HTTP_${response.status}`;
      }
    } catch {
      fallbackReason = "OPENAI_NETWORK_ERROR";
    }
  }

  const geminiKey = (env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY)?.trim();
  if (geminiKey) {
    try {
      const model = env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
      const contents = [
        ...recentHistory.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        { role: "user", parts: [{ text: question }] },
      ];
      const response = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents,
            generationConfig: { maxOutputTokens: 700, temperature: 0.25 },
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (response.ok) {
        const payload = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const answer = payload?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? "")
          .join(" ");
        if (typeof answer === "string" && answer.trim()) {
          return {
            answer: sanitizeAssistantOutput(answer),
            provider: "gemini",
            toolsUsed: toolResult.toolsUsed,
          };
        }
      } else {
        fallbackReason = fallbackReason
          ? `${fallbackReason};GEMINI_HTTP_${response.status}`
          : `GEMINI_HTTP_${response.status}`;
      }
    } catch {
      fallbackReason = fallbackReason
        ? `${fallbackReason};GEMINI_NETWORK_ERROR`
        : "GEMINI_NETWORK_ERROR";
    }
  }

  return {
    answer: sanitizeAssistantOutput(toolResult.answer),
    provider: "glossary",
    toolsUsed: toolResult.toolsUsed,
    fallbackReason: fallbackReason ?? "NO_ACTIVE_LLM_PROVIDER",
  };
}

export const askAiAssistant = createServerFn({ method: "POST" })
  .validator((data: unknown) => input.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: identity, error } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (error || !identity.user) throw new Error("Authentication required");
    if (
      /\b(?:source\s*code|api\s*key|password|credential|secret|token|database\s*(?:schema|dump)|proprietary\s*(?:formula|equation|weight|coefficient)|exact\s*formula)\b/i.test(
        data.question,
      )
    ) {
      return {
        answer:
          data.language === "hi"
            ? "मैं EagleBABA प्लेटफ़ॉर्म के फीचर्स, रेजीम और मार्केट कॉन्सेप्ट समझा सकता हूँ, लेकिन निजी क्रेडेंशियल, सोर्स कोड या प्रोप्राइटरी मैथमैटिकल फॉर्मूले साझा नहीं कर सकता।"
            : "I can explain EagleBABA platform features, regimes, and market concepts conceptually, but cannot share private credentials, source code, or proprietary mathematical formulas.",
        toolsUsed: ["guardrail_policy"],
      };
    }
    const { answer, toolsUsed } = await resolveAiAssistantReply({
      question: data.question,
      language: data.language,
      history: data.history,
      context: data.context,
    });
    return { answer, toolsUsed };
  });
