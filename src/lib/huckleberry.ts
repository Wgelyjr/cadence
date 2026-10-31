import type { CareEvent } from './types';
import { CM_PER_IN, KG_PER_LB, ML_PER_OZ, round1, round2 } from './units';

/**
 * Huckleberry CSV import.
 *
 * Huckleberry exports one CSV per child profile. All event types share a
 * single table (current exports have 9 columns; the meaning of the side
 * columns depends on `Type`):
 *
 *   Type, Start, End, Duration, Start Condition, Start Location, End Condition, Notes, Logged By
 *
 *   Sleep  → End = wake time, Start Condition = context label ("Crib")
 *   Feed   → bottle: Start Condition = milk type ("Breast Milk"),
 *            Start Location = "Bottle", End Condition = volume ("4oz")
 *            nursing: side + duration in the condition columns
 *            ("00:10R" = 10 min on the right, "00:10R" + "00:10L" = both)
 *   Pump   → Start Condition = volume ("2.75oz")
 *   Diaper → Start Condition = stool color, Start Location = consistency
 *            ("Loose"), Notes = "Poo:medium" / "Pee:large" /
 *            "Both |  pee:medium poo:small"
 *   Growth → Start Condition = weight, Start Location = length,
 *            End Condition = head ("7.46lbs.oz" = 7 lb 4.6 oz,
 *            "1.63ft.in" = 1 ft 6.3 in)
 *
 * Quirks we must respect:
 *  - `Start`/`End` are local timestamps with no timezone suffix — current
 *    exports use "YYYY-MM-DD HH:MM"; "DD/MM/YY HH:MM" (2-digit years) is
 *    also accepted. Both are interpreted in the importing device's local
 *    timezone.
 *  - Values may carry a unit suffix ("9.02kg", "69cm", "60ml"); unitless
 *    values are assumed metric. Imperial compound growth units put the
 *    small unit in the fractional part ("7.46lbs.oz" = 7 lb + 4.6 oz).
 *    Everything is stored in canonical metric (ml, kg, cm), like the rest
 *    of the app.
 */

export interface HuckleberryRow {
  /** 1-based line number in the file, for reporting. */
  line: number;
  /** Mapped event, when the row could be parsed. */
  event?: Partial<CareEvent>;
  /** Why the row was rejected, if any. */
  error?: string;
}

export interface HuckleberryParse {
  rows: HuckleberryRow[];
  /** Count of valid rows per mapped event type. */
  counts: Record<string, number>;
  /** [earliest, latest] ISO timestamps, when any row parsed. */
  range: [string, string] | null;
  /** Total data rows in the file. */
  total: number;
  /** Rows that parsed. */
  ok: number;
  /** Rows that were rejected. */
  failed: number;
}

// --- CSV ---------------------------------------------------------------------

/**
 * Minimal RFC 4180 CSV parser: quoted fields, embedded commas and newlines,
 * CRLF and lone CR/LF line endings.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) pushRow();

  // Drop rows that are entirely empty (trailing blank lines).
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// --- Dates -------------------------------------------------------------------

/** Year first, as current exports use: "2026-10-30 14:25" (optional seconds, "T" or "." dividers). */
const ISO_DATE_RE = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
/** Day first, as older exports used: "30/10/26 14:25" (2- or 4-digit year). */
const DMY_DATE_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;

function buildDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, hour, minute, second);
  // Guard against rollover (e.g. 32/02/26 producing a March date).
  if (d.getDate() !== day || d.getMonth() !== month - 1) return null;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseHuckleberryDate(raw: string): Date | null {
  const t = raw.trim();
  // Year-first is unambiguous (4-digit year) and is what current exports use.
  const iso = ISO_DATE_RE.exec(t);
  if (iso)
    return buildDate(
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
      iso[4] != null ? Number(iso[4]) : 0,
      iso[5] != null ? Number(iso[5]) : 0,
      iso[6] != null ? Number(iso[6]) : 0,
    );
  const dmy = DMY_DATE_RE.exec(t);
  if (!dmy) return null;
  let year = Number(dmy[3]);
  if (year < 100) year += year < 70 ? 2000 : 1900;
  return buildDate(
    year,
    Number(dmy[2]),
    Number(dmy[1]),
    dmy[4] != null ? Number(dmy[4]) : 0,
    dmy[5] != null ? Number(dmy[5]) : 0,
    dmy[6] != null ? Number(dmy[6]) : 0,
  );
}

