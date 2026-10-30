import { format } from 'date-fns';
import EventCard from '../components/EventCard';
import { useAppStore } from '../lib/store';
import type { CareEvent } from '../lib/types';

export default function Timeline() {
  const events = useAppStore((s) => s.events);
  const activeId = useAppStore((s) => s.activeChildId);
  const removeEvent = useAppStore((s) => s.removeEvent);

  const mine = events
    .filter((e) => e.child_id === activeId && !e.deleted)
    .sort((a, b) => b.start_time.localeCompare(a.start_time));

  const groups: Array<{ date: string; items: CareEvent[] }> = [];
  for (const e of mine) {
    const d = format(new Date(e.start_time), 'yyyy-MM-dd');
    let g = groups.find((x) => x.date === d);
    if (!g) {
      g = { date: d, items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }

  return (
    <div className="animate-fade-in space-y-4">
      <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">History</h1>

      {groups.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
          No entries yet.
        </p>
      )}

      {groups.map((g) => (
        <section key={g.date}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {format(new Date(g.date), 'EEEE, MMM d')}
          </h2>
          <div className="space-y-2">
            {g.items.map((e) => (
              <EventCard key={e.id} event={e} onDelete={removeEvent} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
