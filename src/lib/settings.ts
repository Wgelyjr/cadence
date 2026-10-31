import { create } from 'zustand';
import { BUILTIN_EVENT_TYPES } from './types';
import { uid } from './utils';
import { applyTheme } from './theme';

/**
 * User preferences: units, theme, custom event types and log display config.
 *
 * These are device-local (localStorage) — they shape how data is *displayed*,
 * not the data itself, so they don't participate in sync. Events are stored
 * in canonical metric units; custom-type labels are denormalized onto the
 * event row (custom_label) so entries keep rendering after a type is deleted.
 */

export type Units = 'metric' | 'imperial';
export type Theme = 'light' | 'dark' | 'system';

/** A user-defined event type. */
export interface CustomEventType {
  id: string;
  label: string;
  color: string;
  /** Icon name from CUSTOM_TYPE_ICONS; absent on types made before icons existed (renders as a star). */
  icon?: string;
}

interface SettingsData {
  units: Units;
  theme: Theme;
  customTypes: CustomEventType[];
  /** Ordered type ids for the log picker (built-ins + custom). */
  logOrder: string[];
  /** Type ids hidden from the log picker. */
  hiddenTypes: string[];
  /** Type ids shown on the home Rhythm card, in order (present = shown). */
  rhythmOrder: string[];
}

const KEY = 'babyapp:settings';

function fallback(): SettingsData {
  return {
    units: 'metric',
    theme: 'system',
    customTypes: [],
    logOrder: [...BUILTIN_EVENT_TYPES],
    hiddenTypes: [],
    rhythmOrder: ['feed', 'sleep', 'diaper'],
  };
}

function load(): SettingsData {
  const base = fallback();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<SettingsData>;
    const data: SettingsData = {
      units: p.units === 'imperial' ? 'imperial' : 'metric',
      theme: p.theme === 'light' || p.theme === 'dark' || p.theme === 'system' ? p.theme : 'system',
      customTypes: Array.isArray(p.customTypes)
        ? p.customTypes
            .filter((c) => c && typeof c.id === 'string' && typeof c.label === 'string')
            .map((c) => ({
              id: c.id,
              label: c.label,
              color: c.color,
              icon: typeof c.icon === 'string' ? c.icon : undefined,
            }))
        : [],
      logOrder: Array.isArray(p.logOrder) ? p.logOrder.filter((x) => typeof x === 'string') : [],
      hiddenTypes: Array.isArray(p.hiddenTypes) ? p.hiddenTypes.filter((x) => typeof x === 'string') : [],
      rhythmOrder: Array.isArray(p.rhythmOrder)
        ? p.rhythmOrder.filter((x) => typeof x === 'string')
        : ['feed', 'sleep', 'diaper'],
    };
    // Keep the order list consistent with what actually exists
    // (new built-ins appended, deleted customs dropped).
    const ids = [...BUILTIN_EVENT_TYPES, ...data.customTypes.map((c) => c.id)];
    const order = data.logOrder.filter((id) => ids.includes(id));
    for (const id of ids) if (!order.includes(id)) order.push(id);
    data.logOrder = order;
    data.hiddenTypes = data.hiddenTypes.filter((id) => ids.includes(id));
    // Rhythm is user-curated: drop deleted types, but don't re-add anything.
    data.rhythmOrder = data.rhythmOrder.filter((id) => ids.includes(id));
    return data;
  } catch {
    return base;
  }
}

function persist(s: SettingsState) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        units: s.units,
        theme: s.theme,
        customTypes: s.customTypes,
        logOrder: s.logOrder,
        hiddenTypes: s.hiddenTypes,
        rhythmOrder: s.rhythmOrder,
      }),
    );
  } catch {
    /* private mode etc. — settings just won't persist */
  }
}

interface SettingsState extends SettingsData {
  setUnits: (u: Units) => void;
  setTheme: (t: Theme) => void;
  addCustomType: (label: string, color: string, icon?: string) => void;
  removeCustomType: (id: string) => void;
  /** Rename / recolor / re-icon a custom type. Only affects future entries —
      logged events keep their denormalized label. */
  updateCustomType: (id: string, label: string, color: string, icon: string) => void;
  moveLogType: (id: string, dir: -1 | 1) => void;
  toggleHiddenType: (id: string) => void;
  addRhythmEntry: (id: string) => void;
  removeRhythmEntry: (id: string) => void;
  moveRhythmEntry: (id: string, dir: -1 | 1) => void;
}

export const useSettings = create<SettingsState>()((set, get) => {
  function commit(patch: Partial<SettingsData>) {
    const next = { ...get(), ...patch } as SettingsState;
    persist(next);
    set(patch);
  }

  return {
    ...load(),
    setUnits: (units) => commit({ units }),
    setTheme: (theme) => {
      commit({ theme });
      applyTheme(theme);
    },
    addCustomType: (label, color, icon) => {
      const t: CustomEventType = { id: uid(), label: label.trim(), color, icon };
      commit({
        customTypes: [...get().customTypes, t],
        logOrder: [...get().logOrder, t.id],
      });
    },
    removeCustomType: (id) => {
      commit({
        customTypes: get().customTypes.filter((c) => c.id !== id),
        logOrder: get().logOrder.filter((x) => x !== id),
        hiddenTypes: get().hiddenTypes.filter((x) => x !== id),
        rhythmOrder: get().rhythmOrder.filter((x) => x !== id),
      });
    },
    updateCustomType: (id, label, color, icon) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      commit({
        customTypes: get().customTypes.map((c) =>
          c.id === id ? { ...c, label: trimmed, color, icon } : c,
        ),
      });
    },
    addRhythmEntry: (id) => {
      if (get().rhythmOrder.includes(id)) return;
      commit({ rhythmOrder: [...get().rhythmOrder, id] });
    },
    removeRhythmEntry: (id) => {
      commit({ rhythmOrder: get().rhythmOrder.filter((x) => x !== id) });
    },
    moveRhythmEntry: (id, dir) => {
      const order = [...get().rhythmOrder];
      const i = order.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return;
      [order[i], order[j]] = [order[j], order[i]];
      commit({ rhythmOrder: order });
    },
    moveLogType: (id, dir) => {
      const order = [...get().logOrder];
      const i = order.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return;
      [order[i], order[j]] = [order[j], order[i]];
      commit({ logOrder: order });
    },
    toggleHiddenType: (id) => {
      const hidden = get().hiddenTypes;
      commit({
        hiddenTypes: hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id],
      });
    },
  };
});

/** Type ids shown in the log picker, in configured order (hidden excluded). */
export function visiblePickerIds(s: Pick<SettingsData, 'logOrder' | 'hiddenTypes'>): string[] {
  const visible = s.logOrder.filter((id) => !s.hiddenTypes.includes(id));
  return visible.length ? visible : [...s.logOrder];
}
