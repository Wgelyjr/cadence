import { endOfDay, startOfDay } from 'date-fns';
import { Droplets, Milk, Moon } from 'lucide-react';
import { useAppStore } from '../lib/store';
import type { CareEvent } from '../lib/types';

function minutesBetween(e: CareEvent): number {
  if (!e.end_time) return 0;
  return Math.max(0, (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 60000);
}

function fmtSleep(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export default function SummaryStats() {
  const events = useAppStore((s) => s.events);
  const activeId = useAppStore((s) => s.activeChildId);

  const start = startOfDay(new Date());
  const end = endOfDay(new Date());
  const today = events.filter(
    (e) =>
      e.child_id === activeId &&
      !e.deleted &&
      new Date(e.start_time) >= start &&
      new Date(e.start_time) <= end,
  );

  const sleepMin = today.filter((e) => e.type === 'sleep').reduce((a, e) => a + minutesBetween(e), 0);
  const feeds = today.filter((e) => e.type === 'feed');
  const feedMl = feeds.reduce(
    (a, e) => a + (e.bottle_ml ?? 0) + (e.pump_ml ?? 0),
    0,
  );
  const diapers = today.filter((e) => e.type === 'diaper');
  const wet = diapers.filter((d) => d.diaper_type === 'wet').length;
  const dirty = diapers.filter((d) => d.diaper_type !== 'wet').length;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="card p-3">
        <Moon size={18} className="text-brand-500" />
        <p className="mt-1.5 text-lg font-bold leading-none text-slate-800">{fmtSleep(sleepMin)}</p>
        <p className="mt-1 text-xs text-slate-500">Sleep today</p>
      </div>
      <div className="card p-3">
        <Milk size={18} className="text-emerald-500" />
        <p className="mt-1.5 text-lg font-bold leading-none text-slate-800">
          {feeds.length}
          {feedMl > 0 && <span className="text-xs font-medium text-slate-400"> · {feedMl}ml</span>}
        </p>
        <p className="mt-1 text-xs text-slate-500">Feeds</p>
      </div>
      <div className="card p-3">
        <Droplets size={18} className="text-sky-500" />
        <p className="mt-1.5 text-lg font-bold leading-none text-slate-800">
          {diapers.length}
          <span className="text-xs font-medium text-slate-400">
            {' '}
            ({wet}w·{dirty}d)
          </span>
        </p>
        <p className="mt-1 text-xs text-slate-500">Diapers</p>
      </div>
    </div>
  );
}