// --- Measurements ------------------------------------------------------------

type MeasureKind = 'ml' | 'kg' | 'cm';

const FACTORS: Record<MeasureKind, Record<string, number>> = {
  ml: {
    ml: 1,
    mls: 1,
    milliliter: 1,
    milliliters: 1,
    millilitre: 1,
    millilitres: 1,
    oz: ML_PER_OZ,
    'fl oz': ML_PER_OZ,
    ounce: ML_PER_OZ,
    ounces: ML_PER_OZ,
  },
  kg: {
    kg: 1,
    'kg.': 1,
    kilogram: 1,
    kilograms: 1,
    kilo: 1,
    kgs: 1,
    lb: KG_PER_LB,
    lbs: KG_PER_LB,
    pound: KG_PER_LB,
    pounds: KG_PER_LB,
  },
  cm: {
    cm: 1,
    cms: 1,
    centimeter: 1,
    centimeters: 1,
    centimetre: 1,
    centimetres: 1,
    in: CM_PER_IN,
    inch: CM_PER_IN,
    inches: CM_PER_IN,
    ft: 12 * CM_PER_IN,
    feet: 12 * CM_PER_IN,
  },
};

/**
 * Imperial compound units Huckleberry uses for growth: "7.46lbs.oz" is
 * 7 lb + 4.6 oz, "1.63ft.in" is 1 ft + 6.3 in — the integer part is the
 * large unit, the fractional part the small unit in tenths.
 */
const COMPOUND_UNITS: Record<MeasureKind, Record<string, { per: number; smallPerWhole: number }>> = {
  ml: {},
  kg: {
    // "per" is the factor of the SMALL unit (oz), "smallPerWhole" how many
    // of it make the large unit (lb).
    'lb.oz': { per: KG_PER_LB / 16, smallPerWhole: 16 },
    'lbs.oz': { per: KG_PER_LB / 16, smallPerWhole: 16 },
  },
  cm: {
    'ft.in': { per: CM_PER_IN, smallPerWhole: 12 },
  },
};

/**
 * Extract the first measurement from a cell like "9.02kg", "10 ml",
 * "Left 10ml, right 8ml". A unit suffix is honored (oz/lb/in are converted);
 * a unitless number is assumed metric. Returns null when no measurement is
 * present or the unit is not recognized — callers keep the raw text in the
 * note so nothing is silently lost.
 */
function extractMeasurement(raw: string | undefined, kind: MeasureKind): number | null {
  if (!raw) return null;
  const m = /([0-9]+(?:[.,][0-9]+)?)\s*([a-zA-Z. ]{0,10})/.exec(raw.trim());
  if (!m) return null;
  const value = Number.parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  const unit = m[2].trim().toLowerCase();
  if (!unit) return value; // no suffix → assume metric
  const compound = COMPOUND_UNITS[kind][unit];
  if (compound) {
    const whole = Math.trunc(value);
    const small = Math.round((value - whole) * 100) / 10; // 0.46 → 4.6
    // Total the small units, then convert: 7 lb 4.6 oz → 116.6 oz; 1 ft 6.3 in → 18.3 in.
    return (whole * compound.smallPerWhole + small) * compound.per;
  }
  const factor = FACTORS[kind][unit];
  return factor == null ? null : value * factor;
}

// --- Row mapping -------------------------------------------------------------

const HEADER_COLUMNS = ['type', 'start', 'end', 'start condition', 'start location', 'end condition', 'notes'];

/** "00:10R" / "12:30L" — nursing side + duration in minutes:seconds. */
const NURSE_SIDE_RE = /^(\d{1,3}):(\d{2})\s*([LRlr])$/;
function parseNurseSide(raw: string): { min: number; side: 'left' | 'right' } | null {
  const m = NURSE_SIDE_RE.exec(raw.trim());
  if (!m) return null;
  return {
    min: Number(m[1]) * 60 + Number(m[2]),
    side: m[3].toLowerCase() === 'l' ? 'left' : 'right',
  };
}

