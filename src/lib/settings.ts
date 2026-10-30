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
}

interface SettingsData {
  units: Units;
  theme: Theme;
  customTypes: CustomEventType[];
  /** Ordered type ids for the log picker (built-ins + custom). */
  logOrder: string[];
  /** Type ids hidden from the log picker. */
  hiddenTypes: string[];
}

const KEY = 'babyapp:settings';

function fallback(): SettingsData {
  return {
    units: 'metric',
    theme: 'system',
    customTypes: [],
    logOrder: [...BUILTIN_EVENT_TYPES],
    hiddenTypes: [],
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
        ? p.customTypes.filter((c) => c && typeof c.id === 'string' && typeof c.label === 'string')
        : [],
      logOrder: Array.isArray(p.logOrder) ? p.logOrder.filter((x) => typeof x === 'string') : [],
      hiddenTypes: Array.isArray(p.hiddenTypes) ? p.hiddenTypes.filter((x) => typeof x === 'string') : [],
    };
    // Keep the order list consistent with what actually exists
    // (new built-ins appended, deleted customs dropped).
    const ids = [...BUILTIN_EVENT_TYPES, ...data.customTypes.map((c) => c.id)];
    const order = data.logOrder.filter((id) => ids.includes(id));
    for (const id of ids) if (!order.includes(id)) order.push(id);
    data.logOrder = order;
    data.hiddenTypes = data.hiddenTypes.filter((id) => ids.includes(id));
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
      }),
    );
  } catch {
    /* private mode etc. — settings just won't persist */
  }
}

interface SettingsState extends SettingsData {
  setUnits: (u: Units) => void;
  setTheme: (t: Theme) => void;
  addCustomType: (label: string, color: string) => void;
  removeCustomType: (id: string) => void;
  moveLogType: (id: string, dir: -1 | 1) => void;
  toggleHiddenType: (id: string) => void;
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
    addCustomType: (label, color) => {
      const t: CustomEventType = { id: uid(), label: label.trim(), color };
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
      });
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
