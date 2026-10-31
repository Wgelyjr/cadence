import { Droplets, Milk, Moon } from 'lucide-react';
import { useAppStore } from '../lib/store';
import {
  bandLabel,
  computeRhythm,
  elapsedLabel,
  type Rhythm,
  type RhythmItem,
} from '../lib/rhythm';

const META: Record<
  RhythmItem['key'],
  { label: string; Icon: typeof Moon; box: string; icon: string; bar: string }
> = {
  feed: {
    label: 'Feed',
    Icon: Milk,
    box: 'bg-emerald-50 dark:bg-emerald-950',
    icon: 'text-emerald-500 dark:text-emerald-400',
    bar: 'bg-emerald-400 dark:bg-emerald-500',
  },
  sleep: {
    label: 'Nap',
    Icon: Moon,
    box: 'bg-brand-50 dark:bg-brand-950',
    icon: 'text-brand-500 dark:text-brand-400',
    bar: 'bg-brand-400 dark:bg-brand-500',
  },
  diaper: {
    label: 'Diaper',
    Icon: Droplets,
    box: 'bg-sky-50 dark:bg-sky-950',
    icon: 'text-sky-500 dark:text-sky-400',
    bar: 'bg-sky-400 dark:bg-sky-500',
  },
};

function Row({ item }: { item: RhythmItem }) {
  const m = META[item.key];
  const { Icon } = m;

  let ago: string;
  if (item.asleep) ago = `Asleep · ${elapsedLabel(item.elapsedMin ?? 0)}`;
  else if (item.elapsedMin != null) ago = `${elapsedLabel(item.elapsedMin)} ago`;
  else ago = 'No entries yet';

  let barCls = m.bar;
  let pct = 0;
  if (item.asleep) {
    pct = 100;
  } else if (item.progress != null) {
    pct = Math.round(item.progress * 100);
    if (item.progress >= 1) barCls = 'bg-amber-500';
    else if (item.progress >= 0.6) barCls = 'bg-amber-400';
  }

  return (
    <div className="flex items-center gap-3 py-2">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${m.box}`}>
        <Icon size={16} className={m.icon} />
      </span>
      <div className="w-20 shrink-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{m.label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{ago}</p>
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-all ${barCls}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function RhythmCard() {
  const children = useAppStore((s) => s.children);
  const events = useAppStore((s) => s.events);
  const activeId = useAppStore((s) => s.activeChildId);
  const child = children.find((c) => c.id === activeId && !c.deleted);
  if (!child) return null;

  const rhythm: Rhythm = computeRhythm(child, events);
  const attention = rhythm.attention;

  const chip = attention
    ? {
        label:
          attention.progress! >= 1
            ? `${META[attention.key].label} — a while ago`
            : `${META[attention.key].label} — due soon`,
        cls: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
      }
    : {
        label: 'On track',
        cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
      };

  const [feed, nap, diaper] = rhythm.items;

  return (
    <section className="card p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <Moon size={16} className="text-brand-600 dark:text-brand-400" /> Rhythm
        </h2>
        <span className={`chip ${chip.cls}`}>{chip.label}</span>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        <Row item={feed} />
        <Row item={nap} />
        <Row item={diaper} />
      </div>

      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        Typical {rhythm.ageText} intervals: feeds {bandLabel(feed.typical)}, naps{' '}
        {bandLabel(nap.typical)}, diapers {bandLabel(diaper.typical)}. A starting point, not
        medical advice.
      </p>
    </section>
  );
}