/** Stool colors Huckleberry records (in the Duration column for diapers). */
const STOOL_COLORS = new Set([
  'black', 'brown', 'yellow', 'green', 'white', 'red', 'orange', 'tan', 'grey', 'gray', 'blue', 'pink', 'clear',
]);

function mapRow(line: number, cols: Record<string, string>): HuckleberryRow {
  const type = cols['type'] ?? '';
  const startRaw = (cols['start'] ?? '').trim();
  const endRaw = (cols['end'] ?? '').trim();
  const startCond = (cols['start condition'] ?? '').trim();
  const startLoc = (cols['start location'] ?? '').trim();
  const endCond = (cols['end condition'] ?? '').trim();
  const notes = (cols['notes'] ?? '').trim();
  // Optional column (present in current 9-column exports). For diapers it
  // carries the stool color; for feeds the total nursing duration.
  const duration = (cols['duration'] ?? '').trim();

  const start = parseHuckleberryDate(startRaw);
  if (!start) return { line, error: `Unreadable start time “${startRaw || '∅'}”` };

  let end: Date | null = null;
  if (endRaw) {
    end = parseHuckleberryDate(endRaw);
    if (!end) return { line, error: `Unreadable end time “${endRaw}”` };
  }

  const ev: Partial<CareEvent> = { start_time: start.toISOString() };
  if (end) ev.end_time = end.toISOString();
  const noteBits: string[] = [];

  switch (type.trim().toLowerCase()) {
    case 'sleep': {
      ev.type = 'sleep';
      if (end) ev.sleep_kind = end.getTime() - start.getTime() >= 4 * 3600e3 ? 'night' : 'nap';
      if (startCond) noteBits.push(startCond); // e.g. "Crib"
      break;
    }
    case 'feed': {
      ev.type = 'feed';
      const sideStart = parseNurseSide(startCond);
      const sideEnd = endCond ? parseNurseSide(endCond) : null;
      if (sideStart || sideEnd) {
        // Nursing with per-side durations, e.g. "00:10R" (+ "00:10L").
        ev.feed_method = 'nursing';
        if (sideStart && sideEnd) {
          ev.feed_side = 'both';
          ev.feed_side_duration_min = Math.round((sideStart.min + sideEnd.min) / 2);
        } else {
          const s = sideStart ?? sideEnd!;
          ev.feed_side = s.side;
          ev.feed_side_duration_min = s.min;
        }
        if (startLoc) noteBits.push(startLoc);
        break;
      }
      const method: CareEvent['feed_method'] = /bottle/i.test(startLoc)
        ? 'bottle'
        : /breast|nursing/i.test(startLoc)
          ? 'nursing'
          : undefined;
      ev.feed_method = method;
      const vol = extractMeasurement(endCond, 'ml');
      if (vol != null) {
        if (method !== 'nursing') ev.bottle_ml = Math.round(vol);
        else noteBits.push(`~${Math.round(vol)} ml`);
      } else if (endCond) {
        noteBits.push(endCond);
      }
      if (startLoc && !method) noteBits.push(startLoc);
      // Milk type for bottles ("Breast Milk", "Formula").
      if (startCond && method === 'bottle') noteBits.push(startCond);
      break;
    }
    case 'pump': {
      // Pumping is modeled as a feed of method "pump" (see EventForm).
      ev.type = 'feed';
      ev.feed_method = 'pump';
      const vol = extractMeasurement(startCond, 'ml');
      if (vol != null) ev.pump_ml = Math.round(vol);
      else if (startCond) noteBits.push(startCond);
      break;
    }
    case 'diaper': {
      ev.type = 'diaper';
      // The wet/soiled marker ("Poo:medium", "Pee:large", "Both, pee:… poo:…")
      // lives in the End Condition column in current exports; fall back to the
      // other columns so a reordered export still maps.
      const marker = [endCond, notes, startLoc].join(' ').toLowerCase();
      const wet = /pee|urine|wet|piss/.test(marker);
      const dirty = /poo|poop|stool|bowel|dirty|soil|crap/.test(marker);
      if (wet && dirty) ev.diaper_type = 'mixed';
      else if (dirty) ev.diaper_type = 'dirty';
      else if (wet) ev.diaper_type = 'wet';
      const hasStool = ev.diaper_type === 'dirty' || ev.diaper_type === 'mixed';
      // Stool color is recorded in the Duration column by Huckleberry.
      if (duration && STOOL_COLORS.has(duration.toLowerCase())) {
        if (hasStool) ev.stool_color = duration.toLowerCase();
        else noteBits.push(duration);
      } else if (duration) {
        noteBits.push(duration);
      }
      // Consistency ("Loose", "Solid", …) is in the Start Condition column.
      if (startCond) {
        if (hasStool) ev.stool_consistency = startCond;
        else noteBits.push(startCond);
      }
      if (startLoc) noteBits.push(startLoc); // e.g. "Diaper rash"
      // Keep the raw marker so the stool size ("Poo:large") isn't lost — the
      // app has no dedicated size field.
      if (endCond) noteBits.push(endCond);
      break;
    }
    case 'growth': {
      ev.type = 'growth';
      const weight = extractMeasurement(startCond, 'kg');
      const height = extractMeasurement(startLoc, 'cm');
      const head = extractMeasurement(endCond, 'cm');
      if (weight != null) ev.weight_kg = round2(weight);
      else if (startCond) noteBits.push(startCond);
      if (height != null) ev.height_cm = round1(height);
      else if (startLoc) noteBits.push(startLoc);
      if (head != null) ev.head_cm = round1(head);
      else if (endCond) noteBits.push(endCond);
      break;
    }
    default:
      return { line, error: `Unknown type “${type.trim() || '∅'}”` };
  }

  const note = [...noteBits, notes].filter(Boolean).join(' · ');
  if (note) ev.note = note;
  return { line, event: ev };
}

