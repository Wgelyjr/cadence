import { useMemo } from 'react';
import { Droplets, Heart, Milk } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { useSettings } from '../lib/settings';
import { fmtVolume } from '../lib/units';
import type { CareEvent } from '../lib/types';

const HOUR_MS = 3600 * 1000;

function fmtDur(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/**
 * Total nursing minutes of one feed. `feed_side_duration_min` is minutes per
 * side (see EventCard, which shows "Xm/side"), so a both-sides feed counts
 * twice.
 */
function nursingMinutes(e: CareEvent): number {
  const d = e.feed_side_duration_min ?? 0;
  return e.feed_side === 'both' ? d * 2 : d;
}

/**
 * Feeding totals for the last 24 hours: bottle volume, nursing time and
 * pumped volume. Hidden entirely when nothing was fed, so an empty day
 * doesn't read as "0 oz".
 */
export default function FeedStats24() {
  const events = useAppStore((s) => s.events);
  const activeId = useAppStore((s) => s.activeChildId);
  const units = useSettings((s) => s.units);

  const stats = useMemo(() => {
    const cutoff = Date.now() - 24 * HOUR_MS;
    const feeds = events.filter(
      (e) =>
        e.child_id === activeId &&
        !e.deleted &&
        e.type === 'feed' &&
        new Date(e.start_time).getTime() >= cutoff,
    );
    if (feeds.length === 0) return null;
    return {
      bottleMl: feeds.reduce((a, e) => a + (e.bottle_ml ?? 0), 0),
      nursingMin: feeds.reduce((a, e) => (e.feed_method === 'nursing' ? a + nursingMinutes(e) : a), 0),
      pumpMl: feeds.reduce((a, e) => a + (e.pump_ml ?? 0), 0),
    };
  }, [events, activeId]);

  if (!stats) return null;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="card p-3">
        <Milk size={18} className="text-emerald-500 dark:text-emerald-400" />
        <p className="mt-1.5 text-lg font-bold leading-none text-slate-800 dark:text-slate-100">
          {fmtVolume(stats.bottleMl, units)}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Bottle · 24h</p>
      </div>
      <div className="card p-3">
        <Heart size={18} className="text-rose-500 dark:text-rose-400" />
        <p className="mt-1.5 text-lg font-bold leading-none text-slate-800 dark:text-slate-100">
          {fmtDur(stats.nursingMin)}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Nursing · 24h</p>
      </div>
      <div className="card p-3">
        <Droplets size={18} className="text-sky-500 dark:text-sky-400" />
        <p className="mt-1.5 text-lg font-bold leading-none text-slate-800 dark:text-slate-100">
          {fmtVolume(stats.pumpMl, units)}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pumped · 24h</p>
      </div>
    </div>
  );
}
