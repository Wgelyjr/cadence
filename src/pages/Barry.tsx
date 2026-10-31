import { useEffect, useRef, useState } from 'react';
import { Bot, Send, User } from 'lucide-react';
import { format } from 'date-fns';
import Markdown from '../components/Markdown';
import { askBarry } from '../lib/barry';
import { isBarryAvailable } from '../lib/config';
import { useAppStore } from '../lib/store';
import type { BarryMessage, CareEvent } from '../lib/types';
import { ageInWeeks, ageLabel } from '../lib/utils';

const MS_H = 3600 * 1000;

function fmtDur(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Nursing minutes of one feed: the duration is per side, so both counts twice. */
function nursingMinutes(e: CareEvent): number {
  const d = e.feed_side_duration_min ?? 0;
  return e.feed_side === 'both' ? d * 2 : d;
}

function sleepMinutes(e: CareEvent): number {
  if (!e.end_time) return 0;
  return Math.max(0, (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 60000);
}

/**
 * A compact digest of the recorded data, sent with every question so Barry
 * can answer with real numbers: the last 24 hours in detail, 7-day
 * averages, and the most recent growth, health and milestone entries.
 */
function buildSummary(events: CareEvent[], childId: string): string {
  const now = Date.now();
  const within = (hours: number) => (e: CareEvent) =>
    now - new Date(e.start_time).getTime() <= hours * MS_H;
  const mine = events.filter((e) => e.child_id === childId && !e.deleted);
  const lines: string[] = [];

  // Last 24 hours, by type.
  const feeds = mine.filter((e) => e.type === 'feed' && within(24)(e));
  const byMethod = (m: CareEvent['feed_method']) => feeds.filter((f) => f.feed_method === m);
  const feedParts: string[] = [];
  const nursing = byMethod('nursing');
  if (nursing.length) {
    const min = nursing.reduce((a, f) => a + nursingMinutes(f), 0);
    feedParts.push(`${nursing.length} nursing${min ? ` (~${fmtDur(min)})` : ''}`);
  }
  const bottles = byMethod('bottle');
  if (bottles.length) {
    const ml = bottles.reduce((a, f) => a + (f.bottle_ml ?? 0), 0);
    feedParts.push(`${bottles.length} bottle${ml ? ` (${ml} ml)` : ''}`);
  }
  const pumped = byMethod('pump');
  if (pumped.length) {
    const ml = pumped.reduce((a, f) => a + (f.pump_ml ?? 0), 0);
    feedParts.push(`${pumped.length} pumped${ml ? ` (${ml} ml)` : ''}`);
  }
  const otherFeeds = feeds.length - nursing.length - bottles.length - pumped.length;
  if (otherFeeds > 0) feedParts.push(`${otherFeeds} other feed`);

  const sleeps = mine.filter((e) => e.type === 'sleep' && within(24)(e));
  const sleepMin = sleeps.reduce((a, e) => a + sleepMinutes(e), 0);
  const longestSleep = sleeps.reduce((a, e) => Math.max(a, sleepMinutes(e)), 0);
  const diapers = mine.filter((e) => e.type === 'diaper' && within(24)(e));
  const wet = diapers.filter((d) => d.diaper_type === 'wet').length;
  const solids = mine.filter((e) => e.type === 'solid_food' && within(24)(e));

  const segs: string[] = [];
  if (feedParts.length) segs.push(feedParts.join(', '));
  if (sleeps.length) segs.push(`${fmtDur(sleepMin)} sleep (longest ${fmtDur(longestSleep)})`);
  if (diapers.length) segs.push(`${diapers.length} diapers (${wet} wet, ${diapers.length - wet} dirty)`);
  if (solids.length) segs.push(`${solids.length} solid food session${solids.length > 1 ? 's' : ''}`);
  lines.push(`Last 24h: ${segs.length ? segs.join('; ') : 'nothing logged'}.`);

  // 7-day averages.
  let feeds7 = 0;
  let sleepH7 = 0;
  let diapers7 = 0;
  for (const e of mine) {
    if (!within(24 * 7)(e)) continue;
    if (e.type === 'feed') feeds7 += 1;
    else if (e.type === 'sleep') sleepH7 += sleepMinutes(e) / 60;
    else if (e.type === 'diaper') diapers7 += 1;
  }
  lines.push(
    `7-day average: ${(feeds7 / 7).toFixed(1)} feeds/day, ${(sleepH7 / 7).toFixed(1)}h sleep/day, ${(diapers7 / 7).toFixed(1)} diapers/day.`,
  );

  // Latest growth.
  const growth = mine
    .filter((e) => e.type === 'growth' && within(24 * 30)(e))
    .sort((a, b) => b.start_time.localeCompare(a.start_time))[0];
  if (growth) {
    const bits = [
      growth.height_cm != null ? `${growth.height_cm} cm` : '',
      growth.weight_kg != null ? `${growth.weight_kg} kg` : '',
      growth.head_cm != null ? `head ${growth.head_cm} cm` : '',
    ].filter(Boolean);
    if (bits.length) {
      lines.push(`Latest growth (${format(new Date(growth.start_time), 'MMM d')}): ${bits.join(', ')}.`);
    }
  }

  // Recent health entries (last 14 days).
  const health = mine
    .filter((e) => e.type === 'health' && within(24 * 14)(e))
    .sort((a, b) => b.start_time.localeCompare(a.start_time))
    .slice(0, 3)
    .map((h) =>
      [
        h.temp_c != null ? `${h.temp_c} °C` : '',
        h.medicine_name ? `medicine: ${h.medicine_name}${h.medicine_dose ? ` (${h.medicine_dose})` : ''}` : '',
        h.note ?? '',
      ]
        .filter(Boolean)
        .join(', '),
    )
    .filter(Boolean);
  if (health.length) lines.push(`Recent health: ${health.join('; ')}.`);

  // Recent milestones (last 30 days).
  const milestones = mine
    .filter((e) => e.type === 'milestone' && within(24 * 30)(e))
    .sort((a, b) => b.start_time.localeCompare(a.start_time))
    .slice(0, 3)
    .map((m) => `${m.label || 'milestone'} (${format(new Date(m.start_time), 'MMM d')})`);
  if (milestones.length) lines.push(`Milestones: ${milestones.join('; ')}.`);

  return lines.join('\n');
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
        ageLabel: ageLabel(child.birth_date),
        birth_date: child.birth_date,
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
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                m.role === 'user'
                  ? 'whitespace-pre-wrap bg-brand-600 text-white'
                  : 'bg-white text-slate-700 shadow-card dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              {m.role === 'assistant' && m.content === '' ? (
                <span className="inline-flex gap-1 text-slate-400">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 dark:bg-slate-600 [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 dark:bg-slate-600 [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 dark:bg-slate-600" />
                </span>
              ) : m.role === 'assistant' ? (
                <Markdown content={m.content} />
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