// --- Entry point ---------------------------------------------------------------

export function parseHuckleberry(text: string): HuckleberryParse {
  const grid = parseCsv(text);

  // The header row contains at least "Type" and "Start"; find it within the
  // first few rows in case of a BOM or stray leading line.
  let headerIdx = -1;
  let colIdx: Record<string, number> = {};
  for (let i = 0; i < Math.min(grid.length, 5); i++) {
    const headers = grid[i].map((c) => c.replace(/^\ufeff/, '').trim().toLowerCase());
    if (headers.includes('type') && headers.some((h) => h.startsWith('start') && h !== 'start condition' && h !== 'start location')) {
      headerIdx = i;
      colIdx = {};
      headers.forEach((h, j) => {
        if (!(h in colIdx)) colIdx[h] = j;
      });
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error('Could not find a Huckleberry header row (Type, Start, …). Is this a Huckleberry CSV export?');
  }
  const missing = HEADER_COLUMNS.filter((c) => !(c in colIdx));
  if (missing.length) {
    throw new Error(`Missing expected column(s): ${missing.join(', ')}`);
  }

  const rows: HuckleberryRow[] = [];
  const counts: Record<string, number> = {};
  let lo: string | null = null;
  let hi: string | null = null;

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const cells = grid[i];
    const cols: Record<string, string> = {};
    // Copy every recognized column (not just the required set) so optional
    // ones like "duration" are available when present.
    for (const [name, j] of Object.entries(colIdx)) cols[name] = (cells[j] ?? '').trim();
    if (!cells.some((c) => c.trim() !== '')) continue;
    const row = mapRow(i + 1, cols);
    rows.push(row);
    const ev = row.event;
    if (ev?.type) {
      counts[ev.type] = (counts[ev.type] ?? 0) + 1;
      const t = ev.start_time;
      if (t) {
        if (lo == null || t < lo) lo = t;
        if (hi == null || t > hi) hi = t;
      }
    }
  }

  const ok = rows.filter((r) => r.event).length;
  return {
    rows,
    counts,
    range: lo && hi ? [lo, hi] : null,
    total: rows.length,
    ok,
    failed: rows.length - ok,
  };
}
