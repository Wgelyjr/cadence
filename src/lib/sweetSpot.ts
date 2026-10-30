import type { CareEvent, Child } from './types';
import { ageInWeeks } from './utils';

/**
 * SweetSpot — nap & bedtime prediction.
 *
 * A transparent, age-based heuristic (NOT medical advice). It uses typical
 * wake windows for the child's age and the most recent wake-up to suggest a
 * "sweet spot" window for the next nap and for bedtime.
 *
 * Wake windows below are common published ranges for healthy infants; treat
 * them as a starting point and adjust to your child.
 */

interface AgeBand {
  maxWeeks: number; // inclusive upper bound
  napsPerDay: number;
  wake: [number, number]; // daytime wake window, minutes
  evening: [number, number]; // evening wake window, minutes
}

const BANDS: AgeBand[] = [
  { maxWeeks: 6, napsPerDay: 4, wake: [45, 60], evening: [45, 60] },
  { maxWeeks: 12, napsPerDay: 3, wake: [60, 90], evening: [90, 120] },
  { maxWeeks: 20, napsPerDay: 3, wake: [120, 150], evening: [150, 180] },
  { maxWeeks: 32, napsPerDay: 2, wake: [150, 180], evening: [180, 240] },
  { maxWeeks: 52, napsPerDay: 2, wake: [180, 240], evening: [240, 300] },
  { maxWeeks: 78, napsPerDay: 1, wake: [240, 300], evening: [300, 360] },
  { maxWeeks: Infinity, napsPerDay: 1, wake: [300, 420], evening: [360, 480] },
];

export interface SweetSpot {
  ageWeeks: number;
  napsPerDay: number;
  wakeWindow: [number, number];
  eveningWindow: [number, number];
  currentlyAsleep: boolean;
  lastWake: Date;
  nextNapStart: Date;
  nextNapLatest: Date;
  bedtimeStart: Date;
  bedtimeLatest: Date;
  minutesToNap: number;
  minutesToBed: number;
  /** 0 = fresh, ~1 = top of wake window, >1 = overtired. */
  tiredness: number;
}

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

export function computeSweetSpot(
  child: Child,
  events: CareEvent[],
  now: Date = new Date(),
): SweetSpot {
  const ageWeeks = ageInWeeks(child.birth_date, now);
  const band = BANDS.find((b) => ageWeeks <= b.maxWeeks) ?? BANDS[BANDS.length - 1];

  const sleeps = events
    .filter(
      (e) =>
        e.child_id === child.id &&
        e.type === 'sleep' &&
        !e.deleted &&
        new Date(e.start_time) <= now,
    )
    .sort((a, b) => b.start_time.localeCompare(a.start_time));

  let currentlyAsleep = false;
  let lastWake: Date = now;

  const active = sleeps.find((s) => !s.end_time || new Date(s.end_time) > now);
  if (active) {
    currentlyAsleep = true;
    const before = sleeps.find(
      (s) => s !== active && s.end_time && new Date(s.end_time) <= now,
    );
    lastWake =
      before && before.end_time ? new Date(before.end_time) : new Date(active.start_time);
  } else {
    const ended = sleeps.find((s) => s.end_time && new Date(s.end_time) <= now);
    lastWake = ended && ended.end_time ? new Date(ended.end_time) : now;
  }

  const elapsedMin = (now.getTime() - lastWake.getTime()) / 60000;
  const tiredness = clamp((elapsedMin - band.wake[0]) / (band.wake[1] - band.wake[0]), 0, 1.3);

  const nextNapStart = new Date(lastWake.getTime() + band.wake[0] * 60000);
  const nextNapLatest = new Date(lastWake.getTime() + band.wake[1] * 60000);
  const bedtimeStart = new Date(lastWake.getTime() + band.evening[0] * 60000);
  const bedtimeLatest = new Date(lastWake.getTime() + band.evening[1] * 60000);

  return {
    ageWeeks,
    napsPerDay: band.napsPerDay,
    wakeWindow: band.wake,
    eveningWindow: band.evening,
    currentlyAsleep,
    lastWake,
    nextNapStart,
    nextNapLatest,
    bedtimeStart,
    bedtimeLatest,
    minutesToNap: Math.round((nextNapStart.getTime() - now.getTime()) / 60000),
    minutesToBed: Math.round((bedtimeStart.getTime() - now.getTime()) / 60000),
    tiredness,
  };
}

export type SpotStatus = 'early' | 'in-window' | 'past' | 'asleep';

export function napStatus(s: SweetSpot, now: Date = new Date()): SpotStatus {
  if (s.currentlyAsleep) return 'asleep';
  const t = now.getTime();
  if (t < s.nextNapStart.getTime()) return 'early';
  if (t <= s.nextNapLatest.getTime()) return 'in-window';
  return 'past';
}

export function fmtWindow(d1: Date, d2: Date): string {
  const f = (d: Date) =>
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${f(d1)} – ${f(d2)}`;
}
