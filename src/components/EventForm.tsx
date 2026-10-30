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
import type { CareEvent, EventType } from '../lib/types';
import { EVENT_TYPE_META } from '../lib/types';
import { useAppStore } from '../lib/store';
import Seg from './Seg';

const ICONS: Record<EventType, typeof Moon> = {
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

interface Props {
  onSaved?: () => void;
}

export default function EventForm({ onSaved }: Props) {
  const activeChildId = useAppStore((s) => s.activeChildId);
  const addEvent = useAppStore((s) => s.addEvent);

  const [type, setType] = useState<EventType>('sleep');
  const [form, setForm] = useState<FormState>(defaultForm);
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

  const useTimer = type === 'sleep' || type === 'feed' || type === 'contraction';

  function startTimer() {
    setTimerStart(Date.now());
    set('start_time', toLocalInput(new Date()));
  }
  function stopTimer() {
    if (type === 'contraction') {
      set('contraction_duration_sec', String(elapsed));
    } else {
      set('end_time', toLocalInput(new Date()));
    }
    setTimerStart(null);
  }

  const types = useMemo(() => Object.keys(EVENT_TYPE_META) as EventType[], []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeChildId || busy) return;
    setBusy(true);
    try {
      const input: Partial<CareEvent> & { type: EventType; child_id: string } = {
        type,
        child_id: activeChildId,
        start_time: fromLocalInput(form.start_time || toLocalInput(new Date())),
      };
      if (form.end_time) input.end_time = fromLocalInput(form.end_time);

      switch (type) {
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
            input.bottle_ml = Number(form.bottle_ml);
          if (form.feed_method === 'pump' && form.pump_ml)
            input.pump_ml = Number(form.pump_ml);
          break;
        case 'diaper':
          input.diaper_type = form.diaper_type;
          if (form.diaper_type !== 'wet') {
            if (form.stool_color) input.stool_color = form.stool_color;
            if (form.stool_consistency) input.stool_consistency = form.stool_consistency;
          }
          break;
        case 'growth':
          if (form.height_cm) input.height_cm = Number(form.height_cm);
          if (form.weight_kg) input.weight_kg = Number(form.weight_kg);
          if (form.head_cm) input.head_cm = Number(form.head_cm);
          break;
        case 'health':
          if (form.temp_c) input.temp_c = Number(form.temp_c);
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
      }
      if (form.note) input.note = form.note;

      await addEvent(input);
      setForm(defaultForm());
      setTimerStart(null);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Type picker */}
      <div className="grid grid-cols-3 gap-2">
        {types.map((t) => {
          const Icon = ICONS[t];
          const active = type === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t);
                setTimerStart(null);
              }}
              className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-medium transition ${
                active
                  ? 'border-brand-400 bg-brand-50 text-brand-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Icon size={20} />
              {EVENT_TYPE_META[t].label}
            </button>
          );
        })}
      </div>

      {/* Timer (sleep / feed / contraction) */}
      {useTimer && (
        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Timer</p>
            <p className={`font-mono text-2xl tabular-nums ${timerStart ? 'text-brand-600' : 'text-slate-400'}`}>
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

      {/* Times */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Start</label>
          <input
            type="datetime-local"
            className="field"
            value={form.start_time}
            onChange={(e) => set('start_time', e.target.value)}
          />
        </div>
        {type !== 'contraction' && (
          <div>
            <label className="label">End</label>
            <input
              type="datetime-local"
              className="field"
              value={form.end_time}
              onChange={(e) => set('end_time', e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Type-specific fields */}
      {type === 'sleep' && (
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

      {type === 'feed' && (
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
              <label className="label">Volume (ml)</label>
              <input
                type="number"
                inputMode="numeric"
                className="field"
                value={form.bottle_ml}
                onChange={(e) => set('bottle_ml', e.target.value)}
                placeholder="120"
              />
            </div>
          )}
          {form.feed_method === 'pump' && (
            <div>
              <label className="label">Pumped (ml)</label>
              <input
                type="number"
                inputMode="numeric"
                className="field"
                value={form.pump_ml}
                onChange={(e) => set('pump_ml', e.target.value)}
                placeholder="80"
              />
            </div>
          )}
        </div>
      )}

      {type === 'diaper' && (
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

      {type === 'growth' && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Height (cm)</label>
            <input type="number" inputMode="decimal" className="field" value={form.height_cm} onChange={(e) => set('height_cm', e.target.value)} />
          </div>
          <div>
            <label className="label">Weight (kg)</label>
            <input type="number" inputMode="decimal" className="field" value={form.weight_kg} onChange={(e) => set('weight_kg', e.target.value)} />
          </div>
          <div>
            <label className="label">Head (cm)</label>
            <input type="number" inputMode="decimal" className="field" value={form.head_cm} onChange={(e) => set('head_cm', e.target.value)} />
          </div>
        </div>
      )}

      {type === 'health' && (
        <div className="space-y-3">
          <div>
            <label className="label">Temperature (°C)</label>
            <input type="number" inputMode="decimal" step="0.1" className="field" value={form.temp_c} onChange={(e) => set('temp_c', e.target.value)} placeholder="36.8" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Medicine</label>
              <input className="field" value={form.medicine_name} onChange={(e) => set('medicine_name', e.target.value)} placeholder="e.g. paracetamol" />
            </div>
            <div>
              <label className="label">Dose</label>
              <input className="field" value={form.medicine_dose} onChange={(e) => set('medicine_dose', e.target.value)} placeholder="e.g. 2.5 ml" />
            </div>
          </div>
        </div>
      )}

      {type === 'milestone' && (
        <div>
          <label className="label">Milestone</label>
          <input className="field" value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. First smile" />
        </div>
      )}

      {type === 'solid_food' && (
        <div>
          <label className="label">Foods (comma separated)</label>
          <input className="field" value={form.food_items} onChange={(e) => set('food_items', e.target.value)} placeholder="e.g. carrot, rice cereal" />
        </div>
      )}

      {type === 'allergy' && (
        <div className="space-y-3">
          <div>
            <label className="label">Suspected cause</label>
            <input className="field" value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. cow's milk" />
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

      {type === 'contraction' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Duration (sec)</label>
            <input type="number" inputMode="numeric" className="field" value={form.contraction_duration_sec} onChange={(e) => set('contraction_duration_sec', e.target.value)} placeholder="60" />
          </div>
          <div>
            <label className="label">Note</label>
            <input className="field" value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="optional" />
          </div>
        </div>
      )}

      {/* Note */}
      {type !== 'contraction' && (
        <div>
          <label className="label">Note (optional)</label>
          <input className="field" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Anything worth remembering" />
        </div>
      )}

      <button type="submit" className="btn-primary w-full" disabled={busy || !activeChildId}>
        <Save size={16} /> {busy ? 'Saving…' : 'Save entry'}
      </button>
    </form>
  );
}
