import { useEffect, useRef, useState } from 'react';
import { Bot, Send, User } from 'lucide-react';
import { askBarry } from '../lib/barry';
import { isBarryAvailable } from '../lib/config';
import { useAppStore } from '../lib/store';
import type { BarryMessage, CareEvent } from '../lib/types';
import { ageInWeeks, ageLabel } from '../lib/utils';

function buildSummary(events: CareEvent[], childId: string): string {
  const cutoff = Date.now() - 48 * 3600 * 1000;
  const recent = events.filter(
    (e) =>
      e.child_id === childId && !e.deleted && new Date(e.start_time).getTime() >= cutoff,
  );
  const sleeps = recent.filter((e) => e.type === 'sleep' && e.end_time);
  const sleepH = Math.round(
    sleeps.reduce(
      (a, e) => a + (new Date(e.end_time!).getTime() - new Date(e.start_time).getTime()) / 3600000,
      0,
    ),
  );
  const feeds = recent.filter((e) => e.type === 'feed').length;
  const diapers = recent.filter((e) => e.type === 'diaper').length;
  return `Last 48h: ${sleeps.length} sleeps (~${sleepH}h total), ${feeds} feeds, ${diapers} diapers.`;
}

export default function Barry() {
  const children = useAppStore((s) => s.children);
  const events = useAppStore((s) => s.events);
  const activeId = useAppStore((s) => s.activeChildId);
  const child = children.find((c) => c.id === activeId && !c.deleted);

  const [messages, setMessages] = useState<BarryMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy || !child) return;
    setInput('');
    setError(null);

    const history: BarryMessage[] = [...messages, { role: 'user', content: text }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setBusy(true);
    try {
      const ctx = {
        name: child.name,
        ageWeeks: ageInWeeks(child.birth_date),
        recentSummary: buildSummary(events, child.id),
      };
      let acc = '';
      for await (const delta of askBarry(history, ctx)) {
        acc += delta;
        const snapshot = acc;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: snapshot };
          return copy;
        });
      }
      if (!acc) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: '(empty response)' };
          return copy;
        });
      }
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setMessages((prev) => prev.filter((m) => !(m.role === 'assistant' && m.content === '')));
    } finally {
      setBusy(false);
    }
  }

  if (!isBarryAvailable) {
    return (
      <div className="animate-fade-in flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
          <Bot size={30} />
        </div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Barry is offline</h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Barry answers questions using your recorded data plus a curated reference
          corpus. To enable it, set <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">VITE_SUPABASE_URL</code>{' '}
          and <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">VITE_SUPABASE_ANON_KEY</code>, deploy the{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">barry</code> edge function, and set its
          secrets (an OpenAI-compatible endpoint).
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Barry</h1>
        {child && (
          <span className="chip bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            {child.name} · {ageLabel(child.birth_date)}
          </span>
        )}
      </div>

      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto pb-3">
        {messages.length === 0 && (
          <div className="rounded-xl bg-brand-50 p-4 text-sm text-brand-700 dark:bg-brand-950 dark:text-brand-300">
            Ask me about {child?.name ?? 'your baby'}'s sleep, feeding or development — e.g.
            "When should I expect the next nap?" or "How much is baby sleeping lately?"
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-slate-700 shadow-card dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              {m.role === 'assistant' && m.content === '' ? (
                <span className="inline-flex gap-1 text-slate-400">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 dark:bg-slate-600 [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 dark:bg-slate-600 [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 dark:bg-slate-600" />
                </span>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {error && (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/60 dark:text-red-400">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={send}
        className="sticky bottom-0 flex items-end gap-2 border-t border-slate-200 bg-cream pt-3 pb-1 dark:border-slate-800 dark:bg-slate-950"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Ask Barry…"
          className="field max-h-28 min-h-[44px] flex-1 resize-none"
        />
        <button type="submit" className="btn-primary h-11 px-3.5" disabled={busy || !input.trim()}>
          {busy ? <User size={18} className="opacity-0" /> : <Send size={18} />}
        </button>
      </form>
    </div>
  );
}
