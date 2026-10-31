import type { CareEvent } from './types';

/**
 * The last entry logged per child, so the log card can open pre-populated
 * for rapid re-logging (e.g. another 4 oz bottle).
 *
 * Only the type and its detail fields are stored — in canonical units
 * (ml/kg/cm/°C, as on the event row), never display-unit strings, so a
 * units switch can't corrupt the prefill. Times, notes and photos are
 * deliberately excluded: a new entry starts at "now" with a blank note.
 */

const key = (childId: string) => `babyapp:lastEntry:${childId}`;

const STORED_KEYS = [
  'type',
  'sleep_kind',
  'feed_method',
  'feed_side',
  'feed_side_duration_min',
  'bottle_ml',
  'pump_ml',
  'diaper_type',
  'stool_color',
  'stool_consistency',
  'height_cm',
  'weight_kg',
  'head_cm',
  'temp_c',
  'medicine_name',
  'medicine_dose',
  'label',
  'food_items',
  'allergy_reaction',
  'allergy_severity',
  'contraction_duration_sec',
  'custom_type_id',
  'custom_label',
] as const;

export function saveLastEntry(childId: string, event: CareEvent): void {
  const stored: Record<string, unknown> = {};
  for (const k of STORED_KEYS) {
    const v = (event as unknown as Record<string, unknown>)[k];
    if (v !== undefined && v !== '') stored[k] = v;
  }
  try {
    localStorage.setItem(key(childId), JSON.stringify(stored));
  } catch {
    /* private mode etc. — prefill just won't persist */
  }
}

export function loadLastEntry(childId: string): CareEvent | null {
  try {
    const raw = localStorage.getItem(key(childId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<CareEvent>;
    if (!p || typeof p.type !== 'string') return null;
    return p as CareEvent;
  } catch {
    return null;
  }
}
