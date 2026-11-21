import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askAiAssistant } from "@/lib/ai-assistant.functions";
import { supabase } from "@/integrations/supabase/client";

export function AiAssistantModal() {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = useServerFn(askAiAssistant);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setAnswer("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Sign in to use Ask AI Assistant.");
      const result = await ask({ data: { question, language, accessToken: data.session.access_token } });
      setAnswer(result.answer);
    } catch (error) { setAnswer(error instanceof Error ? error.message : "Assistant unavailable"); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-20 right-4 z-40 rounded-full border border-amber-500/50 bg-zinc-950 px-4 py-2 text-xs font-semibold text-amber-300 shadow-lg md:bottom-5">Ask AI Assistant</button>
    {open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label="Ask AI Assistant" className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-y-auto rounded-lg border border-amber-700/40 bg-zinc-950 p-4 text-zinc-100 shadow-2xl">
        <header className="flex items-center justify-between"><h2 className="font-semibold text-amber-300">Ask AI Assistant</h2><button type="button" aria-label="Close" onClick={() => setOpen(false)}>✕</button></header>
        <p className="mt-1 text-xs text-zinc-400">Platform guidance and market terminology. Research only.</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-xs">Response language <select value={language} onChange={(e) => setLanguage(e.target.value as "en" | "hi")} className="ml-2 rounded border border-zinc-700 bg-zinc-900 p-1"><option value="en">English</option><option value="hi">हिन्दी</option></select></label>
          <label className="block text-xs">Question<textarea required minLength={2} maxLength={800} value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} className="mt-1 h-24 w-full rounded border border-zinc-700 bg-zinc-900 p-2" /></label>
          <button type="submit" disabled={busy || question.trim().length < 2} className="min-h-11 w-full rounded bg-amber-600 px-3 py-2.5 text-xs font-semibold text-black disabled:opacity-50">{busy ? "Thinking…" : "Ask"}</button>
        </form>
        {answer && <div aria-live="polite" className="mt-4 max-h-64 overflow-y-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-900 p-3 text-sm">{answer}</div>}
      </section>
    </div>}
  </>;
}
