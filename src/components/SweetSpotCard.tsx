import { BedDouble, Moon } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { computeSweetSpot, fmtWindow, napStatus } from '../lib/sweetSpot';

const STATUS: Record<string, { label: string; cls: string }> = {
  early: { label: 'Before window', cls: 'bg-slate-100 text-slate-500' },
  'in-window': { label: 'Nap window now', cls: 'bg-emerald-50 text-emerald-600' },
  past: { label: 'Past window', cls: 'bg-amber-50 text-amber-600' },
  asleep: { label: 'Asleep now', cls: 'bg-brand-50 text-brand-600' },
};

function minsLabel(mins: number): string {
  if (mins < 0) return `in ${Math.abs(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `in ${h}h ${m}m` : `in ${m}m`;
}

export default function SweetSpotCard() {
  const children = useAppStore((s) => s.children);
  const events = useAppStore((s) => s.events);
  const activeId = useAppStore((s) => s.activeChildId);
  const child = children.find((c) => c.id === activeId && !c.deleted);
  if (!child) return null;

  const now = new Date();
  const spot = computeSweetSpot(child, events, now);
  const status = STATUS[napStatus(spot, now)];
  const tiredPct = Math.round(Math.min(1, spot.tiredness) * 100);

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Moon size={16} className="text-brand-600" /> SweetSpot
        </h2>
        <span className={`chip ${status.cls}`}>{status.label}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-brand-50 p-3">
          <p className="text-xs font-medium text-brand-500">Next nap</p>
          <p className="mt-0.5 text-sm font-semibold text-brand-800">
            {fmtWindow(spot.nextNapStart, spot.nextNapLatest)}
          </p>
          <p className="text-xs text-brand-500">{minsLabel(spot.minutesToNap)}</p>
        </div>
        <div className="rounded-xl bg-indigo-50 p-3">
          <p className="flex items-center gap-1 text-xs font-medium text-indigo-500">
            <BedDouble size={12} /> Bedtime
          </p>
          <p className="mt-0.5 text-sm font-semibold text-indigo-800">
            {fmtWindow(spot.bedtimeStart, spot.bedtimeLatest)}
          </p>
          <p className="text-xs text-indigo-500">{minsLabel(spot.minutesToBed)}</p>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
          <span>Tiredness</span>
          <span>{tiredPct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-300 to-brand-600 transition-all"
            style={{ width: `${tiredPct}%` }}
          />
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        {spot.napsPerDay} nap{spot.napsPerDay > 1 ? 's' : ''} · wake window{' '}
        {spot.wakeWindow[0]}–{spot.wakeWindow[1]} min. A starting point, not medical advice.
      </p>
    </section>
  );
}
