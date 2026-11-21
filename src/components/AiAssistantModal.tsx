import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askAiAssistant } from "@/lib/ai-assistant.functions";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, X, Send } from "lucide-react";

export function AiAssistantModal() {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = useServerFn(askAiAssistant);

  async function submit(event?: React.FormEvent) {
    if (event) event.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    setAnswer("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Sign in to use Ask AI Assistant.");
      const result = await ask({
        data: { question: question.trim(), language, accessToken: data.session.access_token },
      });
      setAnswer(result.answer);
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : "Assistant unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Ask AI Assistant"
        className="fixed bottom-[4.75rem] right-3 z-40 flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-zinc-950/90 px-3 py-1.5 text-[11px] font-semibold text-amber-300 shadow-xl backdrop-blur-md transition-all hover:bg-zinc-900 hover:border-amber-400 active:scale-95 sm:bottom-6 sm:right-6 sm:px-4 sm:py-2 sm:text-xs"
      >
        <Sparkles size={13} className="text-amber-400 animate-pulse shrink-0" />
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
            aria-label="Ask AI Assistant"
            className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-2xl border border-amber-600/40 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
          >
            {/* Header */}
            <header className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-400 shrink-0" />
                <h2 className="font-semibold text-amber-300 text-sm sm:text-base font-sans">
                  Ask AI Assistant
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
              >
                <X size={16} />
              </button>
            </header>

            {/* Scrollable Form Body */}
            <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 overscroll-contain">
                <p className="text-xs text-zinc-400 font-mono">
                  Bilingual platform guidance and market terminology. Research and education only — no financial advice.
                </p>

                <div className="flex items-center justify-between bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
                  <span className="text-xs text-zinc-300 font-mono">Response language</span>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as "en" | "hi")}
                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500/60"
                  >
                    <option value="en">English</option>
                    <option value="hi">हिन्दी</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 font-mono mb-1">
                    Question
                  </label>
                  <textarea
                    required
                    minLength={2}
                    maxLength={800}
                    rows={3}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        if (question.trim().length >= 2 && !busy) {
                          submit();
                        }
                      }
                    }}
                    placeholder="Ask in English or हिन्दी (e.g. What is FVG discount retest? या SMT divergence क्या है?)..."
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900/90 p-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/60 transition-colors resize-none font-sans"
                  />
                  <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                    <span>Press Enter to submit, Shift+Enter for newline</span>
                    <span>{question.length}/800</span>
                  </div>
                </div>

                {answer && (
                  <div
                    aria-live="polite"
                    className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-amber-500/30 bg-zinc-900/90 p-3.5 text-xs text-zinc-200 leading-relaxed font-sans shadow-inner"
                  >
                    {answer}
                  </div>
                )}
              </div>

              {/* Sticky Submit Footer */}
              <div className="shrink-0 border-t border-zinc-800/80 bg-zinc-950 px-4 py-3">
                <button
                  type="submit"
                  disabled={busy || question.trim().length < 2}
                  className="min-h-11 w-full rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 px-4 py-2.5 text-xs font-bold text-black shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-mono"
                >
                  {busy ? (
                    <>
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-black border-t-transparent animate-spin" />
                      <span>Thinking…</span>
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      <span>Ask Assistant</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
