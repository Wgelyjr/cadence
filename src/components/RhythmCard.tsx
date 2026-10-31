import {
  AlertTriangle,
  Apple,
  Droplets,
  Milk,
  Moon,
  Ruler,
  Sparkles,
  Thermometer,
  Timer,
} from 'lucide-react';
import { useAppStore } from '../lib/store';
import { useSettings } from '../lib/settings';
import {
  bandLabel,
  computeRhythm,
  elapsedLabel,
  type Rhythm,
  type RhythmItem,
} from '../lib/rhythm';
import type { BuiltinEventType } from '../lib/types';
import { CustomTypeIcon } from './CustomTypeIcon';

const NEUTRAL = {
  box: 'bg-slate-100 dark:bg-slate-800',
  icon: 'text-slate-500 dark:text-slate-400',
  bar: 'bg-slate-400 dark:bg-slate-500',
};

const BUILTIN_META: Record<
  BuiltinEventType,
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
  growth: { label: 'Growth', Icon: Ruler, ...NEUTRAL },
  health: { label: 'Health', Icon: Thermometer, ...NEUTRAL },
  milestone: { label: 'Milestone', Icon: Sparkles, ...NEUTRAL },
  solid_food: { label: 'Solid food', Icon: Apple, ...NEUTRAL },
  allergy: { label: 'Allergy', Icon: AlertTriangle, ...NEUTRAL },
  contraction: { label: 'Contraction', Icon: Timer, ...NEUTRAL },
};

interface RowMeta {
  label: string;
  Icon: typeof Moon | null;
  /** Custom types show a colored circle with their icon instead of a glyph. */
  customIcon?: string;
  customColor?: string;
  box: string;
  icon: string;
  bar: string;
}

function Row({ item, meta }: { item: RhythmItem; meta: RowMeta }) {
  const { Icon, customIcon, customColor } = meta;

  let ago: string;
  if (item.asleep) ago = `Asleep · ${elapsedLabel(item.elapsedMin ?? 0)}`;
  else if (item.elapsedMin != null) ago = `${elapsedLabel(item.elapsedMin)} ago`;
  else ago = 'No entries yet';

  let barCls = meta.bar;
  let pct = 0;
  if (item.asleep) {
    pct = 100;
  } else if (item.progress != null) {
    pct = Math.round(item.progress * 100);
    if (item.progress >= 1) barCls = 'bg-amber-500';
    else if (item.progress >= 0.6) barCls = 'bg-amber-400';
  }
  // Without a typical band the track stays empty — nothing to measure against.

  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.box}`}
      >
        {customColor ? (
          <span
            className="flex h-4 w-4 items-center justify-center rounded-full text-white"
            style={{ background: customColor }}
            aria-hidden
          >
            <CustomTypeIcon icon={customIcon} size={10} />
          </span>
        ) : (
          Icon && <Icon size={16} className={meta.icon} />
        )}
      </span>
      <div className="w-20 shrink-0">
        <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
          {meta.label}
        </p>
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
  const rhythmOrder = useSettings((s) => s.rhythmOrder);
  const customTypes = useSettings((s) => s.customTypes);
  const child = children.find((c) => c.id === activeId && !c.deleted);
  if (!child) return null;

  const customById = new Map(customTypes.map((c) => [c.id, c]));
  const metaFor = (item: RhythmItem): RowMeta => {
    const custom = customById.get(item.key);
    if (custom)
      return {
        label: custom.label,
        Icon: null,
        customIcon: custom.icon,
        customColor: custom.color,
        box: 'bg-slate-100 dark:bg-slate-800',
        icon: '',
        bar: NEUTRAL.bar,
      };
    const m = BUILTIN_META[item.key as BuiltinEventType] ?? BUILTIN_META.growth;
    return { label: m.label, Icon: m.Icon, box: m.box, icon: m.icon, bar: m.bar };
  };

  const rhythm: Rhythm = computeRhythm(child, events, rhythmOrder);
  if (rhythm.items.length === 0) return null;

  const attention = rhythm.attention;
  const chip = attention
    ? {
        label:
          attention.progress! >= 1
            ? `${metaFor(attention).label} — a while ago`
            : `${metaFor(attention).label} — due soon`,
        cls: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
      }
    : {
        label: 'On track',
        cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
      };

  // Footer lists only the entries with a typical band for this age.
  const banded = rhythm.items.filter((i) => i.typical != null);

  return (
    <section className="card p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <Moon size={16} className="text-brand-600 dark:text-brand-400" /> Rhythm
        </h2>
        <span className={`chip ${chip.cls}`}>{chip.label}</span>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {rhythm.items.map((item) => (
          <Row key={item.key} item={item} meta={metaFor(item)} />
        ))}
      </div>

      {banded.length > 0 && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Typical {rhythm.ageText} intervals:{' '}
          {banded.map((i) => `${metaFor(i).label.toLowerCase()} ${bandLabel(i.typical!)}`).join(', ')}.{' '}
          A starting point, not medical advice.
        </p>
      )}
    </section>
  );
}
