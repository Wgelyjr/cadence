import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, isSameYear, startOfDay, subDays } from 'date-fns';
import { X } from 'lucide-react';
import EditEventModal from '../components/EditEventModal';
import EventCard from '../components/EventCard';
import { CustomTypeIcon } from '../components/CustomTypeIcon';
import FeedStats24 from '../components/FeedStats24';
import WeekChart, { TYPE_COLOR } from '../components/WeekChart';
import { useAppStore } from '../lib/store';
import { useSettings, visiblePickerIds } from '../lib/settings';
import { EVENT_TYPE_META } from '../lib/types';
import type { BuiltinEventType, CareEvent } from '../lib/types';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** How many cards to mount per batch of the full-history list. */
const LIST_CHUNK = 50;

/** Filter key for an event: its built-in type id, or the custom type id. */
function typeKey(e: CareEvent): string {
  return e.type === 'custom' ? e.custom_type_id ?? 'custom' : e.type;
}

function Chip({
  label,
  color,
  icon,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  /** Custom-type icon name; replaces the color dot when present. */
  icon?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? 'border-transparent text-white'
          : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300'
      }`}
      style={active ? { background: color ?? '#4f46e5' } : undefined}
    >
      {icon ? (
        <CustomTypeIcon icon={icon} size={12} style={{ color: active ? '#fff' : color }} />
      ) : color ? (
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: active ? 'rgba(255,255,255,0.9)' : color }}
        />
      ) : null}
      {label}
    </button>
  );
}

export default function Timeline() {
  const events = useAppStore((s) => s.events);
  const activeId = useAppStore((s) => s.activeChildId);
  const removeEvent = useAppStore((s) => s.removeEvent);
  const logOrder = useSettings((s) => s.logOrder);
  const hiddenTypes = useSettings((s) => s.hiddenTypes);
  const customTypes = useSettings((s) => s.customTypes);

  // Sliding 7-day window ending today. Keyed on the calendar day so the
  // value is stable across renders but refreshes at midnight.
  const dayKey = format(new Date(), 'yyyy-MM-dd');
  const windowStart = useMemo(() => subDays(startOfDay(new Date()), 6), [dayKey]);
  const windowEnd = addDays(windowStart, 6);
  const [filter, setFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CareEvent | null>(null);

  // The full list is one card per entry (~1k+). Mounting it all at once
  // freezes the tab, so the chart, chips and header paint first (next frame)
  // and the cards mount in small batches: the initial batch right away, then
  // more as the user scrolls toward the bottom.
  const [listReady, setListReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setListReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const [shown, setShown] = useState(LIST_CHUNK);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const customById = useMemo(() => new Map(customTypes.map((c) => [c.id, c])), [customTypes]);
  const customColors = useMemo(
    () => Object.fromEntries(customTypes.map((c) => [c.id, c.color])),
    [customTypes],
  );

  const mine = useMemo(
    () =>
      events
        .filter((e) => e.child_id === activeId && !e.deleted)
        .sort((a, b) => b.start_time.localeCompare(a.start_time)),
    [events, activeId],
  );

  const weekEvents = useMemo(() => {
    const start = windowStart.getTime();
    const end = start + MS_PER_WEEK;
    return mine.filter((e) => {
      const t = new Date(e.start_time).getTime();
      return t >= start && t < end && (filter === 'all' || typeKey(e) === filter);
    });
  }, [mine, windowStart, filter]);

  const listEvents = filter === 'all' ? mine : mine.filter((e) => typeKey(e) === filter);

  const selected = selectedId ? (mine.find((e) => e.id === selectedId) ?? null) : null;

  function chipLabel(id: string): string {
    return EVENT_TYPE_META[id as BuiltinEventType]?.label ?? customById.get(id)?.label ?? 'Custom';
  }

  function chipColor(id: string): string | undefined {
    return TYPE_COLOR[id as BuiltinEventType] ?? customById.get(id)?.color;
  }

  function handleDelete(id: string) {
    removeEvent(id);
    if (selectedId === id) setSelectedId(null);
  }

  // Full-history list, grouped by day (newest first), filtered by the chips.
  const groups: Array<{ date: string; items: CareEvent[] }> = [];
  for (const e of listEvents) {
    const d = format(new Date(e.start_time), 'yyyy-MM-dd');
    let g = groups.find((x) => x.date === d);
    if (!g) {
      g = { date: d, items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }

  // Only the first `shown` cards (in newest-first order) are mounted; the rest
  // appear when the sentinel near the bottom comes close to the viewport.
  const allShown = shown >= listEvents.length;
  const shownGroups: Array<{ date: string; items: CareEvent[] }> = [];
  let remaining = shown;
  for (const g of groups) {
    if (remaining <= 0) break;
    const items = g.items.length > remaining ? g.items.slice(0, remaining) : g.items;
    shownGroups.push({ date: g.date, items });
    remaining -= items.length;
  }

  useEffect(() => {
    setShown(LIST_CHUNK);
  }, [filter]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || allShown) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown((s) => s + LIST_CHUNK);
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [listReady, allShown, shown]);

  return (
    <div className="animate-fade-in space-y-4">
      <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">History</h1>

      {/* Sliding window: always the 7 days ending today. */}
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        Last 7 days
        <span className="ml-1.5 font-normal text-slate-400 dark:text-slate-500">
          · {format(windowStart, 'MMM d')} –{' '}
          {format(windowEnd, isSameYear(windowStart, windowEnd) ? 'MMM d' : 'MMM d, yyyy')}
        </span>
      </p>

      {/* Type filter chips */}
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        <Chip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
        {visiblePickerIds({ logOrder, hiddenTypes }).map((id) => (
          <Chip
            key={id}
            label={chipLabel(id)}
            color={chipColor(id)}
            icon={customById.get(id)?.icon}
            active={filter === id}
            onClick={() => setFilter(filter === id ? 'all' : id)}
          />
        ))}
      </div>

      {/* Feeding totals for the last 24 hours (hidden when nothing fed) */}
      <FeedStats24 />

      {/* Week chart */}
      <div className="rounded-xl bg-white p-3 shadow-card dark:bg-slate-900">
        <WeekChart
          events={weekEvents}
          weekStart={windowStart}
          customColors={customColors}
          selectedId={selectedId}
          onSelect={(e) => setSelectedId(e.id === selectedId ? null : e.id)}
        />
      </div>

      {/* Selected entry details */}
      {selected && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Selected
            </h2>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Close details"
              className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <X size={16} />
            </button>
          </div>
          <EventCard event={selected} onDelete={handleDelete} onEdit={setEditing} />
        </section>
      )}

      {/* Full history, filtered by the same type filter */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          All entries
        </h2>
        {groups.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            {filter === 'all' ? 'No entries yet.' : 'No entries of this type.'}
          </p>
        )}
        {listReady &&
          shownGroups.map((g) => (
            <div key={g.date} className="mb-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {format(new Date(g.date), 'EEEE, MMM d')}
              </h3>
              <div className="space-y-2">
                {g.items.map((e) => (
                  <EventCard key={e.id} event={e} onDelete={removeEvent} onEdit={setEditing} />
                ))}
              </div>
            </div>
          ))}
        {/* Grows the list by another batch as this gets near the viewport. */}
        {listReady && !allShown && <div ref={sentinelRef} className="h-8" aria-hidden />}
      </section>

      <EditEventModal event={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
