import { useState } from 'react';
import { useAppStore } from '../lib/store';

const PALETTE = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

/** Form to add a new child profile. */
export default function AddChildForm({ onDone }: { onDone: () => void }) {
  const addChild = useAppStore((s) => s.addChild);
  const [name, setName] = useState('');
  const [birth_date, setBirthDate] = useState('');
  const [birth_time, setBirthTime] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !birth_date || busy) return;
    setBusy(true);
    await addChild({
      name: name.trim(),
      birth_date,
      birth_time: birth_time || undefined,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    });
    setBusy(false);
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-slate-50 p-3">
      <div>
        <label className="label">Name</label>
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Maya"
          autoFocus
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Birth date</label>
          <input
            type="date"
            className="field"
            value={birth_date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setBirthDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Time (opt.)</label>
          <input
            type="time"
            className="field"
            value={birth_time}
            onChange={(e) => setBirthTime(e.target.value)}
          />
        </div>
      </div>
      <button type="submit" className="btn-primary w-full" disabled={!name.trim() || !birth_date || busy}>
        {busy ? 'Adding…' : 'Add child'}
      </button>
    </form>
  );
}
