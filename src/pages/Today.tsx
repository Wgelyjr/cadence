import { useState } from 'react';
import { startOfDay } from 'date-fns';
import { Plus } from 'lucide-react';
import EditEventModal from '../components/EditEventModal';
import EventCard from '../components/EventCard';
import SummaryStats from '../components/SummaryStats';
import SweetSpotCard from '../components/SweetSpotCard';
import { useAppStore } from '../lib/store';
import type { CareEvent } from '../lib/types';

interface Props {
  goToLog: () => void;
}

export default function Today({ goToLog }: Props) {
  const events = useAppStore((s) => s.events);
  const activeId = useAppStore((s) => s.activeChildId);
  const removeEvent = useAppStore((s) => s.removeEvent);
  const [editing, setEditing] = useState<CareEvent | null>(null);

  const start = startOfDay(new Date());
  const today = events
    .filter(
      (e) => e.child_id === activeId && !e.deleted && new Date(e.start_time) >= start,
    )
    .sort((a, b) => b.start_time.localeCompare(a.start_time));

  return (
    <div className="animate-fade-in space-y-4">
      <SummaryStats />
      <SweetSpotCard />

      <button onClick={goToLog} className="btn-primary w-full">
        <Plus size={16} /> Log something
      </button>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Today</h2>
        <div className="space-y-2">
          {today.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
              Nothing logged yet today.
            </p>
          ) : (
            today.map((e) => (
              <EventCard key={e.id} event={e} onDelete={removeEvent} onEdit={setEditing} />
            ))
          )}
        </div>
      </section>

      <EditEventModal event={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
