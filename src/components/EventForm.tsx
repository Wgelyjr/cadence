import { useEffect, useMemo, useState } from 'react';
import {
  Apple,
  AlertTriangle,
  Droplets,
  Milk,
  Moon,
  Play,
  Ruler,
  Save,
  Sparkles,
  Square,
  Thermometer,
  Timer,
} from 'lucide-react';
import type { BuiltinEventType, CareEvent, EventType } from '../lib/types';
import { BUILTIN_EVENT_TYPES, EVENT_TYPE_META } from '../lib/types';
import { useAppStore } from '../lib/store';
import { useSettings, visiblePickerIds } from '../lib/settings';
import {
  CM_PER_IN,
  KG_PER_LB,
  ML_PER_OZ,
  lengthToCm,
  lengthUnit,
  round1,
  round2,
  tempToC,
  tempUnit,
  volumeToMl,
  volumeUnit,
  weightToKg,
  weightUnit,
} from '../lib/units';
import type { Units } from '../lib/settings';
import { loadLastEntry, saveLastEntry } from '../lib/lastEntry';
import Seg from './Seg';

const ICONS: Record<BuiltinEventType, typeof Moon> = {
  sleep: Moon,
  feed: Milk,
  diaper: Droplets,
  growth: Ruler,
  health: Thermometer,
  milestone: Sparkles,
  solid_food: Apple,
  allergy: AlertTriangle,
  contraction: Timer,
};

