import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { askAiAssistant, type ChatTurn } from "@/lib/ai-assistant.functions";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, X, Send, RotateCcw, Bot, User } from "lucide-react";

interface ChatMessage extends ChatTurn {
  id: string;
  timestamp: string;
  toolsUsed?: readonly string[];
}

const QUICK_PROMPTS_EN = [
  "Explain this page",
  "What is PURE BLOOD BATH?",
  "Option buying Call vs Put",
  "Why GAP in session log?",
] as const;

const QUICK_PROMPTS_HI = [
  "Yeh page kya dikhata hai?",
  "Option buying kaise karte hai?",
  "Aaj intraday pressure kaise dekhe?",
  "GAP · No verified option OI kya hai?",
] as const;

function formatTime(): string {
  try {
    return new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

export function AiAssistantModal() {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const ask = useServerFn(askAiAssistant);

  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const searchStr = useRouterState({ select: (r) => r.location.searchStr });

  const activeSymbol = (() => {
    try {
      const params = new URLSearchParams(searchStr || "");
      const sym = params.get("symbol");
      return sym ? sym.trim().toUpperCase() : undefined;
    } catch {
      return undefined;
    }
  })();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy, open]);

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? question).trim();
    if (text.length < 1 || busy) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: formatTime(),
    };
    const priorHistory: ChatTurn[] = messages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMsg]);
    if (!overrideText) setQuestion("");
    setBusy(true);

    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) {
        throw new Error(
          language === "hi"
            ? "Ask AI Assistant उपयोग करने के लिए साइन इन करें।"
            : "Sign in to use Ask AI Assistant.",
        );
      }

      const result = await ask({
        data: {
          question: text,
          language,
          accessToken: data.session.access_token,
          history: priorHistory,
          context: {
            currentRoute: pathname,
            activeSymbol,
          },
        },
      });

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: result.answer,
        toolsUsed: result.toolsUsed,
        timestamp: formatTime(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      const errText =
        error instanceof Error
          ? error.message
          : "Unable to reach the assistant right now. Please try again in a moment.";
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: errText,
          timestamp: formatTime(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  const quickPrompts = language === "hi" ? QUICK_PROMPTS_HI : QUICK_PROMPTS_EN;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Ask AI Assistant"
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 z-40 flex items-center gap-1.5 rounded-full border border-[rgba(148,163,184,0.28)] bg-[#11161f]/95 px-3 py-1.5 text-[11px] font-semibold text-amber-300 shadow-xl backdrop-blur-md transition-all hover:bg-[#141b26] hover:border-amber-500/50 active:scale-95 md:bottom-6 md:right-6 md:px-4 md:py-2 md:text-xs"
      >
        <Sparkles size={13} className="text-amber-400 shrink-0" />
        <span className="font-mono">Ask AI Assistant</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-2 sm:p-4 sm:items-center backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="EagleBABA Agentic AI Assistant"
            className="flex h-[84dvh] max-h-[680px] w-full max-w-xl flex-col rounded-2xl border border-[rgba(148,163,184,0.18)] bg-[#090c10] text-zinc-100 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
          >
            {/* Header */}
            <header className="flex items-center justify-between gap-2 border-b border-[rgba(148,163,184,0.14)] bg-[#11161f] px-4 py-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
                  <Bot size={15} className="text-amber-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-zinc-100 text-sm font-sans truncate">
                    EagleBABA Agentic Assistant
                  </h2>
                  <div className="text-[10px] text-slate-400 font-mono truncate tabular-nums">
                    Context: {pathname || "/"}
                    {activeSymbol ? ` · ${activeSymbol}` : ""}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <select
                  aria-label="Response language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "en" | "hi")}
                  className="rounded-md border border-[rgba(148,163,184,0.2)] bg-[#141b26] px-2 py-1 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-amber-500/60"
                >
                  <option value="en">EN</option>
                  <option value="hi">हिन्दी</option>
                </select>
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMessages([])}
                    title="New Chat"
                    aria-label="New Chat"
                    className="rounded-md border border-[rgba(148,163,184,0.18)] bg-[#141b26] p-1.5 text-slate-400 hover:text-zinc-100 hover:border-slate-500 transition-colors"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1.5 text-slate-400 hover:text-zinc-100 hover:bg-[#141b26] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </header>

            {/* Scrollable Multi-Turn Thread */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3 overscroll-contain bg-[#090c10]"
            >
              {messages.length === 0 ? (
                <div className="space-y-3 py-2">
                  <div className="rounded-xl border border-[rgba(148,163,184,0.14)] bg-[#11161f] p-3.5 text-xs text-slate-300 leading-relaxed">
                    <div className="font-mono text-[11px] font-semibold text-amber-400 mb-1">
                      Bilingual Research &amp; Platform Agent
                    </div>
                    <p>
                      {language === "hi"
                        ? "आप मुझसे इस पेज, डैशबोर्ड कार्ड्स, Option Buying (Call/Put), VWAP, OVM-9 रेजीम, PAZ/PDI, RSB, स्टॉक्स या GAP लॉग्स के बारे में लगातार सवाल पूछ सकते हैं। (केवल रिसर्च और शिक्षा के लिए।)"
                        : "Ask multi-turn questions about this page, dashboard signals, Option Buying (Call vs Put), VWAP, OVM-9 regimes, PAZ/PDI, RSB, stock analysis, or GAP logs. (Research & education only.)"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        className="rounded-lg border border-[rgba(148,163,184,0.18)] bg-[#11161f] px-2.5 py-1.5 text-[11px] font-mono text-zinc-300 hover:border-amber-500/40 hover:text-amber-300 hover:bg-[#141b26] transition-colors text-left"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-amber-500/30 bg-[#11161f]">
                        <Bot size={13} className="text-amber-400" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap border ${
                        msg.role === "user"
                          ? "bg-[#141b26] border-amber-500/30 text-zinc-100"
                          : "bg-[#11161f] border-[rgba(148,163,184,0.14)] text-zinc-200"
                      }`}
                    >
                      <div>{msg.content}</div>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[9px] font-mono text-slate-400 tabular-nums">
                        <span>{msg.timestamp}</span>
                        {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                          <span className="text-slate-400">
                            tools: {msg.toolsUsed.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                    {msg.role === "user" && (
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[rgba(148,163,184,0.2)] bg-[#141b26]">
                        <User size={13} className="text-slate-300" />
                      </div>
                    )}
                  </div>
                ))
              )}

              {busy && (
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400 px-1 py-1">
                  <span className="h-3 w-3 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                  <span>{language === "hi" ? "विश्लेषण हो रहा है…" : "Thinking…"}</span>
                </div>
              )}
            </div>

            {/* Composer Footer */}
            <form
              onSubmit={handleSubmit}
              className="shrink-0 border-t border-[rgba(148,163,184,0.14)] bg-[#11161f] px-4 py-3 space-y-2"
            >
              <div className="flex items-end gap-2">
                <textarea
                  rows={2}
                  maxLength={800}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      if (question.trim().length >= 1 && !busy) {
                        void sendMessage();
                      }
                    }
                  }}
                  placeholder={
                    language === "hi"
                      ? "English या हिन्दी में पूछें… (Enter से भेजें, Shift+Enter नई लाइन)"
                      : "Ask a follow-up in English or हिन्दी… (Enter to send, Shift+Enter newline)"
                  }
                  className="flex-1 rounded-xl border border-[rgba(148,163,184,0.2)] bg-[#090c10] p-2.5 text-xs text-zinc-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60 transition-colors resize-none font-sans"
                />
                <button
                  type="submit"
                  disabled={busy || question.trim().length < 1}
                  aria-label="Send message"
                  className="h-11 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-xs font-bold text-black shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 font-mono shrink-0"
                >
                  <Send size={14} />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono tabular-nums">
                <span>Research &amp; education only — no financial advice</span>
                <span>{question.length}/800</span>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
