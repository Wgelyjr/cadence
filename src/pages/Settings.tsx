import { useEffect, useState } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Cloud,
  Download,
  Eye,
  EyeOff,
  List,
  LogOut,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import ImportModal from '../components/ImportModal';
import Modal from '../components/Modal';
import { isSupabaseConfigured } from '../lib/config';
import { getSupabase } from '../lib/supabase';
import { useAppStore } from '../lib/store';
import { useSettings, type Theme, type Units } from '../lib/settings';
import type { Child, EventType } from '../lib/types';
import { BUILTIN_EVENT_TYPES, EVENT_TYPE_META } from '../lib/types';
import { ageLabel, exportCSV, exportJSON } from '../lib/utils';
import { PALETTE } from '../components/AddChildForm';
import { initials } from '../components/ChildSwitcher';

// ---------------------------------------------------------------------------
// Sync / auth
// ---------------------------------------------------------------------------

function SignInModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error } =
        mode === 'signin'
          ? await sb.auth.signInWithPassword({ email, password })
          : await sb.auth.signUp({ email, password });
      if (error) setError(error.message);
      else onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={mode === 'signin' ? 'Sign in' : 'Create account'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex gap-1.5">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ${
                mode === m
                  ? 'bg-brand-600 text-white ring-brand-600'
                  : 'bg-white text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'
              }`}
            >
              {m === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Password</label>
          <input type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          Signing in lets BabyApp sync across your devices and caregivers.
        </p>
      </form>
    </Modal>
  );
}

function SyncCard() {
  const syncState = useAppStore((s) => s.syncState);
  const syncError = useAppStore((s) => s.syncError);
  const lastSyncAt = useAppStore((s) => s.lastSyncAt);
  const sync = useAppStore((s) => s.sync);
  const [signIn, setSignIn] = useState(false);
  const [user, setUser] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <Card title="Sync" icon={<Cloud size={16} />}>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Running in <strong>local-only</strong> mode — data stays on this device. To sync
          across devices and caregivers, set <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">VITE_SUPABASE_URL</code>{' '}
          and <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">VITE_SUPABASE_ANON_KEY</code> and rebuild.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Sync" icon={<Cloud size={16} />}>
      <div className="space-y-3">
        {user ? (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                {user.email}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {lastSyncAt ? `Last sync ${new Date(lastSyncAt).toLocaleTimeString()}` : 'Not synced yet'}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost px-3 py-2" onClick={() => void sync()} disabled={syncState === 'syncing'}>
                <RefreshCw size={15} className={syncState === 'syncing' ? 'animate-spin' : ''} /> Sync
              </button>
              <button
                className="btn-ghost px-3 py-2"
                onClick={() => void getSupabase()!.auth.signOut()}
                title="Sign out"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-primary w-full" onClick={() => setSignIn(true)}>
            Sign in to sync
          </button>
        )}
        {syncError && syncState === 'error' && (
          <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600 dark:bg-red-950/60 dark:text-red-400">
            {syncError}
          </p>
        )}
      </div>
      <SignInModal open={signIn} onClose={() => setSignIn(false)} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Appearance & units
// ---------------------------------------------------------------------------

function PreferencesCard() {
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const units = useSettings((s) => s.units);
  const setUnits = useSettings((s) => s.setUnits);

  return (
    <Card title="Appearance & units" icon={<Palette size={16} />}>
      <div className="space-y-3">
        <div>
          <label className="label">Theme</label>
          <div className="flex gap-1.5">
            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium capitalize ring-1 transition ${
                  theme === t
                    ? 'bg-brand-600 text-white ring-brand-600'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Units</label>
          <div className="flex gap-1.5">
            {(
              [
                { value: 'metric', label: 'Metric', sub: 'ml · kg · cm · °C' },
                { value: 'imperial', label: 'US', sub: 'oz · lb · in · °F' },
              ] as { value: Units; label: string; sub: string }[]
            ).map((u) => (
              <button
                key={u.value}
                type="button"
                onClick={() => setUnits(u.value)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-left ring-1 transition ${
                  units === u.value
                    ? 'bg-brand-600 text-white ring-brand-600'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                <span className="block text-sm font-medium">{u.label}</span>
                <span
                  className={`block text-[11px] ${
                    units === u.value ? 'text-brand-100' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {u.sub}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Custom event types
// ---------------------------------------------------------------------------

function CustomEventsCard() {
  const customTypes = useSettings((s) => s.customTypes);
  const addCustomType = useSettings((s) => s.addCustomType);
  const removeCustomType = useSettings((s) => s.removeCustomType);
  const updateCustomType = useSettings((s) => s.updateCustomType);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState(PALETTE[0]);

  return (
    <Card title="Custom events" icon={<Plus size={16} />}>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Define your own event types — e.g. vitamins, tummy time, medication.
      </p>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          addCustomType(label, color);
          setLabel('');
        }}
      >
        <div className="flex gap-2">
          <input
            className="field"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Vitamins"
            maxLength={24}
          />
          <button type="submit" className="btn-primary shrink-0 px-3" disabled={!label.trim()}>
            <Plus size={16} /> Add
          </button>
        </div>
        <div className="flex gap-1.5">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full transition ${
                color === c ? 'ring-2 ring-brand-500 ring-offset-2 dark:ring-offset-slate-900' : ''
              }`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </form>

      {customTypes.length > 0 && (
        <div className="mt-3 space-y-1">
          {customTypes.map((t) =>
            editingId === t.id ? (
              <div key={t.id} className="space-y-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                <input
                  className="field"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  maxLength={24}
                  autoFocus
                  aria-label={`Rename ${t.label}`}
                />
                <div className="flex items-center gap-1.5">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      className={`h-5 w-5 rounded-full transition ${
                        editColor === c ? 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-slate-900' : ''
                      }`}
                      style={{ background: c }}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                  <span className="flex-1" />
                  <button
                    type="button"
                    className="btn-primary px-3 py-1.5 text-xs"
                    disabled={!editLabel.trim()}
                    onClick={() => {
                      updateCustomType(t.id, editLabel, editColor);
                      setEditingId(null);
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-700/60"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.color }} />
                <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                  {t.label}
                </span>
                <button
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                  onClick={() => {
                    setEditingId(t.id);
                    setEditLabel(t.label);
                    setEditColor(t.color);
                  }}
                  aria-label={`Edit ${t.label}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/60 dark:hover:text-red-400"
                  onClick={() => removeCustomType(t.id)}
                  aria-label={`Delete ${t.label}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ),
          )}
          <p className="px-2 pt-1 text-[11px] text-slate-400 dark:text-slate-500">
            Renaming a type only affects new entries; deleting keeps its logged entries.
          </p>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Log display (which types show up, in what order)
// ---------------------------------------------------------------------------

function LogDisplayCard() {
  const logOrder = useSettings((s) => s.logOrder);
  const hiddenTypes = useSettings((s) => s.hiddenTypes);
  const customTypes = useSettings((s) => s.customTypes);
  const moveLogType = useSettings((s) => s.moveLogType);
  const toggleHiddenType = useSettings((s) => s.toggleHiddenType);
  const customById = new Map(customTypes.map((c) => [c.id, c]));

  return (
    <Card title="Log entries" icon={<List size={16} />}>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Choose which types appear on the Log screen and in what order.
      </p>
      <div className="space-y-0.5">
        {logOrder.map((id, i) => {
          const custom = customById.get(id);
          const label = custom ? custom.label : EVENT_TYPE_META[id as EventType].label;
          const hidden = hiddenTypes.includes(id);
          return (
            <div
              key={id}
              className={`flex items-center gap-1.5 rounded-lg px-1 py-1 ${
                hidden ? 'opacity-45' : ''
              }`}
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => moveLogType(id, -1)}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                  aria-label={`Move ${label} up`}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  disabled={i === logOrder.length - 1}
                  onClick={() => moveLogType(id, 1)}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                  aria-label={`Move ${label} down`}
                >
                  <ChevronDown size={14} />
                </button>
              </div>
              {custom ? (
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: custom.color }} />
              ) : (
                <span className="h-3 w-3 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700" />
              )}
              <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                {label}
              </span>
              <button
                type="button"
                onClick={() => toggleHiddenType(id)}
                className={`rounded-lg p-1.5 ${
                  hidden
                    ? 'text-slate-400 dark:text-slate-500'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
                aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
              >
                {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Home Rhythm entries (which "last…" entries show, in what order)
// ---------------------------------------------------------------------------

function RhythmEntriesCard() {
  const rhythmOrder = useSettings((s) => s.rhythmOrder);
  const customTypes = useSettings((s) => s.customTypes);
  const addRhythmEntry = useSettings((s) => s.addRhythmEntry);
  const removeRhythmEntry = useSettings((s) => s.removeRhythmEntry);
  const moveRhythmEntry = useSettings((s) => s.moveRhythmEntry);
  const customById = new Map(customTypes.map((c) => [c.id, c]));
  const labelFor = (id: string) => customById.get(id)?.label ?? EVENT_TYPE_META[id as EventType].label;
  const available = [...BUILTIN_EVENT_TYPES, ...customTypes.map((c) => c.id)].filter(
    (id) => !rhythmOrder.includes(id),
  );

  return (
    <Card title="Rhythm entries" icon={<Activity size={16} />}>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Choose which “when was the last…” entries appear on the home screen and in what order.
      </p>
      {rhythmOrder.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          No entries — the home Rhythm card is hidden. Add one below.
        </p>
      ) : (
        <div className="space-y-0.5">
          {rhythmOrder.map((id, i) => {
            const custom = customById.get(id);
            const label = labelFor(id);
            return (
              <div key={id} className="flex items-center gap-1.5 rounded-lg px-1 py-1">
                <div className="flex flex-col">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => moveRhythmEntry(id, -1)}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                    aria-label={`Move ${label} up`}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={i === rhythmOrder.length - 1}
                    onClick={() => moveRhythmEntry(id, 1)}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                    aria-label={`Move ${label} down`}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                {custom ? (
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: custom.color }} />
                ) : (
                  <span className="h-3 w-3 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700" />
                )}
                <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                  {label}
                </span>
                <button
                  type="button"
                  onClick={() => removeRhythmEntry(id)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/60 dark:hover:text-red-400"
                  aria-label={`Remove ${label} from home`}
                >
                  <X size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {available.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Add
          </span>
          {available.map((id) => {
            const custom = customById.get(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => addRhythmEntry(id)}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {custom && (
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: custom.color }} />
                )}
                {labelFor(id)}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Child management
// ---------------------------------------------------------------------------

function EditChildModal({ child, onClose }: { child: Child | null; onClose: () => void }) {
  const updateChild = useAppStore((s) => s.updateChild);
  const [name, setName] = useState('');
  const [birth_date, setBirthDate] = useState('');
  const [birth_time, setBirthTime] = useState('');

  useEffect(() => {
    if (child) {
      setName(child.name);
      setBirthDate(child.birth_date);
      setBirthTime(child.birth_time ?? '');
    }
  }, [child]);

  if (!child) return null;
  return (
    <Modal open title="Edit child" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void updateChild({ ...child, name, birth_date, birth_time: birth_time || undefined });
          onClose();
        }}
        className="space-y-3"
      >
        <div>
          <label className="label">Name</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Birth date</label>
            <input type="date" className="field" value={birth_date} onChange={(e) => setBirthDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Time</label>
            <input type="time" className="field" value={birth_time} onChange={(e) => setBirthTime(e.target.value)} />
          </div>
        </div>
        <button type="submit" className="btn-primary w-full">Save</button>
      </form>
    </Modal>
  );
}

function ChildrenCard() {
  const children = useAppStore((s) => s.children);
  const removeChild = useAppStore((s) => s.removeChild);
  const [editing, setEditing] = useState<Child | null>(null);
  const [deleting, setDeleting] = useState<Child | null>(null);
  const live = children.filter((c) => !c.deleted);

  return (
    <Card title="Children" icon={<Pencil size={16} />}>
      <div className="space-y-2">
        {live.map((c) => (
          <div key={c.id} className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ background: c.color ?? '#4f46e5' }}
            >
              {initials(c.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                {c.name}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{ageLabel(c.birth_date)}</p>
            </div>
            <button
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => setEditing(c)}
            >
              <Pencil size={15} />
            </button>
            <button
              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/60 dark:hover:text-red-400"
              onClick={() => setDeleting(c)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <EditChildModal child={editing} onClose={() => setEditing(null)} />
      <Modal open={!!deleting} title="Delete child" onClose={() => setDeleting(null)}>
        {deleting && (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Delete <strong>{deleting.name}</strong> and all of their logged entries? This
              removes them on this device{isSupabaseConfigured ? ' and from sync' : ''}.
            </p>
            <div className="mt-4 flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setDeleting(null)}>Cancel</button>
              <button
                className="btn-danger flex-1"
                onClick={() => {
                  void removeChild(deleting.id);
                  setDeleting(null);
                }}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Data (export / delete)
// ---------------------------------------------------------------------------

function DataCard() {
  const children = useAppStore((s) => s.children);
  const events = useAppStore((s) => s.events);
  const activeId = useAppStore((s) => s.activeChildId);
  const deleteAccount = useAppStore((s) => s.deleteAccount);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importing, setImporting] = useState(false);

  const child = children.find((c) => c.id === activeId && !c.deleted);
  if (!child) return null;
  const childEvents = events.filter((e) => e.child_id === child.id && !e.deleted);

  return (
    <Card title="Your data" icon={<Download size={16} />}>
      <div className="space-y-2">
        <div className="flex gap-2">
          <button
            className="btn-ghost flex-1"
            onClick={() => exportJSON([child], childEvents, child.name)}
          >
            <Download size={15} /> Export JSON
          </button>
          <button
            className="btn-ghost flex-1"
            onClick={() => exportCSV([child], childEvents, child.name)}
          >
            <Download size={15} /> Export CSV
          </button>
        </div>
        <button className="btn-ghost w-full" onClick={() => setImporting(true)}>
          <Upload size={15} /> Import from Huckleberry
        </button>
        <button className="btn-danger w-full" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={15} /> Delete all my data
        </button>
      </div>
      <ImportModal open={importing} onClose={() => setImporting(false)} />

      <Modal open={confirmDelete} title="Delete all data" onClose={() => setConfirmDelete(false)}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This permanently deletes <strong>all</strong> children and entries
          {isSupabaseConfigured ? ' on this device and from sync' : ' on this device'}. This
          cannot be undone.
        </p>
        <div className="mt-4 flex gap-2">
          <button className="btn-ghost flex-1" onClick={() => setConfirmDelete(false)}>Cancel</button>
          <button
            className="btn-danger flex-1"
            onClick={() => {
              setConfirmDelete(false);
              void deleteAccount();
            }}
          >
            Delete everything
          </button>
        </div>
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Layout helper + page
// ---------------------------------------------------------------------------

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <span className="text-brand-600 dark:text-brand-400">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Settings() {
  return (
    <div className="animate-fade-in space-y-4">
      <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Settings</h1>
      <SyncCard />
      <PreferencesCard />
      <LogDisplayCard />
      <RhythmEntriesCard />
      <CustomEventsCard />
      <ChildrenCard />
      <DataCard />
      <Card title="About" icon={<Cloud size={16} />}>
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          BabyApp is a care tracker — it records and organizes your baby's care. It is not a
          medical device and does not provide medical advice. For anything health-related,
          talk to your own doctor or a healthcare professional.
        </p>
      </Card>
    </div>
  );
}
