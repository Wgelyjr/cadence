import { useState } from 'react';
import { CheckCircle2, FileUp, Upload } from 'lucide-react';
import Modal from './Modal';
import { useAppStore } from '../lib/store';
import { parseHuckleberry, type HuckleberryParse } from '../lib/huckleberry';
import { EVENT_TYPE_META, type CareEvent, type EventType } from '../lib/types';
import { fmtLength, fmtVolume, fmtWeight } from '../lib/units';
import { useSettings, type Units } from '../lib/settings';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Step = 'pick' | 'preview' | 'done';

/** Human summary of one mapped row, for the preview table. */
function describeRow(ev: Partial<CareEvent>, units: Units): string {
  switch (ev.type) {
    case 'sleep':
      return ev.sleep_kind === 'night' ? 'Night sleep' : ev.sleep_kind === 'nap' ? 'Nap' : 'Sleep';
    case 'feed': {
      let head = 'Feed';
      if (ev.feed_method === 'bottle')
        head = ev.bottle_ml != null ? `Bottle · ${fmtVolume(ev.bottle_ml, units)}` : 'Bottle';
      else if (ev.feed_method === 'pump')
        head = ev.pump_ml != null ? `Pump · ${fmtVolume(ev.pump_ml, units)}` : 'Pump';
      else if (ev.feed_method === 'nursing') head = 'Breastfeed';
      return ev.note ? `${head} · ${ev.note}` : head;
    }
    case 'diaper':
      return ev.diaper_type ? ev.diaper_type[0].toUpperCase() + ev.diaper_type.slice(1) : 'Diaper';
    case 'growth': {
      const bits: string[] = [];
      if (ev.weight_kg != null) bits.push(fmtWeight(ev.weight_kg, units));
      if (ev.height_cm != null) bits.push(fmtLength(ev.height_cm, units));
      if (ev.head_cm != null) bits.push(`head ${fmtLength(ev.head_cm, units)}`);
      return bits.length ? bits.join(' · ') : 'Growth';
    }
    default:
      return ev.note ?? '';
  }
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDayTime = (iso: string) =>
  new Date(iso).toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function ImportModal({ open, onClose }: Props) {
  const children = useAppStore((s) => s.children);
  const activeChildId = useAppStore((s) => s.activeChildId);
  const importEvents = useAppStore((s) => s.importEvents);
  const units = useSettings((s) => s.units);

  const [step, setStep] = useState<Step>('pick');
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [parse, setParse] = useState<HuckleberryParse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);

  const live = children.filter((c) => !c.deleted);
  const target = live.find((c) => c.id === targetId) ?? live.find((c) => c.id === activeChildId) ?? live[0];

  function reset() {
    setStep('pick');
    setFileName('');
    setReading(false);
    setParse(null);
    setError(null);
    setBusy(false);
    setResult(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function onFile(file: File | undefined) {
    if (!file || reading) return;
    setError(null);
    setFileName(file.name);
    setReading(true);
    try {
      const text = await file.text();
      const p = parseHuckleberry(text);
      if (!p.ok) {
        const first = p.rows.find((r) => r.error);
        setError(
          `No events could be read from this file${first?.error ? ` — ${first.error}` : ''}. ` +
            'Check that it is a Huckleberry CSV export.',
        );
      } else {
        setParse(p);
        setStep('preview');
      }
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setReading(false);
    }
  }

  async function doImport() {
    if (!parse || !target || busy) return;
    setBusy(true);
    const res = await importEvents(
      target.id,
      parse.rows.filter((r) => r.event).map((r) => r.event!),
    );
    setBusy(false);
    setResult(res);
    setStep('done');
  }

  const typeCounts = parse
    ? (Object.entries(parse.counts) as [EventType, number][]).sort((a, b) => b[1] - a[1])
    : [];
  const errors = parse?.rows.filter((r) => r.error).slice(0, 4) ?? [];
  const samples = parse?.rows.filter((r) => r.event).slice(0, 6) ?? [];

  return (
    <Modal open={open} title="Import from Huckleberry" onClose={close}>
      {step === 'pick' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Bring in events from a Huckleberry CSV export — one file per child. You&apos;ll get a
            preview before anything is saved.
          </p>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 px-4 py-8 text-center transition hover:border-brand-300 hover:bg-brand-50/40 dark:border-slate-700 dark:hover:border-brand-600 dark:hover:bg-brand-950/30">
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={reading}
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.currentTarget.value = '';
              }}
            />
            <FileUp size={24} className="text-brand-500" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {reading ? 'Reading file…' : 'Choose a CSV file'}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Huckleberry → Profile → Export → CSV
            </span>
          </label>
          {error && (
            <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-600 dark:bg-red-950/60 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      )}

      {step === 'preview' && parse && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Found <strong>{parse.ok}</strong> events
            {parse.range && (
              <>
                {' '}
                from <strong>{fmtDay(parse.range[0])}</strong> to{' '}
                <strong>{fmtDay(parse.range[1])}</strong>
              </>
            )}
            {fileName && (
              <span className="text-slate-400 dark:text-slate-500"> · {fileName}</span>
            )}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {typeCounts.map(([t, n]) => (
              <span key={t} className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {n} {EVENT_TYPE_META[t].label}
              </span>
            ))}
          </div>

          <div>
            <label className="label">Import into</label>
            <select className="field" value={target?.id ?? ''} onChange={(e) => setTargetId(e.target.value)}>
              {live.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {samples.length > 0 && (
            <div className="overflow-hidden rounded-xl ring-1 ring-slate-200 dark:ring-slate-700">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <th className="px-3 py-1.5 font-semibold">When</th>
                    <th className="px-3 py-1.5 font-semibold">Entry</th>
                  </tr>
                </thead>
                <tbody>
                  {samples.map((r) => (
                    <tr key={r.line} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="whitespace-nowrap px-3 py-1.5 text-slate-500 dark:text-slate-400">
                        {fmtDayTime(r.event!.start_time!)}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">
                        {describeRow(r.event!, units)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {parse.failed > 0 && (
            <div className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
              <p className="font-semibold">{parse.failed} row{parse.failed > 1 ? 's' : ''} skipped:</p>
              <ul className="mt-1 list-disc pl-4">
                {errors.map((r) => (
                  <li key={r.line}>
                    Line {r.line}: {r.error}
                  </li>
                ))}
                {parse.failed > errors.length && <li>…and {parse.failed - errors.length} more</li>}
              </ul>
            </div>
          )}

          <p className="text-xs text-slate-400 dark:text-slate-500">
            Times are read in this device&apos;s timezone; values without a unit are assumed
            metric. Rows matching existing entries are skipped, so importing twice is safe.
          </p>

          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary flex-1" onClick={() => void doImport()} disabled={busy || !target}>
              <Upload size={15} /> {busy ? 'Importing…' : `Import ${parse.ok} events`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 size={36} className="text-emerald-500" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Imported {result.added} event{result.added === 1 ? '' : 's'}
              {target && ` for ${target.name}`}
            </p>
            {result.skipped > 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {result.skipped} duplicate row{result.skipped > 1 ? 's' : ''} skipped
              </p>
            )}
          </div>
          <button className="btn-primary w-full" onClick={close}>
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}
