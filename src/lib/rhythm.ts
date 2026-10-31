import type { CareEvent, Child } from './types';
import { ageInWeeks, ageLabel } from './utils';

/**
 * Rhythm — "when was the last…" for feeds, naps and diapers.
 *
 * Purely factual: it measures how long ago the latest entry of each kind was,
 * and shows that against a typical interval band for the child's age. The
 * bands are common published ranges, not medical advice.
 */

export type RhythmKey = 'feed' | 'sleep' | 'diaper';

export interface RhythmItem {
  key: RhythmKey;
  /** Start of the latest entry (or of the ongoing sleep, when asleep). */
  lastAt: Date | null;
  /** Minutes since lastAt; null when there are no entries. */
  elapsedMin: number | null;
  /** Typical interval band for this age, minutes. */
  typical: [number, number];
  /** 0..1+ progress against the top of the band (capped for display). */
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
  /** The most overdue item, for the header chip. */
  attention: RhythmItem | null;
}

export function computeRhythm(
  child: Child,
  events: CareEvent[],
  now: Date = new Date(),
): Rhythm {
  const ageWeeks = ageInWeeks(child.birth_date, now);
  const band = BANDS.find((b) => ageWeeks <= b.maxWeeks) ?? BANDS[BANDS.length - 1];

  const latest = (type: CareEvent['type']): CareEvent | undefined => {
    const list = events.filter(
      (e) =>
        e.child_id === child.id &&
        !e.deleted &&
        e.type === type &&
        new Date(e.start_time) <= now &&
        // Pump sessions are not feeds of the baby.
        !(type === 'feed' && e.feed_method === 'pump'),
    );
    list.sort((a, b) => b.start_time.localeCompare(a.start_time));
    return list[0];
  };

  const make = (
    key: RhythmKey,
    typical: [number, number],
    lastAt: Date | null,
    asleep = false,
  ): RhythmItem => {
    const elapsedMin = lastAt ? Math.max(0, (now.getTime() - lastAt.getTime()) / 60000) : null;
    return {
      key,
      lastAt,
      elapsedMin,
      typical,
      progress: elapsedMin != null ? Math.min(1.25, elapsedMin / typical[1]) : null,
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

  const items: RhythmItem[] = [
    make('feed', band.feed, latest('feed') ? new Date(latest('feed')!.start_time) : null),
    make('sleep', band.nap, sleepLastAt, asleep),
    make('diaper', band.diaper, latest('diaper') ? new Date(latest('diaper')!.start_time) : null),
  ];

  // Most overdue item: highest progress that is actually due (>= 0.6).
  const attention =
    [...items]
      .filter((i) => i.progress != null && i.progress >= 0.6 && !i.asleep)
      .sort((a, b) => b.progress! - a.progress!)[0] ?? null;

  return { items, ageWeeks, ageText: ageLabel(child.birth_date, now), attention };
}

/** "2h 05m", "45m", "just now". */
export function elapsedLabel(mins: number): string {
  if (mins < 1) return 'just now';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m.toString().padStart(2, '0')}m` : `${h}h`;
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