function toLocalInput(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function fromLocalInput(s: string): string {
  return new Date(s).toISOString();
}

function fmtElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

interface FormState {
  start_time: string;
  end_time: string;
  sleep_kind: 'nap' | 'night';
  feed_method: 'nursing' | 'bottle' | 'pump';
  feed_side: 'left' | 'right' | 'both';
  feed_side_duration_min: string;
  bottle_ml: string;
  pump_ml: string;
  diaper_type: 'wet' | 'dirty' | 'mixed';
  stool_color: string;
  stool_consistency: string;
  height_cm: string;
  weight_kg: string;
  head_cm: string;
  temp_c: string;
  medicine_name: string;
  medicine_dose: string;
  label: string;
  food_items: string;
  allergy_reaction: string;
  allergy_severity: 'mild' | 'moderate' | 'severe';
  contraction_duration_sec: string;
  note: string;
}

function defaultForm(): FormState {
  return {
    start_time: toLocalInput(new Date()),
    end_time: '',
    sleep_kind: 'nap',
    feed_method: 'nursing',
    feed_side: 'both',
    feed_side_duration_min: '',
    bottle_ml: '',
    pump_ml: '',
    diaper_type: 'wet',
    stool_color: '',
    stool_consistency: '',
    height_cm: '',
    weight_kg: '',
    head_cm: '',
    temp_c: '',
    medicine_name: '',
    medicine_dose: '',
    label: '',
    food_items: '',
    allergy_reaction: '',
    allergy_severity: 'mild',
    contraction_duration_sec: '',
    note: '',
  };
}

/** Type-specific fields, so an edit can clear values the new type doesn't use. */
const TYPE_FIELDS: Record<EventType, Array<keyof CareEvent>> = {
  sleep: ['sleep_kind'],
  feed: ['feed_method', 'feed_side', 'feed_side_duration_min', 'bottle_ml', 'pump_ml'],
  diaper: ['diaper_type', 'stool_color', 'stool_consistency'],
  growth: ['height_cm', 'weight_kg', 'head_cm'],
  health: ['temp_c', 'medicine_name', 'medicine_dose'],
  milestone: ['label'],
  solid_food: ['food_items'],
  allergy: ['label', 'allergy_reaction', 'allergy_severity'],
  contraction: ['contraction_duration_sec', 'label'],
  custom: ['custom_type_id', 'custom_label'],
};

/** Prefill the form from an existing event, in the user's display units. */
function formFromEvent(e: CareEvent, units: Units): FormState {
  const f = defaultForm();
  const vol = (ml: number) => (units === 'metric' ? ml : round1(ml / ML_PER_OZ));
  const len = (cm: number) => (units === 'metric' ? cm : round1(cm / CM_PER_IN));
  const wgt = (kg: number) => (units === 'metric' ? kg : round1(kg / KG_PER_LB));
  const tmp = (c: number) => (units === 'metric' ? c : round1(c * (9 / 5) + 32));
  // A prefill source (lastEntry) has no times; fall back to now.
  f.start_time = e.start_time ? toLocalInput(new Date(e.start_time)) : toLocalInput(new Date());
  f.end_time = e.end_time ? toLocalInput(new Date(e.end_time)) : '';
  if (e.sleep_kind) f.sleep_kind = e.sleep_kind;
  if (e.feed_method) f.feed_method = e.feed_method;
  if (e.feed_side) f.feed_side = e.feed_side;
  if (e.feed_side_duration_min != null) f.feed_side_duration_min = String(e.feed_side_duration_min);
  if (e.bottle_ml != null) f.bottle_ml = String(vol(e.bottle_ml));
  if (e.pump_ml != null) f.pump_ml = String(vol(e.pump_ml));
  if (e.diaper_type) f.diaper_type = e.diaper_type;
  if (e.stool_color) f.stool_color = e.stool_color;
  if (e.stool_consistency) f.stool_consistency = e.stool_consistency;
  if (e.height_cm != null) f.height_cm = String(len(e.height_cm));
  if (e.weight_kg != null) f.weight_kg = String(wgt(e.weight_kg));
  if (e.head_cm != null) f.head_cm = String(len(e.head_cm));
  if (e.temp_c != null) f.temp_c = String(tmp(e.temp_c));
  if (e.medicine_name) f.medicine_name = e.medicine_name;
  if (e.medicine_dose) f.medicine_dose = e.medicine_dose;
  if (e.label) f.label = e.label;
  if (e.food_items?.length) f.food_items = e.food_items.join(', ');
  if (e.allergy_reaction) f.allergy_reaction = e.allergy_reaction;
  if (e.allergy_severity) f.allergy_severity = e.allergy_severity;
  if (e.contraction_duration_sec != null)
    f.contraction_duration_sec = String(e.contraction_duration_sec);
  if (e.note) f.note = e.note;
  return f;
}

/**
 * Form pre-populated from a previously saved entry: the type's details
 * carry over (re-rendered in the current display units), while times reset
 * to now and end/note stay blank for the new entry.
 */
function prefillFrom(e: CareEvent, units: Units): FormState {
  const f = formFromEvent(e, units);
  f.start_time = toLocalInput(new Date());
  f.end_time = '';
  f.note = '';
  return f;
}

interface Props {
  /** When set, the form edits this event instead of creating a new one. */
  initial?: CareEvent;
  onSaved?: () => void;
}

export default function EventForm({ initial, onSaved }: Props) {
  const activeChildId = useAppStore((s) => s.activeChildId);
  const addEvent = useAppStore((s) => s.addEvent);
  const updateEvent = useAppStore((s) => s.updateEvent);
  const childId = initial ? initial.child_id : activeChildId;

  const units = useSettings((s) => s.units);
  const customTypes = useSettings((s) => s.customTypes);
  const logOrder = useSettings((s) => s.logOrder);
  const hiddenTypes = useSettings((s) => s.hiddenTypes);

  // Picker contents come from the log-display settings (order + visibility).
  const pickerIds = useMemo(
    () => visiblePickerIds({ logOrder, hiddenTypes }),
    [logOrder, hiddenTypes],
  );
  const customById = useMemo(
    () => new Map(customTypes.map((c) => [c.id, c])),
    [customTypes],
  );

  // For a new entry, open with the child's last-logged type pre-populated
  // (details in display units, fresh "now" start) when that type is still
  // in the picker — e.g. another bottle of the same volume.
  const last = useMemo(
    () => (initial || !childId ? null : loadLastEntry(childId)),
    [initial, childId],
  );
  const lastId = last
    ? last.type === 'custom'
      ? last.custom_type_id ?? ''
      : last.type
    : null;
  const lastUsable = last && lastId ? pickerIds.includes(lastId) : false;

  const [selected, setSelected] = useState<string>(() =>
    initial
      ? initial.type === 'custom'
        ? initial.custom_type_id ?? ''
        : initial.type
      : lastUsable
        ? (lastId as string)
        : pickerIds[0] ?? 'sleep',
  );
  const [form, setForm] = useState<FormState>(() =>
    initial ? formFromEvent(initial, units) : lastUsable ? prefillFrom(last!, units) : defaultForm(),
  );
  const [busy, setBusy] = useState(false);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (timerStart == null) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [timerStart]);

  const elapsed = timerStart != null ? Math.max(0, Math.floor((Date.now() - timerStart) / 1000)) : 0;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Calendar date and time of day are separate fields, but the state keeps
  // the combined "YYYY-MM-DDTHH:MM" string, so submit/edit paths are
  // unchanged. An empty half is filled from the other half (end defaults
  // to the start's date/time) so clearing a field never produces an
  // invalid value.
  const startDate = form.start_time.slice(0, 10);
  const startTime = form.start_time.slice(11, 16);
  const endDate = form.end_time ? form.end_time.slice(0, 10) : startDate;
  const endTime = form.end_time ? form.end_time.slice(11, 16) : '';
  function setStartDate(d: string) {
    if (d) set('start_time', `${d}T${startTime}`);
  }
  function setStartTime(t: string) {
    if (t) set('start_time', `${startDate}T${t}`);
  }
  function setEndDate(d: string) {
    if (d) set('end_time', `${d}T${endTime || startTime}`);
  }
  function setEndTime(t: string) {
    if (t) set('end_time', `${endDate}T${t}`);
  }

  const selectedCustom = customById.get(selected);
  const useTimer =
    !selectedCustom &&
    (selected === 'sleep' || selected === 'feed' || selected === 'contraction');

  function startTimer() {
    setTimerStart(Date.now());
    set('start_time', toLocalInput(new Date()));
  }
  function stopTimer() {
    if (selected === 'contraction') {
      set('contraction_duration_sec', String(elapsed));
    } else {
      set('end_time', toLocalInput(new Date()));
    }
    setTimerStart(null);
  }

  // Display units for labels/placeholders.
  const volUnit = volumeUnit(units);
  const lenUnit = lengthUnit(units);
  const wUnit = weightUnit(units);
  const tUnit = tempUnit(units);
  const imperial = units === 'imperial';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!childId || busy) return;
    setBusy(true);
    try {
      // A custom event whose type was later removed from settings keeps its
      // type (and denormalized label) unless the user picks a built-in type.
      const keptRemovedCustom =
        initial?.type === 'custom' &&
        !BUILTIN_EVENT_TYPES.includes(selected as BuiltinEventType);
      const input: Partial<CareEvent> & { type: EventType; child_id: string } = {
        type: selectedCustom || keptRemovedCustom ? 'custom' : (selected as EventType),
        child_id: childId,
        start_time: fromLocalInput(form.start_time || toLocalInput(new Date())),
      };
      if (form.end_time) input.end_time = fromLocalInput(form.end_time);

      switch (selected) {
        case 'sleep':
          input.sleep_kind = form.sleep_kind;
          break;
        case 'feed':
          input.feed_method = form.feed_method;
          if (form.feed_method === 'nursing') {
            input.feed_side = form.feed_side;
            if (form.feed_side_duration_min)
              input.feed_side_duration_min = Number(form.feed_side_duration_min);
          }
          if (form.feed_method === 'bottle' && form.bottle_ml)
            input.bottle_ml = Math.round(volumeToMl(Number(form.bottle_ml), units));
          if (form.feed_method === 'pump' && form.pump_ml)
            input.pump_ml = Math.round(volumeToMl(Number(form.pump_ml), units));
          break;
        case 'diaper':
          input.diaper_type = form.diaper_type;
          if (form.diaper_type !== 'wet') {
            if (form.stool_color) input.stool_color = form.stool_color;
            if (form.stool_consistency) input.stool_consistency = form.stool_consistency;
          }
          break;
        case 'growth':
          if (form.height_cm) input.height_cm = round2(lengthToCm(Number(form.height_cm), units));
          if (form.weight_kg) input.weight_kg = round2(weightToKg(Number(form.weight_kg), units));
          if (form.head_cm) input.head_cm = round2(lengthToCm(Number(form.head_cm), units));
          break;
        case 'health':
          if (form.temp_c) input.temp_c = round1(tempToC(Number(form.temp_c), units));
          if (form.medicine_name) input.medicine_name = form.medicine_name;
          if (form.medicine_dose) input.medicine_dose = form.medicine_dose;
          break;
        case 'milestone':
          if (form.label) input.label = form.label;
          break;
        case 'solid_food':
          if (form.food_items)
            input.food_items = form.food_items
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
          break;
        case 'allergy':
          if (form.label) input.label = form.label;
          if (form.allergy_reaction) input.allergy_reaction = form.allergy_reaction;
          input.allergy_severity = form.allergy_severity;
          break;
        case 'contraction':
          if (form.contraction_duration_sec)
            input.contraction_duration_sec = Number(form.contraction_duration_sec);
          if (form.label) input.label = form.label;
          break;
        default:
          break; // custom types: just times + note
      }

      if (selectedCustom) {
        input.custom_type_id = selectedCustom.id;
        input.custom_label = selectedCustom.label;
      } else if (keptRemovedCustom) {
        input.custom_type_id = initial!.custom_type_id;
        input.custom_label = initial!.custom_label;
      }
      if (form.note) input.note = form.note;

      if (initial) {
        // Rebuild the event from the form so type changes and cleared fields
        // don't leave stale values behind.
        const updated = { ...initial };
        for (const keys of Object.values(TYPE_FIELDS))
          for (const k of keys) delete (updated as Record<string, unknown>)[k];
        if (!form.end_time && input.type !== 'contraction') delete updated.end_time;
        if (!form.note) delete updated.note;
        Object.assign(updated, input);
        await updateEvent(updated);
        setForm(defaultForm());
      } else {
        await addEvent(input);
        // Remember this entry (canonical units) so the next log opens
        // pre-populated for rapid re-logging.
        saveLastEntry(childId, input as CareEvent);
        setForm(prefillFrom(input as CareEvent, units));
      }
      setTimerStart(null);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Type picker — order & visibility from Settings > Log entries */}
      <div className="grid grid-cols-3 gap-2">
        {pickerIds.map((id) => {
          const custom = customById.get(id);
          const Icon = custom ? null : ICONS[id as BuiltinEventType];
          const active = selected === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSelected(id);
                setTimerStart(null);
              }}
              className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-medium transition ${
                active
                  ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-950 dark:text-brand-300'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {Icon ? (
                <Icon size={20} />
              ) : (
                <span
                  className="h-5 w-5 rounded-full ring-2 ring-white dark:ring-slate-900"
                  style={{ background: custom!.color }}
                  aria-hidden
                />
              )}
              <span className="max-w-full truncate">
                {custom ? custom.label : EVENT_TYPE_META[id as EventType].label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Timer (sleep / feed / contraction) */}
      {useTimer && (
        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Timer
            </p>
            <p
              className={`font-mono text-2xl tabular-nums ${
                timerStart ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {fmtElapsed(elapsed)}
            </p>
          </div>
          {timerStart == null ? (
            <button type="button" onClick={startTimer} className="btn-primary">
              <Play size={16} /> Start
            </button>
          ) : (
            <button type="button" onClick={stopTimer} className="btn-ghost">
              <Square size={16} /> Stop
            </button>
          )}
        </div>
      )}

      {/* Times — calendar date and time of day as separate fields */}
      <div className="space-y-3">
        <div>
          <label className="label">Start</label>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              className="field"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <input
              type="time"
              className="field"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
        </div>
        {selected !== 'contraction' && (
          <div>
            <label className="label">End</label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                className="field"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <input
                type="time"
                className="field"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Type-specific fields */}
      {selected === 'sleep' && (
        <div>
          <label className="label">Type</label>
          <Seg
            value={form.sleep_kind}
            onChange={(v) => set('sleep_kind', v as 'nap' | 'night')}
            options={[
              { value: 'nap', label: 'Nap' },
              { value: 'night', label: 'Night sleep' },
            ]}
          />
        </div>
      )}

      {selected === 'feed' && (
        <div className="space-y-3">
          <div>
            <label className="label">Method</label>
            <Seg
              value={form.feed_method}
              onChange={(v) => set('feed_method', v as FormState['feed_method'])}
              options={[
                { value: 'nursing', label: 'Nursing' },
                { value: 'bottle', label: 'Bottle' },
                { value: 'pump', label: 'Pump' },
              ]}
            />
          </div>
          {form.feed_method === 'nursing' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Side</label>
                <Seg
                  value={form.feed_side}
                  onChange={(v) => set('feed_side', v as FormState['feed_side'])}
                  options={[
                    { value: 'left', label: 'Left' },
                    { value: 'right', label: 'Right' },
                    { value: 'both', label: 'Both' },
                  ]}
                />
              </div>
              <div>
                <label className="label">Min / side</label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="field"
                  value={form.feed_side_duration_min}
                  onChange={(e) => set('feed_side_duration_min', e.target.value)}
                  placeholder="10"
                />
              </div>
            </div>
          )}
          {form.feed_method === 'bottle' && (
            <div>
              <label className="label">Volume ({volUnit})</label>
              <input
                type="number"
                inputMode="decimal"
                step={imperial ? '0.5' : '5'}
                className="field"
                value={form.bottle_ml}
                onChange={(e) => set('bottle_ml', e.target.value)}
                placeholder={imperial ? '4' : '120'}
              />
            </div>
          )}
          {form.feed_method === 'pump' && (
            <div>
              <label className="label">Pumped ({volUnit})</label>
              <input
                type="number"
                inputMode="decimal"
                step={imperial ? '0.5' : '5'}
                className="field"
                value={form.pump_ml}
                onChange={(e) => set('pump_ml', e.target.value)}
                placeholder={imperial ? '2.5' : '80'}
              />
            </div>
          )}
        </div>
      )}

      {selected === 'diaper' && (
        <div className="space-y-3">
          <div>
            <label className="label">Type</label>
            <Seg
              value={form.diaper_type}
              onChange={(v) => set('diaper_type', v as FormState['diaper_type'])}
              options={[
                { value: 'wet', label: 'Wet' },
                { value: 'dirty', label: 'Dirty' },
                { value: 'mixed', label: 'Mixed' },
              ]}
            />
          </div>
          {form.diaper_type !== 'wet' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Stool color</label>
                <input
                  className="field"
                  value={form.stool_color}
                  onChange={(e) => set('stool_color', e.target.value)}
                  placeholder="e.g. yellow-green"
                />
              </div>
              <div>
                <label className="label">Consistency</label>
                <input
                  className="field"
                  value={form.stool_consistency}
                  onChange={(e) => set('stool_consistency', e.target.value)}
                  placeholder="e.g. seedy"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {selected === 'growth' && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Height ({lenUnit})</label>
            <input
              type="number"
              inputMode="decimal"
              step={imperial ? '0.1' : '0.5'}
              className="field"
              value={form.height_cm}
              onChange={(e) => set('height_cm', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Weight ({wUnit})</label>
            <input
              type="number"
              inputMode="decimal"
              step={imperial ? '0.1' : '0.1'}
              className="field"
              value={form.weight_kg}
              onChange={(e) => set('weight_kg', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Head ({lenUnit})</label>
            <input
              type="number"
              inputMode="decimal"
              step={imperial ? '0.1' : '0.5'}
              className="field"
              value={form.head_cm}
              onChange={(e) => set('head_cm', e.target.value)}
            />
          </div>
        </div>
      )}

      {selected === 'health' && (
        <div className="space-y-3">
          <div>
            <label className="label">Temperature ({tUnit})</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              className="field"
              value={form.temp_c}
              onChange={(e) => set('temp_c', e.target.value)}
              placeholder={imperial ? '98.2' : '36.8'}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Medicine</label>
              <input
                className="field"
                value={form.medicine_name}
                onChange={(e) => set('medicine_name', e.target.value)}
                placeholder="e.g. paracetamol"
              />
            </div>
            <div>
              <label className="label">Dose</label>
              <input
                className="field"
                value={form.medicine_dose}
                onChange={(e) => set('medicine_dose', e.target.value)}
                placeholder={imperial ? 'e.g. 0.5 oz' : 'e.g. 2.5 ml'}
              />
            </div>
          </div>
        </div>
      )}

      {selected === 'milestone' && (
        <div>
          <label className="label">Milestone</label>
          <input
            className="field"
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder="e.g. First smile"
          />
        </div>
      )}

      {selected === 'solid_food' && (
        <div>
          <label className="label">Foods (comma separated)</label>
          <input
            className="field"
            value={form.food_items}
            onChange={(e) => set('food_items', e.target.value)}
            placeholder="e.g. carrot, rice cereal"
          />
        </div>
      )}

      {selected === 'allergy' && (
        <div className="space-y-3">
          <div>
            <label className="label">Suspected cause</label>
            <input
              className="field"
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder="e.g. cow's milk"
            />
          </div>
          <div>
            <label className="label">Reaction</label>
            <textarea
              className="field min-h-[70px]"
              value={form.allergy_reaction}
              onChange={(e) => set('allergy_reaction', e.target.value)}
              placeholder="What happened, when, and how it resolved"
            />
          </div>
          <div>
            <label className="label">Severity</label>
            <Seg
              value={form.allergy_severity}
              onChange={(v) => set('allergy_severity', v as FormState['allergy_severity'])}
              options={[
                { value: 'mild', label: 'Mild' },
                { value: 'moderate', label: 'Moderate' },
                { value: 'severe', label: 'Severe' },
              ]}
            />
          </div>
        </div>
      )}

      {selected === 'contraction' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Duration (sec)</label>
            <input
              type="number"
              inputMode="numeric"
              className="field"
              value={form.contraction_duration_sec}
              onChange={(e) => set('contraction_duration_sec', e.target.value)}
              placeholder="60"
            />
          </div>
          <div>
            <label className="label">Note</label>
            <input
              className="field"
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder="optional"
            />
          </div>
        </div>
      )}

      {selectedCustom && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {selectedCustom.label} — custom entry. Add times and a note.
        </p>
      )}

      {/* Note */}
      {selected !== 'contraction' && (
        <div>
          <label className="label">Note (optional)</label>
          <input
            className="field"
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder="Anything worth remembering"
          />
        </div>
      )}

      <button type="submit" className="btn-primary w-full" disabled={busy || !childId}>
        <Save size={16} /> {busy ? 'Saving…' : initial ? 'Save changes' : 'Save entry'}
      </button>
    </form>
  );
}
