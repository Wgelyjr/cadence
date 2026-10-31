import { differenceInDays, differenceInWeeks, parseISO } from 'date-fns';
import type { CareEvent, Child } from './types';

/**
 * A unique id that is always a valid RFC 4122 v4 UUID.
 *
 * crypto.randomUUID only exists in secure contexts (HTTPS or localhost).
 * Over plain HTTP — e.g. the app served on a LAN IP — it is undefined, and
 * the old `id-<ts>-<rand>` fallback is not a valid Postgres `uuid`, which
 * broke sync. crypto.getRandomValues works everywhere, so we build the UUID
 * from it instead.
 */
export const uid = (): string => {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    if (typeof crypto.getRandomValues === 'function') {
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40; // version 4
      b[8] = (b[8] & 0x3f) | 0x80; // variant 10
      const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }
  }
  // Very old browsers only — not a valid UUID, but at least unique.
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const nowIso = () => new Date().toISOString();

/** Whole weeks of age (floored), never negative. */
export function ageInWeeks(birthDate: string, at: Date = new Date()): number {
  const b = parseISO(birthDate);
  return Math.max(0, differenceInWeeks(at, b));
}

/** Compact human age, e.g. "3w 2d old", "5mo old", "1y 4mo". */
export function ageLabel(birthDate: string, at: Date = new Date()): string {
  const days = Math.max(0, differenceInDays(at, parseISO(birthDate)));
  if (days < 14) return `${days}d old`;
  if (days < 70) return `${Math.floor(days / 7)}w ${days % 7}d old`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months}mo old`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem ? `${years}y ${rem}mo` : `${years}y`;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportJSON(children: Child[], events: CareEvent[], childName: string) {
  const payload = {
    app: 'Cadence',
    exported_at: nowIso(),
    version: 1,
    children,
    events,
  };
  const safe = (childName || 'baby').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  download(
    `cadence-${safe}-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(payload, null, 2),
    'application/json',
  );
}

const CSV_COLUMNS: Array<{ key: keyof CareEvent; header: string }> = [
  { key: 'type', header: 'type' },
  { key: 'start_time', header: 'start_time' },
  { key: 'end_time', header: 'end_time' },
  { key: 'sleep_kind', header: 'sleep_kind' },
  { key: 'feed_method', header: 'feed_method' },
  { key: 'feed_side', header: 'feed_side' },
  { key: 'feed_side_duration_min', header: 'feed_side_min' },
  { key: 'bottle_ml', header: 'bottle_ml' },
  { key: 'pump_ml', header: 'pump_ml' },
  { key: 'diaper_type', header: 'diaper_type' },
  { key: 'stool_color', header: 'stool_color' },
  { key: 'stool_consistency', header: 'stool_consistency' },
  { key: 'height_cm', header: 'height_cm' },
  { key: 'weight_kg', header: 'weight_kg' },
  { key: 'head_cm', header: 'head_cm' },
  { key: 'temp_c', header: 'temp_c' },
  { key: 'medicine_name', header: 'medicine_name' },
  { key: 'medicine_dose', header: 'medicine_dose' },
  { key: 'label', header: 'label' },
  { key: 'food_items', header: 'food_items' },
  { key: 'allergy_reaction', header: 'allergy_reaction' },
  { key: 'allergy_severity', header: 'allergy_severity' },
  { key: 'contraction_duration_sec', header: 'contraction_sec' },
  { key: 'note', header: 'note' },
];

function csvCell(value: unknown): string {
  if (value == null) return '';
  const s = Array.isArray(value) ? value.join('; ') : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportCSV(children: Child[], events: CareEvent[], childName: string) {
  const childById = new Map(children.map((c) => [c.id, c.name]));
  const header = ['child', ...CSV_COLUMNS.map((c) => c.header)].join(',');
  const rows = [...events]
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((e) =>
      [
        csvCell(childById.get(e.child_id) ?? childName),
        ...CSV_COLUMNS.map((c) => csvCell(e[c.key])),
      ].join(','),
    );
  const safe = (childName || 'baby').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  download(
    `cadence-${safe}-${new Date().toISOString().slice(0, 10)}.csv`,
    [header, ...rows].join('\n'),
    'text/csv',
  );
}
