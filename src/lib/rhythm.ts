import type { CareEvent, Child, EventType } from './types';
import { BUILTIN_EVENT_TYPES } from './types';
import { ageInWeeks, ageLabel } from './utils';

/**
 * Rhythm — "when was the last…" for the entries the user chose to show on
 * the home screen.
 *
 * Purely factual: it measures how long ago the latest entry of each kind was,
 * and shows that against a typical interval band for the child's age. The
 * bands are common published ranges (feeds, naps, diapers only) and are not
 * medical advice; other entry types just show the elapsed time.
 */

export interface RhythmItem {
  /** Built-in event type, or the id of a custom type. */
  key: string;
  /** Start of the latest entry (or of the ongoing sleep, when asleep). */
  lastAt: Date | null;
  /** Minutes since lastAt; null when there are no entries. */
  elapsedMin: number | null;
  /** Typical interval band for this age, minutes; null when the type has no published band. */
  typical: [number, number] | null;
  /** 0..1+ progress against the top of the band (null without a band). */
  progress: number | null;
  /** Sleep only: a sleep is in progress right now. */
  asleep: boolean;
}

interface Band {
  maxWeeks: number;
  feed: [number, number];
  nap: [number, number];
  diaper: [number, number];
}

const BANDS: Band[] = [
  { maxWeeks: 12, feed: [90, 150], nap: [120, 240], diaper: [90, 240] },
  { maxWeeks: 26, feed: [120, 240], nap: [180, 300], diaper: [120, 300] },
  { maxWeeks: 52, feed: [150, 300], nap: [240, 360], diaper: [180, 360] },
  { maxWeeks: Infinity, feed: [180, 360], nap: [300, 420], diaper: [180, 360] },
];

export interface Rhythm {
  items: RhythmItem[];
  ageWeeks: number;
  ageText: string;
  /** The most overdue banded item, for the header chip. */
  attention: RhythmItem | null;
}

/**
 * Compute the rhythm for the given entry order. `order` holds built-in
 * event types and custom type ids (anything that is not a built-in is
 * treated as a custom type id).
 */
export function computeRhythm(
  child: Child,
  events: CareEvent[],
  order: string[],
  now: Date = new Date(),
): Rhythm {
  const ageWeeks = ageInWeeks(child.birth_date, now);
  const band = BANDS.find((b) => ageWeeks <= b.maxWeeks) ?? BANDS[BANDS.length - 1];

  const latest = (type: EventType, customTypeId?: string): CareEvent | undefined => {
    const list = events.filter(
      (e) =>
        e.child_id === child.id &&
        !e.deleted &&
        (customTypeId
          ? e.type === 'custom' && e.custom_type_id === customTypeId
          : e.type === type) &&
        new Date(e.start_time) <= now &&
        // Pump sessions are not feeds of the baby.
        !(type === 'feed' && e.feed_method === 'pump'),
    );
    list.sort((a, b) => b.start_time.localeCompare(a.start_time));
    return list[0];
  };

  const make = (
    key: string,
    typical: [number, number] | null,
    lastAt: Date | null,
    asleep = false,
  ): RhythmItem => {
    const elapsedMin = lastAt ? Math.max(0, (now.getTime() - lastAt.getTime()) / 60000) : null;
    return {
      key,
      lastAt,
      elapsedMin,
      typical,
      progress:
        elapsedMin != null && typical ? Math.min(1.25, elapsedMin / typical[1]) : null,
      asleep,
    };
  };

  // For sleep, "how long ago" means since waking (or since sleep started,
  // when asleep right now) — that matches nap rhythm better.
  const lastSleep = latest('sleep');
  const asleep = !!lastSleep && (!lastSleep.end_time || new Date(lastSleep.end_time) > now);
  const sleepLastAt = lastSleep
    ? asleep
      ? new Date(lastSleep.start_time)
      : new Date(lastSleep.end_time ?? lastSleep.start_time)
    : null;

  const items = order.map((key): RhythmItem => {
    if (key === 'feed') {
      const last = latest('feed');
      return make(key, band.feed, last ? new Date(last.start_time) : null);
    }
    if (key === 'sleep') return make(key, band.nap, sleepLastAt, asleep);
    if (key === 'diaper') {
      const last = latest('diaper');
      return make(key, band.diaper, last ? new Date(last.start_time) : null);
    }
    // Other built-ins and custom types: "how long ago", without a band.
    const isBuiltin = (BUILTIN_EVENT_TYPES as readonly string[]).includes(key);
    const last = isBuiltin ? latest(key as EventType) : latest('custom', key);
    return make(key, null, last ? new Date(last.start_time) : null);
  });

  // Most overdue banded item: highest progress that is actually due (>= 0.6).
  const attention =
    [...items]
      .filter((i) => i.progress != null && i.progress >= 0.6 && !i.asleep)
      .sort((a, b) => b.progress! - a.progress!)[0] ?? null;

  return { items, ageWeeks, ageText: ageLabel(child.birth_date, now), attention };
}

/** "just now", "45m", "2h 05m", "45d 4h" (days once past a day). */
export function elapsedLabel(mins: number): string {
  if (mins < 1) return 'just now';
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h < 24) return m ? `${h}h ${m.toString().padStart(2, '0')}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hd = h % 24;
  return hd ? `${d}d ${hd}h` : `${d}d`;
}

/** "1h 30m–2h 30m" from a [min, max] band. */
export function bandLabel([lo, hi]: [number, number]): string {
  const f = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
  };
  return `${f(lo)}–${f(hi)}`;
}
