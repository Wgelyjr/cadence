import { addDays, format } from 'date-fns';
import type { BuiltinEventType, CareEvent } from '../lib/types';
import { useSettings } from '../lib/settings';
import { eventSummary } from './EventCard';

/** Dot/bar colors per type, shared with the History filter chips. */
export const TYPE_COLOR: Record<BuiltinEventType, string> = {
  sleep: '#818cf8', // brand-400
  feed: '#10b981', // emerald-500
  diaper: '#0ea5e9', // sky-500
  growth: '#8b5cf6', // violet-500
  health: '#f43f5e', // rose-500
  milestone: '#f59e0b', // amber-500
  solid_food: '#65a30d', // lime-600
  allergy: '#f97316', // orange-500
  contraction: '#64748b', // slate-500
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOURS = [
  { h: 0, label: '12a' },
  { h: 6, label: '6a' },
  { h: 12, label: '12p' },
  { h: 18, label: '6p' },
];

interface Props {
  /** Events to draw (already filtered to the child and, if wanted, the type). */
  events: CareEvent[];
  /** 00:00 of the first day of the 7-day window to show. */
  weekStart: Date;
  /** Custom type id → color (events only carry the type id, not the color). */
  customColors: Record<string, string>;
  selectedId: string | null;
  onSelect: (e: CareEvent) => void;
}

export default function WeekChart({ events, weekStart, customColors, selectedId, onSelect }: Props) {
  const units = useSettings((s) => s.units);
  const weekEnd = addDays(weekStart, 7);
  const now = new Date();
  const nowInWeek = now >= weekStart && now < weekEnd;

  const pct = (t: number, dayStart: number) =>
    Math.min(100, Math.max(0, ((t - dayStart) / DAY_MS) * 100));

  return (
    <div>
      {/* Time axis */}
      <div className="flex">
        <div className="w-11 shrink-0" />
        <div className="relative h-4 flex-1">
          {HOURS.map(({ h, label }) => (
            <span
              key={h}
              className="absolute -translate-x-1/2 text-[10px] tabular-nums text-slate-400 dark:text-slate-500 first:translate-x-0"
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {events.length === 0 ? (
        <p className="rounded-lg bg-slate-50 py-6 text-center text-xs text-slate-400 dark:bg-slate-800/60 dark:text-slate-500">
          Nothing logged in the last 7 days.
        </p>
      ) : (
        <div className="space-y-1">
          {Array.from({ length: 7 }, (_, i) => {
            const day = addDays(weekStart, i);
            const dayStart = day.getTime();
            const dayEnd = dayStart + DAY_MS;
            const isToday = day.getTime() <= now.getTime() && now.getTime() < dayEnd;
            const dayEvents = events.filter((e) => {
              const t = new Date(e.start_time).getTime();
              return t >= dayStart && t < dayEnd;
            });

            return (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-11 shrink-0 text-right">
                  <p
                    className={`text-[10px] font-semibold ${
                      isToday
                        ? 'text-brand-600 dark:text-brand-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {format(day, 'EEE')}
                  </p>
                  <p className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                    {format(day, 'd')}
                  </p>
                </div>
                <div
                  className={`relative h-8 flex-1 overflow-hidden rounded-md ${
                    isToday
                      ? 'bg-brand-50 dark:bg-brand-950/50'
                      : 'bg-slate-50 dark:bg-slate-800/60'
                  }`}
                >
                  {/* Hour gridlines */}
                  {[6, 12, 18].map((h) => (
                    <span
                      key={h}
                      className="absolute inset-y-0 w-px bg-slate-200/70 dark:bg-slate-700/50"
                      style={{ left: `${(h / 24) * 100}%` }}
                    />
                  ))}
                  {/* Now marker */}
                  {isToday && nowInWeek && (
                    <span
                      className="absolute inset-y-0 w-px bg-rose-400/80"
                      style={{ left: `${pct(now.getTime(), dayStart)}%` }}
                    />
                  )}
                  {dayEvents.map((e) => {
                    const t = new Date(e.start_time).getTime();
                    const endT = e.end_time ? new Date(e.end_time).getTime() : null;
                    const isSleep = e.type === 'sleep';
                    const selected = e.id === selectedId;
                    const title = `${format(new Date(e.start_time), 'h:mm a')} · ${eventSummary(e, units)}`;
                    if (isSleep) {
                      // Bar from sleep start to end (ongoing sleeps run to now),
                      // clipped to this day.
                      const end = endT ?? now.getTime();
                      const lo = Math.max(t, dayStart);
                      const hi = Math.min(end, dayEnd);
                      if (hi <= lo) return null;
                      const left = pct(lo, dayStart);
                      const width = pct(hi, dayStart) - left;
                      return (
                        <button
                          key={e.id}
                          type="button"
                          title={title}
                          onClick={() => onSelect(e)}
                          className={`absolute top-1/2 h-3 -translate-y-1/2 rounded-full transition ${
                            selected
                              ? 'ring-2 ring-rose-400 dark:ring-rose-500'
                              : ''
                          }`}
                          style={{
                            left: `${left}%`,
                            width: `max(${width}%, 3px)`,
                            background: TYPE_COLOR.sleep,
                            opacity: 0.75,
                          }}
                          aria-label={title}
                        />
                      );
                    }
                    // Point event: a dot at its start time. Feed sits on the
                    // upper lane, everything else on the lower one, so a feed
                    // and a diaper at the same time don't hide each other.
                    const laneTop = e.type === 'feed' ? '22%' : '60%';
                    return (
                      <button
                        key={e.id}
                        type="button"
                        title={title}
                        onClick={() => onSelect(e)}
                        className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-white/70 transition dark:ring-slate-900/70 ${
                          selected ? 'scale-125 ring-2 ring-rose-400 dark:ring-rose-500' : ''
                        }`}
                        style={{
                          left: `${pct(t, dayStart)}%`,
                          top: laneTop,
                          background:
                            e.type === 'custom'
                              ? (customColors[e.custom_type_id ?? ''] ?? '#64748b')
                              : TYPE_COLOR[e.type as BuiltinEventType] ?? '#64748b',
                        }}
                        aria-label={title}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
