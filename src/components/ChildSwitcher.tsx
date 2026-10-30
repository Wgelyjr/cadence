import { useState } from 'react';
import { ChevronDown, UserPlus } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { ageLabel } from '../lib/utils';
import Modal from './Modal';
import AddChildForm from './AddChildForm';

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export default function ChildSwitcher() {
  const children = useAppStore((s) => s.children);
  const activeChildId = useAppStore((s) => s.activeChildId);
  const setActiveChild = useAppStore((s) => s.setActiveChild);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const live = children.filter((c) => !c.deleted);
  const active = live.find((c) => c.id === activeChildId) ?? live[0];
  if (!active) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-slate-100"
      >
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ background: active.color ?? '#4f46e5' }}
        >
          {initials(active.name)}
        </span>
        <span className="text-left">
          <span className="block text-sm font-semibold leading-tight text-slate-800">
            {active.name}
          </span>
          <span className="block text-xs text-slate-500">{ageLabel(active.birth_date)}</span>
        </span>
        <ChevronDown size={16} className="text-slate-400" />
      </button>

      <Modal
        open={open}
        title="Children"
        onClose={() => {
          setOpen(false);
          setAdding(false);
        }}
      >
        <div className="space-y-2">
          {live.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setActiveChild(c.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                c.id === active.id ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: c.color ?? '#4f46e5' }}
              >
                {initials(c.name)}
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-800">{c.name}</span>
                <span className="block text-xs text-slate-500">{ageLabel(c.birth_date)}</span>
              </span>
            </button>
          ))}

          {!adding ? (
            <button className="btn-ghost w-full" onClick={() => setAdding(true)}>
              <UserPlus size={16} /> Add child
            </button>
          ) : (
            <AddChildForm
              onDone={() => {
                setOpen(false);
                setAdding(false);
              }}
            />
          )}
        </div>
      </Modal>
    </>
  );
}
