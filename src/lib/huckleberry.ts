import type { CareEvent } from './types';
import { CM_PER_IN, KG_PER_LB, ML_PER_OZ, round1, round2 } from './units';

/**
 * Huckleberry CSV import.
 *
 * Huckleberry exports one CSV per child profile. All event types share a
 * single table, and the meaning of the side columns depends on `Type`:
 *
 *   Type | Start | End | Start Condition | Start Location | End Condition | Notes
 *
 *   Sleep  → End = wake time, Start Condition = context label ("Crib")
 *   Feed   → Start Location = method ("Breast Milk Bottle"), End Condition = volume
 *   Pump   → Start Condition = volume ("10ml")
 *   Diaper → wet/soiled usually only in Notes
 *   Growth → Start Condition = weight, Start Location = length, End Condition = head
 *
 * Quirks we must respect:
 *  - `Start` is a local timestamp "DD/MM/YY HH:MM" with no timezone suffix —
 *    it is interpreted in the importing device's local timezone.
 *  - Values may carry a unit suffix ("9.02kg", "69cm", "60ml"); unitless
 *    values are assumed metric. Everything is stored in canonical metric
 *    (ml, kg, cm), like the rest of the app.
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

/** "DD/MM/YY HH:MM" (also tolerates 4-digit years, "T" separator, ". " dividers). */
const DATE_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?)?/;

export function parseHuckleberryDate(raw: string): Date | null {
  const m = DATE_RE.exec(raw.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += year < 70 ? 2000 : 1900;
  const hour = m[4] != null ? Number(m[4]) : 0;
  const minute = m[5] != null ? Number(m[5]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, hour, minute);
  // Guard against rollover (e.g. 32/02/26 producing a March date).
  if (d.getDate() !== day || d.getMonth() !== month - 1) return null;
  return Number.isNaN(d.getTime()) ? null : d;
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
  const factor = FACTORS[kind][unit];
  return factor == null ? null : value * factor;
}

// --- Row mapping -------------------------------------------------------------

const HEADER_COLUMNS = ['type', 'start', 'end', 'start condition', 'start location', 'end condition', 'notes'];

function mapRow(line: number, cols: Record<string, string>): HuckleberryRow {
  const type = cols['type'] ?? '';
  const startRaw = (cols['start'] ?? '').trim();
  const endRaw = (cols['end'] ?? '').trim();
  const startCond = (cols['start condition'] ?? '').trim();
  const startLoc = (cols['start location'] ?? '').trim();
  const endCond = (cols['end condition'] ?? '').trim();
  const notes = (cols['notes'] ?? '').trim();

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
      const text = `${startCond} ${notes}`.toLowerCase();
      const wet = /wet|pee|urine/.test(text);
      const dirty = /dirty|soil|stool|poop|bowel/.test(text);
      if (wet && dirty) ev.diaper_type = 'mixed';
      else if (dirty) ev.diaper_type = 'dirty';
      else if (wet) ev.diaper_type = 'wet';
      if (startCond) noteBits.push(startCond);
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
    for (const name of HEADER_COLUMNS) cols[name] = (cells[colIdx[name]] ?? '').trim();
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
